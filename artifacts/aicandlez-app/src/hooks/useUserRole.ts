/**
 * useUserRole — PWA-side role hook.
 *
 * Mirrors `artifacts/trading-dashboard/src/hooks/useUserRole.ts`. Pulls the
 * canonical role from `/api/auth/me` (which JIT-provisions the user row from
 * Clerk and auto-promotes allowlisted emails to `super-admin`).
 *
 * Returns:
 *   role         — "user" | "admin" | "super-admin" | null while loading
 *   isAdmin      — true for admin OR super-admin (operator capable)
 *   isSuperAdmin — true only for super-admin
 *
 * Used by `SubscriptionContext` to bypass ALL consumer subscription gates for
 * operators: unlimited trades, live execution, no paywall, no upgrade banners.
 * The server enforces the same gate via `requireRole(["admin","super-admin"])`
 * on every operator endpoint, so the client-side bypass is for UI only.
 *
 * IMPORTANT — cross-subdomain auth:
 *   app.aicandlez.com → api.aicandlez.com is a different-origin request. Under
 *   Safari ITP / SameSite=Lax / Storage Partitioning the Clerk __session
 *   cookie is frequently dropped, causing /api/auth/me to 401 and the hook to
 *   downgrade the operator to a free customer. We bypass `api.get` (which is
 *   cookie-only) and fetch directly with the Clerk Bearer token as a fallback
 *   so authenticated reads succeed regardless of cookie behaviour.
 */

import { useQuery } from "@tanstack/react-query";
import { useUser, useAuth } from "@clerk/react";

export type UserRole = "user" | "admin" | "super-admin";

interface AuthMe {
  role?:  string;
  email?: string;
}

const API_BASE = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? ""
).replace(/\/$/, "");

export function useUserRole() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();

  const { data, isLoading } = useQuery<AuthMe>({
    queryKey:  ["auth-me"],
    queryFn:   async () => {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`auth/me ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`auth/me non-JSON (${ct || "no content-type"})`);
      }
      return res.json() as Promise<AuthMe>;
    },
    enabled:   !!isSignedIn,
    staleTime: 60_000,
    retry:     1,
  });

  const raw  = data?.role;
  const role: UserRole | null = !isSignedIn
    ? null
    : raw === "admin" || raw === "super-admin"
      ? raw
      : raw === undefined
        ? null
        : "user";

  const isSuperAdmin = role === "super-admin";
  const isAdmin      = role === "admin" || isSuperAdmin;

  return {
    role,
    isAdmin,
    isSuperAdmin,
    loading: !isSignedIn ? false : isLoading,
    email:   data?.email ?? null,
  };
}
