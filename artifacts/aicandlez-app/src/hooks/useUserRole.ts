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
 */

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { api } from "@/lib/api";

export type UserRole = "user" | "admin" | "super-admin";

interface AuthMe {
  role?: string;
  email?: string;
}

export function useUserRole() {
  const { isSignedIn } = useUser();

  const { data, isLoading } = useQuery<AuthMe>({
    queryKey:  ["auth-me"],
    queryFn:   () => api.get<AuthMe>("/auth/me"),
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
