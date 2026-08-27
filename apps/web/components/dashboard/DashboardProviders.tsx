"use client";

import { useCallback, useMemo, useRef } from "react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

// One client for the tab, made on first use rather than at import: the module
// also loads during SSR, where constructing a WebSocket client buys nothing.
let client: ConvexReactClient | null = null;
function convexClient(): ConvexReactClient {
  client ??= new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return client;
}

/**
 * The AuthKit session, in the shape ConvexProviderWithAuth wants. The access
 * token is the same WorkOS JWT the server already hands to convexAsUser, and
 * convex/auth.config.ts already trusts its issuer — nothing new is minted.
 *
 * Convex is handed the latest token from a ref and NEVER asked to refresh one:
 * AuthKit's token store already refreshes itself 60s before expiry and on tab
 * wake, so by the time Convex retries a rejected token the ref holds a fresh
 * one. Wiring refresh() in here instead caused a request loop — Convex
 * force-refreshes on connect, refresh() is a POST server action whose loading
 * flip restarts Convex auth, which force-refreshes again, forever.
 */
function useAuthFromAuthKit() {
  const { user, loading } = useAuth();
  const { accessToken, loading: tokenLoading, error } = useAccessToken();

  const token = useRef<string | null>(null);
  if (accessToken && !error) token.current = accessToken;
  const fetchAccessToken = useCallback(async () => token.current, []);

  // Only the first token is worth waiting for; a background refresh must not
  // read as "logging out and back in" or every list would flash its snapshot.
  const isLoading = (loading || tokenLoading) && !accessToken;
  const isAuthenticated = Boolean(user) && Boolean(accessToken);
  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  );
}

/**
 * What makes the dashboard live: every list under here can `useQuery` a
 * Convex function and re-render the moment the database changes, instead of
 * waiting for a navigation to re-run the server fetch.
 *
 * `initialAuth` is the session the layout already resolved server-side —
 * seeding the provider with it saves AuthKit re-asking the server who is
 * signed in on every full page load.
 */
export function DashboardProviders({
  initialAuth,
  children,
}: {
  initialAuth?: React.ComponentProps<typeof AuthKitProvider>["initialAuth"];
  children: React.ReactNode;
}) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <ConvexProviderWithAuth client={convexClient()} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
