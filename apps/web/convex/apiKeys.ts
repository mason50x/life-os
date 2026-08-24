import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertServiceKey } from "./guard";

export const create = mutation({
  args: {
    serviceKey: v.string(),
    userId: v.string(),
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    return await ctx.db.insert("apiKeys", {
      userId: args.userId,
      name: args.name,
      prefix: args.prefix,
      hash: args.hash,
      createdAt: Date.now(),
    });
  },
});

export const listByUser = query({
  args: { serviceKey: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return keys.map(({ hash: _hash, ...safe }) => safe);
  },
});

export const findByHash = query({
  args: { serviceKey: v.string(), hash: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    return await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("hash", args.hash))
      .unique();
  },
});

export const remove = mutation({
  args: { serviceKey: v.string(), id: v.id("apiKeys"), userId: v.string() },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    if (doc && doc.userId === args.userId) await ctx.db.delete(args.id);
  },
});
