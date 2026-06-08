// ─────────────────────────────────────────────────────────────────────────────
// Desktop Edition stub for `@clerk/react` (aliased in vite.config.ts).
// Runs the Jarvis SPA single-user with NO Clerk / no SaaS dependency: everyone is
// the local desktop super-admin and the backend authorizes every request
// identically. Only the surface the app actually imports is implemented.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";

// authFetch.waitForClerk() polls window.Clerk; declare a loaded + session-less
// Clerk so it returns immediately (no 3s stall) and attaches no Bearer token.
if (typeof window !== "undefined") {
  (window as unknown as { Clerk?: unknown }).Clerk = {
    loaded: true,
    session: null,
  };
}

const LOCAL_USER = {
  id: "local-admin",
  primaryEmailAddress: { emailAddress: "admin@localhost" },
  fullName: "Local Admin",
};

export function ClerkProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function ClerkLoading(_props: { children?: React.ReactNode }) {
  return null;
}

export function ClerkLoaded({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Show({
  when,
  children,
}: {
  when?: string;
  children?: React.ReactNode;
}) {
  // Single local user is always signed in.
  return when === "signed-out" ? null : <>{children}</>;
}

export function SignedIn({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function SignedOut(_props: { children?: React.ReactNode }) {
  return null;
}

export function SignIn(_props: Record<string, unknown>) {
  return null;
}

export function SignUp(_props: Record<string, unknown>) {
  return null;
}

export function RedirectToSignIn() {
  return null;
}

export function UserButton(_props: Record<string, unknown>) {
  return null;
}

export function useUser() {
  return { isLoaded: true, isSignedIn: true, user: LOCAL_USER };
}

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: LOCAL_USER.id,
    getToken: async (): Promise<string | null> => null,
    signOut: async (): Promise<void> => {},
  };
}

export function useClerk() {
  return { signOut: async (): Promise<void> => {} };
}
