"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

/** One account as accounts.mine returns it — a superset of every consumer's shape. */
type LiveAccount = NonNullable<FunctionReturnType<typeof api.accounts.mine>>[number];
type LiveKey = NonNullable<FunctionReturnType<typeof api.apiKeys.mine>>[number];

/**
 * The account list, live. The server-rendered snapshot passed in covers the
 * first paint (and the moments before the WebSocket authenticates); once the
 * subscription answers, Convex owns the list and every change — a connect
 * finishing in another tab, a rename from the CLI — lands without a refresh.
 *
 * Generic because callers hold different projections of an account (the
 * sidebar's rows, the home page's full ConnectedAccount): the live row carries
 * every field any of them use, so the union collapses to the caller's type.
 */
export function useLiveAccounts<T>(initial: T[]): (T | LiveAccount)[] {
  return useQuery(api.accounts.mine) ?? initial;
}

/** The API key list, live — same contract as useLiveAccounts. */
export function useLiveKeys<T>(initial: T[]): (T | LiveKey)[] {
  return useQuery(api.apiKeys.mine) ?? initial;
}
