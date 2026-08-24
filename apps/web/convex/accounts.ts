import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertServiceKey } from "./guard";

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

export const remove = mutation({
  args: { serviceKey: v.string(), id: v.id("emailAccounts"), userId: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    if (doc && doc.userId === args.userId) await ctx.db.delete(args.id);
  },
});
