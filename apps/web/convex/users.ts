import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert the signed-in WorkOS user. Authenticated by the caller's AuthKit JWT
 * (ctx.auth), so the WorkOS user id comes from the verified token subject —
 * profile fields are passed in because AuthKit access tokens don't carry them.
 */
export const syncFromWorkOS = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const workosUserId = identity.subject;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", workosUserId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, lastSeenAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      workosUserId,
      ...args,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  },
});

/** Return the signed-in user's Convex record (null until first sync). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosUserId", identity.subject))
      .unique();
  },
});
