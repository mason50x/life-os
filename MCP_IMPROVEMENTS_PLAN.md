# LifeOS MCP Improvements Plan

**Objective:** Improve the MCP server to make tools easier for models to discover and use, avoid client-side tool registration friction, and maintain full product power while remaining within practical limits.

**Thesis:** Gate on what's actually connected (per-user, per-request surface filtering), keep one canonical URL, and reserve split URLs as an escape hatch for scope-limited integrations — not the default.

---

## Phase 1: Surface-Gated Tool Registration (No User-Facing Config)

**Goal:** Only advertise tools for surfaces the user has actually connected. A Gmail-only user never sees calendar tools.

### 1.1 Extract Surface Detection
**Files:** `packages/mcp/src/index.ts`, `apps/web/app/[transport]/route.ts`

- Modify `LifeOsSession` to expose which surfaces are connected:
  ```typescript
  export interface LifeOsSession {
    userId: string;
    surfaces: Set<"email" | "calendar" | "contacts">; // derived from listAccounts()
    listAccounts(): Promise<ConnectedAccount[]>;
    providerFor(accountEmail: string): Promise<EmailProvider>;
  }
  ```

- Update `resolveSession()` in `apps/web/app/[transport]/route.ts` to compute surfaces from connected accounts:
  ```typescript
  async function resolveSession(authInfo?: McpAuthInfo): Promise<LifeOsSession> {
    const accounts = await listAccounts(userId);
    const surfaces = new Set(accounts.map(a => a.surface)); // or derive from provider type
    return {
      userId,
      surfaces,
      listAccounts: () => Promise.resolve(accounts),
      providerFor: (email) => getProviderForAccount(userId, email),
    };
  }
  ```

### 1.2 Conditional Tool Registration
**Files:** `packages/mcp/src/index.ts`

- Modify `registerLifeOsTools()` signature to accept surfaces as a context parameter:
  ```typescript
  export function registerLifeOsTools(
    server: McpServer,
    resolveSession: ResolveSession,
    options?: { surfaces?: Set<string> }
  )
  ```

- Wrap all email-related tool registrations in a surfaces check:
  ```typescript
  if (options?.surfaces?.has("email")) {
    server.registerTool("search_emails", ...);
    server.registerTool("send_email", ...);
    // etc.
  }
  ```

- For the initial launch, all email tools are always registered (since the product is email-first).
- Prepare structure for future surfaces (calendar, contacts) to be added without redesign.

### 1.3 Notification Hook for Surface Changes
**Files:** `packages/mcp/src/index.ts`, `apps/web/convex/functions.ts`

- Define a notification schema for tool-set changes:
  ```typescript
  // In packages/mcp/src/index.ts or @lifeos/core
  export interface ToolListChange {
    event: "surfaces_changed";
    newSurfaces: string[];
    addedTools?: string[];
    removedTools?: string[];
    timestamp: number;
  }
  ```

- Emit via Convex mutation when a user links/unlinks an account:
  - Hook into the existing `connectAccount()` / `disconnectAccount()` mutations
  - Broadcast `notifications/tools/list_changed` (or fire a Convex cron that polls connected clients)

- This prepares the ecosystem to signal to MCP clients when the toolset changes (optional for now; depends on client MCP implementation).

---

## Phase 2: Single Canonical URL with Path-Suffixed Escape Hatch

**Goal:** Keep `/mcp` as the default. Prepare `/mcp/<surface>` as an optional narrow-scope path for future integrations.

### 2.1 Refactor Routing for Surface Awareness
**Files:** `apps/web/app/[transport]/route.ts`, `apps/web/lib/oauthMetadata.ts`

- Parse the dynamic segment to extract optional surface suffix:
  ```typescript
  function parseTransportAndSurface(transport: string): { base: string; surface?: string } {
    const [base, surface] = transport.split("/");
    return { base, surface };
  }
  ```

- Pass the surface through to `resolveSession()`:
  ```typescript
  const surfaceParam = parseTransportAndSurface(transport).surface;
  const session = await resolveSession(authInfo, { requestedSurface: surfaceParam });
  ```

- **Routing behavior:**
  - `/mcp` → all connected surfaces' tools
  - `/mcp/email` → email tools only (even if calendar were connected)
  - `/mcp/calendar` → calendar tools only (future)

- Update the RFC 9728 resource metadata to acknowledge both forms:
  ```typescript
  // In lib/oauthMetadata.ts
  const resourceMetadata = {
    uri: "https://lifeos.app/resource/mcp",
    type: "application/mcp+json",
    surfaces: ["email"], // current
    primaryUrl: `${mcpUrl()}/mcp`,
    alternateUrls: surfacesOnRequest.map(s => `${mcpUrl()}/mcp/${s}`),
  };
  ```

