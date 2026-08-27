import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // WorkOS users mirrored into Convex. Synced (JWT-authenticated) on every
  // dashboard visit; `workosUserId` is the JWT subject and the foreign key
  // used by emailAccounts.userId / apiKeys.userId.
  users: defineTable({
    workosUserId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_workos_id", ["workosUserId"])
    .index("by_email", ["email"]),

  // Connected accounts. Named for mail because that is all they were, but one
  // row now covers every surface a single grant unlocks — Gmail and Google
  // Calendar, or iCloud Mail and iCloud Calendar, share the one credential.
  // Secrets (OAuth tokens, or the iCloud app-specific password in
  // accessTokenEnc) are AES-256-GCM encrypted by the Next.js backend before
  // they ever reach Convex; mail and calendar content is never stored.
  emailAccounts: defineTable({
    userId: v.string(), // WorkOS user id
    provider: v.union(v.literal("gmail"), v.literal("outlook"), v.literal("icloud")),
    email: v.string(),
    // iCloud custom-domain/alias accounts: the primary iCloud address used to
    // sign in, when it differs from `email` (the send-as address).
    loginEmail: v.optional(v.string()),
    displayName: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("needs_reauth"),
      v.literal("disconnected"),
    ),
    accessTokenEnc: v.string(),
    refreshTokenEnc: v.optional(v.string()),
    accessTokenExpiresAt: v.number(),
    // Which Google OAuth client minted these tokens. "connect" (the default,
    // and absent on rows written before sign-in adoption existed) is the
    // dedicated Gmail client; "authkit" is the separate sign-in client. Google
    // only refreshes a token against its issuing client, so this picks the
    // credentials to refresh with.
    tokenClient: v.optional(v.union(v.literal("connect"), v.literal("authkit"))),
    // What this grant can actually be used for. Absent on rows written before
    // calendar existed, which read as ["email"] — those upgrade themselves the
    // next time the user reconnects, with no backfill.
    capabilities: v.optional(
      v.array(v.union(v.literal("email"), v.literal("calendar"))),
    ),
    // The scope string Google returned, kept so "never asked for calendar" is
    // distinguishable from "asked, and the user said no".
    grantedScopes: v.optional(v.string()),
    connectedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_email", ["userId", "email"]),

  // CLI / programmatic access keys (sha256 hashes only, never the raw key).
  apiKeys: defineTable({
    userId: v.string(),
    name: v.string(),
    prefix: v.string(), // leading characters kept for display (see lib/apiKeys.ts)
    hash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["hash"]),
});
