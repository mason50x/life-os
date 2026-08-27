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

/**
 * The signed-in user's keys, live — the JWT-authenticated twin of
 * `listByUser`, for clients subscribing directly (see accounts.mine). Same
 * projection: the hash never leaves the database. Null until signed in.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return keys.map(({ hash: _hash, ...safe }) => safe);
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

/**
 * Record that a key was just used. Callers throttle this (see lib/apiAuth.ts) so
 * an active key costs one write an hour rather than one per request.
 */
export const touch = mutation({
  args: { serviceKey: v.string(), id: v.id("apiKeys") },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    const doc = await ctx.db.get(args.id);
    if (doc) await ctx.db.patch(args.id, { lastUsedAt: Date.now() });
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
