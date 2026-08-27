import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { explain, fail, ok, type ToolResult } from "../format";
import { jsonSchemaFor, type ToolSpec } from "../registry";
import { READ_ONLY } from "./shared";

/**
 * Tool search, server-side.
 *
 * LifeOS has around forty tools. Advertising all of them would put forty
 * schemas into every conversation before the user has asked for anything, and
 * the client's tool cap and the model's accuracy both suffer for it. So the
 * everyday tools are advertised directly and the long tail lives here: two
 * tools that let a model find and call anything else on demand.
 *
 * The alternative — dropping the rare tools — would be cheaper still and much
 * worse. Nothing is missing; it just isn't shouted.
 */

/** Words too common in this domain to tell two tools apart. */
const STOPWORDS = new Set([
  "the", "a", "an", "my", "me", "i", "to", "for", "of", "in", "on", "and", "or",
  "is", "are", "do", "does", "how", "what", "can", "with", "from", "get", "it",
  "this", "that", "email", "emails", "mail", "please", "want", "need",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Plain lexical scoring — no embeddings, no network, no state. A tool's name
 * and keywords are worth far more than a word appearing somewhere in its
 * description, which is what stops "attachment" from matching every tool that
 * happens to mention attachments in passing.
 */
function score(spec: ToolSpec, terms: string[]): number {
  const name = spec.name.toLowerCase();
  const title = spec.title.toLowerCase();
  const description = spec.description.toLowerCase();
  const keywords = (spec.keywords ?? []).map((k) => k.toLowerCase());
  let total = 0;
  for (const term of terms) {
    if (name === term) total += 20;
    else if (name.includes(term)) total += 10;
    if (keywords.some((k) => k === term)) total += 8;
    else if (keywords.some((k) => k.includes(term))) total += 5;
    if (title.includes(term)) total += 3;
    if (description.includes(term)) total += 1;
  }
  // A whole phrase landing in a keyword beats any amount of word overlap.
  const phrase = terms.join(" ");
  if (phrase && keywords.some((k) => k.includes(phrase))) total += 10;
  return total;
}

function describe(spec: ToolSpec): Record<string, unknown> {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    surface: spec.surface,
    input_schema: jsonSchemaFor(spec.inputSchema),
    annotations: spec.annotations,
  };
}

/**
 * Register find_tools and run_tool over the specs this connection can reach.
 * `hidden` is what find_tools searches and run_tool will invoke; `visible` is
 * listed too, so a model browsing the catalogue sees the whole picture rather
 * than a confusing half of it.
 */
export function registerDiscoveryTools(
  server: McpServer,
  { hidden, visible }: { hidden: ToolSpec[]; visible: ToolSpec[] },
): void {
  const catalogue = [...visible, ...hidden];
  const callable = new Map(hidden.map((spec) => [spec.name, spec]));

  server.registerTool(
    "find_tools",
    {
      title: "Find more LifeOS tools",
      description:
        `Searches the ${catalogue.length} tools this connection can reach and returns their full input schemas. ` +
        "The tools listed alongside this one are the everyday ones; LifeOS can do considerably more than they show — " +
        "drafts, labels and folders, attachments, triage, RSVPs, free/busy, managing calendars. " +
        "Search here whenever the user asks for something the visible tools don't cover, before telling them it can't be done. " +
        "Then call what you find with run_tool.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'What you are trying to do, in the user\'s words — e.g. "save a draft to review later", "RSVP to this invite", "read the PDF attached". Omit it, or pass all: true, to see everything.',
          ),
        surface: z
          .enum(["email", "calendar"])
          .optional()
          .describe("Limit results to one half of LifeOS."),
        all: z
          .boolean()
          .default(false)
          .describe("Return the whole catalogue rather than the best matches."),
      },
      annotations: READ_ONLY,
    },
    async ({ query, surface, all }: { query?: string; surface?: string; all: boolean }) => {
      const pool = surface ? catalogue.filter((s) => s.surface === surface) : catalogue;
      const terms = query ? tokenize(query) : [];

      if (all || terms.length === 0) {
        return ok({
          tools: pool.map(describe),
          note: "Call any of these with run_tool. Tools already listed on this connection can be called directly.",
        });
      }

      const ranked = pool
        .map((spec) => ({ spec, points: score(spec, terms) }))
        .filter((entry) => entry.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 8);

      if (ranked.length === 0) {
        return ok({
          tools: [],
          next_step: `Nothing matched "${query}". Call find_tools again with all: true to see the whole catalogue before concluding LifeOS can't do it.`,
        });
      }
      return ok({
        tools: ranked.map((entry) => describe(entry.spec)),
        note: "Call one of these with run_tool, passing its name and an `arguments` object matching its input_schema.",
      });
    },
  );

  server.registerTool(
    "run_tool",
    {
      title: "Run a tool found with find_tools",
      description:
        "Invokes one of the tools find_tools returned, by name, with an arguments object matching the input_schema it gave you. Look the tool up first — arguments are validated against the real schema and a guess will simply fail. " +
        "This can send mail, delete messages, cancel events and RSVP on the user's behalf, so treat it with the same care as the tool it stands in for: say what you are about to do and get the user's agreement first, unless they have already told you to go ahead.",
      inputSchema: {
        name: z.string().describe("The tool's `name`, exactly as find_tools returned it."),
        arguments: z
          .record(z.unknown())
          .default({})
          .describe("The arguments object for that tool, matching its input_schema."),
      },
      // Deliberately the loosest annotation of any tool here: a client can't
      // know what a given run_tool call will do, so it should always ask.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (
      { name, arguments: args }: { name: string; arguments: Record<string, unknown> },
      extra: unknown,
    ): Promise<ToolResult> => {
      const spec = callable.get(name);
      if (!spec) {
        const direct = visible.find((s) => s.name === name);
        if (direct) {
          return fail(
            `${name} is already available on this connection — call it directly rather than through run_tool.`,
          );
        }
        const terms = tokenize(name);
        const near = catalogue
          .map((s) => ({ name: s.name, points: score(s, terms) }))
          .filter((s) => s.points > 0)
          .sort((a, b) => b.points - a.points)
          .slice(0, 5)
          .map((s) => s.name);
        return fail(
          `No tool called "${name}".` +
            (near.length ? ` Did you mean: ${near.join(", ")}?` : "") +
            " Call find_tools to see what exists — don't guess at names.",
        );
      }

      const parsed = z.object(spec.inputSchema).safeParse(args ?? {});
      if (!parsed.success) {
        // The same field-level message a direct call would have produced, so a
        // model can correct itself instead of abandoning the tool.
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        return fail(
          `Arguments for ${name} don't match its schema — ${problems}. Call find_tools for ${name} and follow its input_schema.`,
        );
      }

      try {
        return await spec.handler(parsed.data as never, extra);
      } catch (e) {
        return fail(explain(e));
      }
    },
  );
}
