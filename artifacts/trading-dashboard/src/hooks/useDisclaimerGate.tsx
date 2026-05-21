/**
 * useDisclaimerGate (trading-dashboard) — see PWA equivalent for full doc.
 *
 * Wraps gated customer actions with the mandatory risk-disclaimer modal.
 * Admin / super-admin bypass entirely (both client-side via this hook,
 * which short-circuits when /api/user/disclaimer reports `bypass: true`,
 * and server-side via the `requireDisclaimer` middleware).
 */

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { DisclaimerModal } from "@/components/DisclaimerModal";
import type { DisclaimerAcks } from "@workspace/db";

interface DisclaimerStatus {
  needsAcceptance: boolean;
  bypass:          boolean;
  currentVersion:  string;
  accepted:        boolean;
  acceptedVersion: string | null;
  acceptedAt:      string | null;
}

export function useDisclaimerGate() {
  const { getToken, isSignedIn } = useAuth();
  const [status,        setStatus]     = useState<DisclaimerStatus | null>(null);
  const [open,          setOpen]       = useState(false);
  const [submitting,    setSubmitting] = useState(false);
  const [error,         setError]      = useState<string | null>(null);
  const [pendingAction, setPending]    = useState<(() => void) | null>(null);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const t = await getToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    } catch { return {}; }
  }, [getToken]);

  const fetchStatus = useCallback(async () => {
    if (!isSignedIn) { setStatus(null); return; }
    try {
      const r = await fetch("/api/user/disclaimer", {
        credentials: "include",
        headers:     await authHeader(),
      });
      if (!r.ok) { setStatus(null); return; }
      const data = await r.json() as DisclaimerStatus;
      setStatus(data);
    } catch { setStatus(null); }
  }, [isSignedIn, authHeader]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const gate = useCallback((action: () => void) => {
    if (status && !status.needsAcceptance) {
      action();
      return;
    }
    setError(null);
    setPending(() => action);
    setOpen(true);
  }, [status]);

  const onAccept = useCallback(async (acks: DisclaimerAcks) => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/user/disclaimer", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json", ...(await authHeader()) },
        body:        JSON.stringify(acks),
      });
      const data = await r.json().catch(() => ({} as { error?: string }));
      if (!r.ok) {
        const errBody = data as { error?: string };
        throw new Error(errBody.error ?? `Failed to record acceptance (HTTP ${r.status})`);
      }
      await fetchStatus();
      const action = pendingAction;
      setOpen(false);
      setPending(null);
      if (action) setTimeout(action, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [authHeader, fetchStatus, pendingAction]);

  const onCancel = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setPending(null);
    setError(null);
  }, [submitting]);

  const modal = (
    <DisclaimerModal
      open={open}
      submitting={submitting}
      error={error}
      onAccept={onAccept}
      onCancel={onCancel}
    />
  );

  return { gate, modal, status };
}
