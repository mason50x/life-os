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

  // Connected email accounts. Tokens are AES-256-GCM encrypted by the Next.js
  // backend before they ever reach Convex; email content is never stored.
  emailAccounts: defineTable({
    userId: v.string(), // WorkOS user id
    provider: v.union(v.literal("gmail"), v.literal("outlook")),
    email: v.string(),
    displayName: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("needs_reauth"),
      v.literal("disconnected"),
    ),
    accessTokenEnc: v.string(),
    refreshTokenEnc: v.optional(v.string()),
    accessTokenExpiresAt: v.number(),
    connectedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_email", ["userId", "email"]),

  // CLI / programmatic access keys (sha256 hashes only, never the raw key).
  apiKeys: defineTable({
    userId: v.string(),
    name: v.string(),
    prefix: v.string(), // first 12 chars for display
    hash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["hash"]),
});
