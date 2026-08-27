import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape, ZodTypeAny } from "zod";
import type { Surface } from "./session";
import type { Kit, SessionFor, ToolHandler, ToolMeta } from "./tools/shared";
import { registerAccountTools, registerLabelTools } from "./tools/accounts";
import { registerReadTools } from "./tools/read";
import { registerSendTools } from "./tools/send";
import { registerOrganizeTools } from "./tools/organize";
import { registerDraftTools } from "./tools/drafts";
import { registerAttachmentTools } from "./tools/attachments";
import { registerCalendarTools } from "./tools/calendar";

export interface ToolSpec extends ToolMeta {
  name: string;
  handler: ToolHandler;
}

/**
 * Every tool LifeOS has, declared once. Which of them a given connection
 * advertises — and which sit behind find_tools instead — is decided later, by
 * the caller, from what the user actually has connected.
 */
export function collectSpecs(session: SessionFor): ToolSpec[] {
  const specs: ToolSpec[] = [];
  const kit: Kit = {
    session,
    register: (name, meta, handler) => {
      specs.push({ name, ...meta, handler });
    },
  };
  registerAccountTools(kit);
  registerLabelTools(kit);
  registerReadTools(kit);
  registerSendTools(kit);
  registerDraftTools(kit);
  registerOrganizeTools(kit);
  registerAttachmentTools(kit);
  registerCalendarTools(kit);
  return specs;
}

/** The specs a connection can reach at all, given what the user has connected. */
export function specsFor(specs: ToolSpec[], surfaces: readonly Surface[]): ToolSpec[] {
  return specs.filter(
    (spec) => spec.surface === "core" || surfaces.includes(spec.surface as Surface),
  );
}

export function registerSpec(server: McpServer, spec: ToolSpec): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: spec.annotations,
    },
    // The SDK types the handler against the inferred shape; every spec's own
    // handler was written against that same shape.
    spec.handler as never,
  );
}

// ---------------------------------------------------------------------------
// Zod → JSON Schema
// ---------------------------------------------------------------------------

/**
 * find_tools hands a model the schema of a tool it can't see, so that schema
 * has to be real JSON Schema rather than a description of one.
 *
 * Written by hand rather than pulled in from zod-to-json-schema: the shapes
 * here are strings, numbers, booleans, arrays, enums and flat objects, and a
 * converter for exactly that is shorter than the discussion about adding a
 * dependency for it.
 */
export function jsonSchemaFor(shape: ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, schema] of Object.entries(shape)) {
    const { node, optional } = convert(schema as ZodTypeAny);
    properties[key] = node;
    if (!optional) required.push(key);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
}

interface Converted {
  node: Record<string, unknown>;
  optional: boolean;
}

/** Zod keeps its shape on `_def`, which is untyped by design. */
type ZodDef = {
  typeName: string;
  innerType?: ZodTypeAny;
  type?: ZodTypeAny;
  values?: readonly string[];
  checks?: { kind: string; value?: number }[];
  minLength?: { value: number } | null;
  defaultValue?: () => unknown;
  shape?: () => ZodRawShape;
};

function convert(schema: ZodTypeAny): Converted {
  const def = schema._def as unknown as ZodDef;
  const described = (node: Record<string, unknown>): Record<string, unknown> =>
    schema.description ? { ...node, description: schema.description } : node;

  switch (def.typeName) {
    case "ZodOptional":
    case "ZodNullable": {
      const inner = convert(def.innerType!);
      return { node: described(inner.node), optional: true };
    }
    case "ZodDefault": {
      const inner = convert(def.innerType!);
      // A default makes a field optional to the caller while still telling the
      // model what it gets if it says nothing.
      return {
        node: described({ ...inner.node, default: def.defaultValue?.() }),
        optional: true,
      };
    }
    case "ZodString":
      return { node: described({ type: "string" }), optional: false };
    case "ZodBoolean":
      return { node: described({ type: "boolean" }), optional: false };
    case "ZodNumber": {
      const checks = def.checks ?? [];
      return {
        node: described({
          type: checks.some((c) => c.kind === "int") ? "integer" : "number",
          ...numeric(checks, "min", "minimum"),
          ...numeric(checks, "max", "maximum"),
        }),
        optional: false,
      };
    }
    case "ZodArray": {
      const items = convert(def.type!);
      const min = def.minLength?.value;
      return {
        node: described({
          type: "array",
          items: items.node,
          ...(typeof min === "number" ? { minItems: min } : {}),
        }),
        optional: false,
      };
    }
    case "ZodEnum":
      return { node: described({ type: "string", enum: [...(def.values ?? [])] }), optional: false };
    case "ZodObject":
      return { node: described(jsonSchemaFor(def.shape?.() ?? {})), optional: false };
    default:
      // An unmodelled type is better described as "anything" than wrongly.
      return { node: described({}), optional: false };
  }
}

function numeric(
  checks: { kind: string; value?: number }[],
  kind: string,
  key: string,
): Record<string, number> {
  const found = checks.find((c) => c.kind === kind);
  return found?.value === undefined ? {} : { [key]: found.value };
}
