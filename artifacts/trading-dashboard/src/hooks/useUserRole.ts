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

    // Robust role resolution.
    //   • 401 → user really isn't authenticated, fall through to "user"
    //     (the route guard will catch and redirect to /sign-in).
    //   • Non-JSON response (HTML, etc.) → API base URL is mis-routed
    //     (likely hitting the SPA host instead of api.aicandlez.com). Retry
    //     a few times then surface as "user" with a loud console error.
    //   • Network/parse failure → retry transient blips before downgrading.
    // NEVER silently demote on a single transient failure — that's how a
    // super-admin ends up bounced to /portal on a flaky page load.
    const MAX_ATTEMPTS = 3;

    (async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
            credentials: "include",
            headers:     { Accept: "application/json" },
          });

          if (res.status === 401) {
            if (!cancelled) { setRole("user"); setLoading(false); }
            return;
          }

          const ct = res.headers.get("content-type") ?? "";
          if (!res.ok || !ct.includes("application/json")) {
            // Wrong-host SPA HTML or upstream error — retry.
            console.error(
              `[useUserRole] /api/auth/me unexpected response (attempt ${attempt}/${MAX_ATTEMPTS}):`,
              { status: res.status, contentType: ct, url: `${apiBaseUrl}/api/auth/me` },
            );
            if (attempt === MAX_ATTEMPTS) {
              if (!cancelled) { setRole("user"); setLoading(false); }
              return;
            }
            await new Promise((r) => setTimeout(r, 400 * attempt));
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
          console.error(
            `[useUserRole] /api/auth/me threw (attempt ${attempt}/${MAX_ATTEMPTS}):`,
            err,
          );
          if (attempt === MAX_ATTEMPTS) {
            if (!cancelled) { setRole("user"); setLoading(false); }
            return;
          }
          await new Promise((r) => setTimeout(r, 400 * attempt));
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