### 2.2 Update OAuth Metadata Route
**Files:** `apps/web/app/.well-known/oauth-protected-resource/mcp/route.ts`

- Expand the path-suffixed metadata route to handle both forms:
  ```typescript
  // GET /.well-known/oauth-protected-resource/mcp?surface=email (or /[surface])
  export async function GET(req: Request) {
    const surface = new URL(req.url).searchParams.get("surface");
    return mcpResourceMetadata(surface);
  }
  ```

---

## Phase 3: Tool Naming and Description Improvements

**Goal:** Make tools easier for models to discover and use mid-conversation; reduce confusion between similarly-named actions.

### 3.1 Improve Tool Descriptions
**Files:** `packages/mcp/src/index.ts`

**Current gaps:**
- `send_email` vs. `create_draft` distinction unclear (when to use each?)
- `archive_email` vs. `trash_email` vs. no action is confusing
- `mark_read` doesn't mention it's also used for "unread"
- `list_labels` / `modify_labels` could clarify provider differences upfront

**Improvements:**
```typescript
server.registerTool("send_email", {
  title: "Send email immediately",
  description:
    "Send an email from one of the user's connected accounts right away. " +
    "Use this for: replies, forwarding, or any message that should be sent " +
    "without user review. For messages the user should review first, use create_draft instead. " +
    "Confirm with the user before sending consequential emails.",
  // ...
});

server.registerTool("create_draft", {
  title: "Create draft email (no send)",
  description:
    "Create a draft in the user's mailbox WITHOUT sending it. " +
    "The user can review, edit, and send it from their email client. " +
    "Use this for: complex emails, unsure phrasing, or any message that needs human review. " +
    "See send_email for immediate sends.",
  // ...
});

server.registerTool("archive_email", {
  title: "Archive email (hide from inbox)",
  description:
    "Remove a message from the inbox without deleting it (Gmail: remove Inbox label; " +
    "Outlook/iCloud: move to Archive folder). " +
    "The message stays in the account forever. Use this for: tidying without deletion. " +
    "Compare: trash_email moves to trash (recoverable); archive is permanent but searchable.",
  // ...
});

server.registerTool("trash_email", {
  title: "Trash email (recoverable delete)",
  description:
    "Move a message to trash—it's recoverable from the trash folder for ~30 days, " +
    "but hidden from the main inbox. Use this for: unwanted messages that might need recovery. " +
    "Compare: archive_email hides but keeps in the account forever; trash is temporary.",
  // ...
});

server.registerTool("mark_read", {
  title: "Mark message as read or unread",
  description:
    "Toggle a message's read status. Pass read: true to mark read (default), " +
    "or read: false to mark unread. Use this for: processing inboxes, flagging " +
    "important messages, or undoing read status.",
  // ...
});

server.registerTool("modify_labels", {
  title: "Modify labels or move between folders",
  description:
    "Gmail: add/remove label IDs on a message (e.g., add Starred, remove Inbox). " +
    "Outlook/iCloud: move between folders by passing a folder ID as the first add entry " +
    "(you can move OR relabel, not both, in a single call). " +
    "Use list_labels first to find available label/folder IDs for this account.",
  // ...
});

server.registerTool("list_labels", {
  title: "List available labels/folders",
  description:
    "Fetch all labels (Gmail) or folders (Outlook/iCloud) for an account. " +
    "Use the IDs returned here with modify_labels to organize emails. " +
    "Note: Gmail Inbox, Sent, Drafts, Archive, Trash are system labels; " +
    "Outlook/iCloud have comparable system folders.",
  // ...
});
```

### 3.2 Add Helper Functions (Optional but Recommended)
**Files:** `packages/mcp/src/index.ts`

- Add inline helper descriptions for complex input patterns:
  ```typescript
  const account = z
    .string()
    .describe(
      "Email address of a connected account. " +
      "Call list_accounts first to see which emails are available."
    );

  const threadIdNote = z
    .string()
    .optional()
    .describe(
      "Thread ID (from search_emails or get_thread). " +
      "If present, this reply stays in the existing conversation. " +
      "Omit to start a new thread."
    );
  ```

### 3.3 Add Input Validation Hints
**Files:** `packages/mcp/src/index.ts`

