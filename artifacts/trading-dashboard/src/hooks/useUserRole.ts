import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";

// ─────────────────────────────────────────────────────────────────────────────
// useUserRole
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the signed-in user's platform role on the
// trading-dashboard. Fetches /api/auth/me which JIT-provisions the row and
// auto-promotes allowlisted emails to `super-admin`.
//
//   role        — "user" | "admin" | "super-admin" | null (while loading)
//   isAdmin     — true for admin OR super-admin (operator capable)
//   isSuperAdmin— true only for super-admin
//   loading     — true until both Clerk + /auth/me resolve
// ─────────────────────────────────────────────────────────────────────────────

// Resolve API base URL. In production this is the cross-origin API host
// (e.g. https://api.aicandlez.com) supplied via VITE_API_BASE_URL. In dev it
// falls back to the same-origin Vite proxy.
const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

export type UserRole = "user" | "admin" | "super-admin";

interface UseUserRoleResult {
  role:         UserRole | null;
  isAdmin:      boolean;
  isSuperAdmin: boolean;
  loading:      boolean;
  email:        string | null;
}

export function useUserRole(): UseUserRoleResult {
  const { isLoaded, isSignedIn, user } = useUser();
  const [role,    setRole]    = useState<UserRole | null>(null);
  const [email,   setEmail]   = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setRole(null);
      setEmail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) {
            setRole("user");
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { role?: string; email?: string };
        if (cancelled) return;
        const r = (data.role ?? "user") as UserRole;
        setRole(r === "admin" || r === "super-admin" ? r : "user");
        setEmail(data.email ?? null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setRole("user");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  const isSuperAdmin = role === "super-admin";
  const isAdmin      = role === "admin" || isSuperAdmin;

  return { role, isAdmin, isSuperAdmin, loading, email };
}
