import { z } from "zod";
import { accountNames, type Provider } from "@lifeos/core";
import { ok } from "../format";
import { resolveAccount } from "../session";
import { CREATES, Kit, READ_ONLY, account, handled } from "./shared";

/**
 * The one difference that changes how every other tool behaves: Gmail files a
 * message under labels it can hold several of, while Outlook and iCloud put it
 * in exactly one folder. Saying so here saves the model guessing later.
 */
const ORGANISES_BY: Record<Provider, "labels" | "folders"> = {
  gmail: "labels",
  outlook: "folders",
  icloud: "folders",
};

export function registerAccountTools({ register, session }: Kit) {
  register(
    "list_accounts",
    {
      title: "List connected accounts",
      description:
        "Start here. Lists every email account the user has connected to LifeOS, with the name the user knows it by, its provider, whether it is usable right now, and whether it files mail by labels (Gmail) or folders (Outlook, iCloud). Every other tool acts on one of these accounts — pass either the name or the address as `account` — and message ids are only valid on the account that produced them.",
      inputSchema: {},
      annotations: READ_ONLY,
      surface: "core",
      tier: "core",
    },
    handled(session, async (_args: Record<string, never>, s) => {
      const accounts = await s.listAccounts();
      // What the user calls each account — their own name for it, or the
      // address's local part. It's how they'll refer to one in conversation.
      const names = accountNames(accounts);
      return ok({
        accounts: accounts.map((a) => ({
          name: names.get(a.email),
          email: a.email,
          provider: a.provider,
          status: a.status,
          displayName: a.displayName,
          organizes_by: ORGANISES_BY[a.provider],
        })),
        ...(accounts.length === 0
          ? {
              next_step:
                "No inboxes are connected. The user needs to connect one in the LifeOS dashboard before anything else here will work.",
            }
          : {}),
        ...(accounts.some((a) => a.status !== "active")
          ? {
              note: "Accounts that aren't active need the user to reconnect them in the LifeOS dashboard.",
            }
          : {}),
      });
    }),
  );

}

/**
 * Labels and folders are part of the email surface, not the account surface —
 * a connection with no inbox linked has nothing to file mail into.
 */
export function registerLabelTools({ register, session }: Kit) {
  register(
    "list_labels",
    {
      title: "List labels and folders",
      description:
        "Lists the places mail can be filed on one account: Gmail labels, or Outlook/iCloud folders. Call this before move_email or modify_labels — those need a label or folder id from here, not a display name.",
      inputSchema: { account },
      annotations: READ_ONLY,
      surface: "email",
      tier: "extended",
      keywords: ["label", "folder", "mailbox", "categories", "organise"],
    },
    handled(session, async ({ account: acct }: { account?: string }, s) => {
      const email = await resolveAccount(s, acct);
      const provider = await s.providerFor(email);
      return ok({
        account: email,
        organizes_by: ORGANISES_BY[provider.provider],
        labels: await provider.listLabels(),
      });
    }),
  );

  register(
    "create_label",
    {
      title: "Create a label or folder",
      description:
        "Creates a new Gmail label, or a new Outlook/iCloud folder, on one account. Use it when filing mail somewhere that doesn't exist yet; check list_labels first so you don't duplicate one.",
      inputSchema: {
        account,
        name: z
          .string()
          .min(1)
          .describe(
            "Name for the new label or folder. Gmail nests with a slash, e.g. \"Receipts/2026\".",
          ),
      },
      annotations: CREATES,
      surface: "email",
      tier: "extended",
      keywords: ["label", "folder", "new folder", "organise"],
    },
    handled(session, async ({ account: acct, name }: { account?: string; name: string }, s) => {
      const email = await resolveAccount(s, acct);
      const label = await (await s.providerFor(email)).createLabel(name);
      return ok({ created: label, account: email });
    }),
  );
}