- Use Zod error messages to guide model recovery from common mistakes:
  ```typescript
  const sendShape = {
    account: z
      .string()
      .min(1)
      .refine(a => a.includes("@"), "Must be a full email address")
      .describe("Email address of the account to send from (from list_accounts)"),
    to: z
      .array(z.string().email("Each recipient must be a valid email"))
      .min(1)
      .describe("Recipient email addresses—at least one required"),
    // ...
  };
  ```

---

## Phase 4: Tool Consolidation (Reserve for Client Cap Breach Only)

**Goal:** Define consolidation strategy if a client hits a hard cap on total tools.

### 4.1 Possible Consolidation Moves (Not Yet Implemented)
**Files:** `packages/mcp/src/index.ts`, `packages/core/src/providers/*.ts`

This is a **fallback** strategy only. Only pull this lever if Step 1–3 aren't enough:

**Move 1: Consolidate read operations** (if tool count becomes critical)
```typescript
// Instead of separate get_thread / get_message:
server.registerTool("get_email", {
  inputSchema: {
    account,
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    // mutually exclusive: threadId XOR messageId
  },
  // returns full thread or single message
});
```

**Move 2: Consolidate write operations** (if needed)
```typescript
// Merge archive / trash / mark_read into one:
server.registerTool("modify_email", {
  inputSchema: {
    account,
    messageId,
    action: z.enum(["archive", "trash", "mark_read", "mark_unread"]),
    // ...
  },
});
```

**Why not do this now:**
- Locks in the "full-power, granular tools" promise
- Current tool set (11) is well within model accuracy bounds
- Consolidation trades discoverability and clarity for space that likely isn't needed yet
- If consolidation is later needed, descriptions above make it a straightforward refactor

### 4.2 Decision Gate
- Before consolidating, verify:
  1. A production client has hit its hard cap (not speculative)
  2. Steps 1–3 (surface gating, better descriptions, escape hatch URLs) haven't relieved pressure
  3. The consolidation doesn't break existing API consumers (breaking change)

---

## Implementation Priority

1. **Phase 1 (Surface-gated tools):** Foundation for future products without user-facing config friction.
2. **Phase 3 (Better descriptions):** Highest leverage for model behavior *now*; no breaking changes.
3. **Phase 2 (URL escape hatch):** Prepares routing for future narrow-scope integrations; low cost.
4. **Phase 4 (Consolidation):** Only if Phases 1–3 + real client feedback reveal demand.

---

## Files to Touch

| Phase | File | Changes |
|-------|------|---------|
| 1 | `packages/mcp/src/index.ts` | Add `surfaces` to `LifeOsSession`; conditional registration |
| 1 | `apps/web/app/[transport]/route.ts` | Compute surfaces in `resolveSession()` |
| 1 | `packages/mcp/src/index.ts` | Define `ToolListChange` notification schema |
| 1 | `apps/web/convex/functions.ts` | Emit notifications on account connect/disconnect |
| 2 | `apps/web/app/[transport]/route.ts` | Parse surface suffix; pass to session |
| 2 | `apps/web/lib/oauthMetadata.ts` | Update RFC 9728 metadata to list both forms |
| 2 | `apps/web/app/.well-known/oauth-protected-resource/mcp/route.ts` | Handle surface query param |
| 3 | `packages/mcp/src/index.ts` | Expand tool descriptions (biggest single change) |
| 3 | `packages/mcp/src/index.ts` | Add input validation hints in Zod schemas |
| 4 | `packages/mcp/src/index.ts` | (if needed) Add consolidated tool alternatives |

---

## Testing Strategy

1. **Surface gating:** Unit test that `registerLifeOsTools()` skips email tools when `surfaces` is empty.
2. **Descriptions:** Manual: run `mcp` endpoint, inspect schema in an MCP client (Claude, ChatGPT), verify clarity.
3. **URL routing:** Test both `/mcp` and `/mcp/email` return valid tool schemas; `/mcp/email` excludes non-email tools.
4. **Notifications:** Convex mutation triggers `tools_changed` event; verify MCP client can subscribe (if client supports it).

---

## Rollout Notes

- **No breaking changes** to the current `/mcp` endpoint.
- Gmail-only users see identical toolset (since all current tools are email).
- Future calendar/contacts surfaces automatically gate their tools without code changes.
- New OAuth clients can request `/mcp/email` if they want email-only access; existing integrations use `/mcp`.

---

## Next Steps

1. Implement Phase 1 (surface detection + conditional registration)
2. Test with manual MCP client inspection
3. Implement Phase 3 (improved descriptions)
4. Test descriptions in real Claude/ChatGPT session
5. (Optional) Implement Phase 2 (URL routing) if narrow-scope integrations emerge
6. Monitor for Phase 4 (consolidation) demand; only act on real client feedback
