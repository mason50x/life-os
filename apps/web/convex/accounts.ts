import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
// The account types and their pure helpers, with none of the provider clients
// behind the package's main entry — the same rules the Next.js side applies.
import { calendarOwners } from "@lifeos/core/accounts";
import { assertServiceKey } from "./guard";

/**
 * The signed-in user's accounts, live. Authenticated by the caller's AuthKit
 * JWT (ctx.auth) rather than the service key, so the dashboard and the CLI can
 * subscribe to it directly — which is exactly why it projects the row down to
 * what a browser may hold and never returns encrypted tokens, scope strings,
 * or the raw document. Null until someone is signed in.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const docs = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    // Addresses over one sign-in share one set of calendars; this says which
    // of them speaks for it, so the live list counts a calendar once — the
    // same call lib/accounts.ts makes for the server-rendered list.
    const owners = calendarOwners(docs);
    return docs.map((d) => ({
      id: d._id,
      userId: d.userId,
      provider: d.provider,
      email: d.email,
      ...(d.displayName !== undefined ? { displayName: d.displayName } : {}),
      ...(d.nickname !== undefined ? { nickname: d.nickname } : {}),
      status: d.status,
      // Absent capabilities mean a row written before calendar existed, which
      // is mail — the same reading lib/accounts.ts gives it.
      capabilities: d.capabilities?.length ? d.capabilities : ["email" as const],
      ...(owners.has(d.email) ? { calendarOf: owners.get(d.email)! } : {}),
      connectedAt: d.connectedAt,
    }));
  },
});

export const listByUser = query({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getByUserEmail = query({
  args: { serviceKey: v.string(), userId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    return await ctx.db
      .query("emailAccounts")
      .withIndex("by_user_email", (q) => q.eq("userId", args.userId).eq("email", args.email))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    provider: v.union(v.literal("gmail"), v.literal("outlook"), v.literal("icloud")),
    email: v.string(),
    loginEmail: v.optional(v.string()),
    displayName: v.optional(v.string()),
    accessTokenEnc: v.string(),
    refreshTokenEnc: v.optional(v.string()),
    accessTokenExpiresAt: v.number(),
    tokenClient: v.optional(v.union(v.literal("connect"), v.literal("authkit"))),
    capabilities: v.optional(
      v.array(v.union(v.literal("email"), v.literal("calendar"))),
    ),
    grantedScopes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const { serviceKey: _sk, ...fields } = args;
    const existing = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user_email", (q) => q.eq("userId", args.userId).eq("email", args.email))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        // Keep the old refresh token if the provider didn't return a new one.
        refreshTokenEnc: fields.refreshTokenEnc ?? existing.refreshTokenEnc,
        // Same rule for capabilities: a caller that doesn't mention them (a
        // token refresh, say) must not silently strip calendar off the account.
        capabilities: fields.capabilities ?? existing.capabilities,
        grantedScopes: fields.grantedScopes ?? existing.grantedScopes,
        status: "active",
      });
      return existing._id;
    }
    return await ctx.db.insert("emailAccounts", {
      ...fields,
      status: "active",
      connectedAt: Date.now(),
    });
  },
});

/**
 * Record a capability the account has just proved it has, without touching its
 * credential — the passwordless half of "enable calendar".
 *
 * It spreads to every sibling signing in with the same credential: iCloud
 * custom-domain and alias addresses are separate rows over one app-specific
 * password, so a CalDAV round trip on any of them proves calendar for all of
 * them, and upgrading one while the others stay mail-only would be a lie.
 * Returns the addresses that changed, so the caller can say what it did.
 */
export const grantCapability = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    id: v.id("emailAccounts"),
    capability: v.union(v.literal("email"), v.literal("calendar")),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    // Ownership lives here, same as `rename` and `remove` — a foreign id is a
    // no-op, not an error the caller can learn anything from.
    if (!doc || doc.userId !== args.userId) return [];
    const signIn = doc.loginEmail ?? doc.email;

    const rows = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const upgraded: string[] = [];
    for (const row of rows) {
      if (row.provider !== doc.provider) continue;
      if ((row.loginEmail ?? row.email) !== signIn) continue;
      // Absent capabilities mean a row written before calendar existed, which
      // is mail — the same reading the rest of the app gives it.
      const capabilities: ("email" | "calendar")[] = row.capabilities?.length
        ? row.capabilities
        : ["email"];
      if (capabilities.includes(args.capability)) continue;
      await ctx.db.patch(row._id, { capabilities: [...capabilities, args.capability] });
      upgraded.push(row.email);
    }
    return upgraded;
  },
});

export const updateTokens = mutation({
  args: {
    serviceKey: v.string(),
    id: v.id("emailAccounts"),
    accessTokenEnc: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshTokenEnc: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const { serviceKey: _sk, id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, status: "active" });
  },
});

export const setStatus = mutation({
  args: {
    serviceKey: v.string(),
    id: v.id("emailAccounts"),
    status: v.union(v.literal("active"), v.literal("needs_reauth"), v.literal("disconnected")),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    await ctx.db.patch(args.id, { status: args.status });
  },
});

/**
 * Rename an account. An absent `nickname` clears the name, which patches the
 * field away and puts the account back on its default. Ownership is checked
 * here, not trusted from the caller — same rule as `remove`.
 */
export const rename = mutation({
  args: {
    serviceKey: v.string(),
    id: v.id("emailAccounts"),
    userId: v.string(),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== args.userId) return null;
    await ctx.db.patch(args.id, { nickname: args.nickname });
    return doc.email;
  },
});

export const remove = mutation({
  args: { serviceKey: v.string(), id: v.id("emailAccounts"), userId: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    if (doc && doc.userId === args.userId) await ctx.db.delete(args.id);
  },
});
