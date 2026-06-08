import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/react";
import { API_BASE_URL } from "@/lib/authFetch";

// ─────────────────────────────────────────────────────────────────────────────
// useUserRole — single source of truth for the signed-in user's platform role.
// Fetches /api/auth/me (shared AICandlez identity endpoint) which JIT-provisions
// the row and auto-promotes allowlisted emails. Jarvis reuses this identity.
// ─────────────────────────────────────────────────────────────────────────────

const apiBaseUrl =
  API_BASE_URL || (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export type UserRole = "user" | "admin" | "super-admin";

interface UseUserRoleResult {
  role: UserRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  email: string | null;
}

export function useUserRole(): UseUserRoleResult {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState<string | null>(null);
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
    const MAX_ATTEMPTS = 3;

    (async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const token = await getToken().catch(() => null);
          const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
            credentials: "include",
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          if (res.status === 401) {
            if (!cancelled) {
              setRole("user");
              setLoading(false);
            }
            return;
          }

          const ct = res.headers.get("content-type") ?? "";
          if (!res.ok || !ct.includes("application/json")) {
            if (attempt === MAX_ATTEMPTS) {
              if (!cancelled) {
                setRole("user");
                setLoading(false);
              }
              return;
            }
            await new Promise((r) => setTimeout(r, 200 * attempt));
            continue;
          }

          const data = (await res.json()) as { role?: string; email?: string };
          if (cancelled) return;
          const r = (data.role ?? "user") as UserRole;
          setRole(r === "admin" || r === "super-admin" ? r : "user");
          setEmail(data.email ?? null);
          setLoading(false);
          return;
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) {
            if (!cancelled) {
              setRole("user");
              setLoading(false);
            }
            return;
          }
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id, getToken]);

  const isSuperAdmin = role === "super-admin";
  const isAdmin = role === "admin" || isSuperAdmin;

  return { role, isAdmin, isSuperAdmin, loading, email };
}
