/**
 * useDisclaimerGate — wraps gated customer actions with the risk disclaimer.
 *
 * Usage:
 *   const { gate, modal } = useDisclaimerGate();
 *   ...
 *   <button onClick={() => gate(() => checkout.mutate(plan.id))}>
 *   {modal}
 *
 * Flow:
 *   1. gate(action) checks DB-backed disclaimer status from /api/user/disclaimer.
 *   2. If admin / already accepted → runs action immediately.
 *   3. Otherwise opens the modal. On accept → POST /api/user/disclaimer → runs
 *      pending action. On cancel → resets state, action never runs.
 *
 * Server enforcement is still applied via `requireDisclaimer` middleware on
 * /api/billing/checkout + /api/user/exchanges/connect — this hook is the
 * UX-friendly client-side pre-check.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  const qc = useQueryClient();
  const [open,          setOpen]       = useState(false);
  const [submitting,    setSubmitting] = useState(false);
  const [error,         setError]      = useState<string | null>(null);
  const [pendingAction, setPending]    = useState<(() => void) | null>(null);

  const { data: status } = useQuery<DisclaimerStatus>({
    queryKey:  ["user-disclaimer"],
    queryFn:   () => api.get<DisclaimerStatus>("/user/disclaimer"),
    staleTime: 30_000,
    retry:     1,
  });

  const accept = useMutation({
    mutationFn: (acks: DisclaimerAcks) =>
      api.post<{ ok: boolean; disclaimerVersion: string }>("/user/disclaimer", acks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-disclaimer"] });
    },
  });

  const gate = useCallback((action: () => void) => {
    // Already accepted or operator bypass → run immediately
    if (status && !status.needsAcceptance) {
      action();
      return;
    }
    // Unknown / pending fetch — be safe and require explicit acceptance
    setError(null);
    setPending(() => action);
    setOpen(true);
  }, [status]);

  const onAccept = useCallback(async (acks: DisclaimerAcks) => {
    setSubmitting(true);
    setError(null);
    try {
      await accept.mutateAsync(acks);
      const action = pendingAction;
      setOpen(false);
      setPending(null);
      // Defer to next tick so the modal unmount finishes before the action
      // (which may redirect away) runs.
      if (action) setTimeout(action, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [accept, pendingAction]);

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
