/**
 * feedback.ts — Unified institutional AI feedback infrastructure.
 *
 * SCAFFOLDING for the final notification + sound + haptic system. The aim is
 * "institutional AI terminal" feel, NOT "gambling app". All effects are subtle,
 * premium, and OFF-by-default for haptics so first-run feels calm.
 *
 * Surface area:
 *   • FeedbackPrefs        — single localStorage-backed preference object
 *   • useFeedbackPrefs     — React hook for reading + updating prefs
 *   • triggerHaptic        — navigator.vibrate wrapper, respects user toggle
 *   • playNotificationCue  — premium notification chime via existing audio bus
 *   • shouldNotify         — central gate for "is this alert type enabled?"
 *
 * Push backend (VAPID/Expo/FCM) is intentionally NOT implemented here. The
 * `pushEnabled` flag and the per-alert toggles are read by future push
 * registration code so the user's preferences carry through unchanged.
 *
 * The alert taxonomy itself (keys, labels, defaults) is the single source of
 * truth in `@workspace/db/constants/alertKeys` — the server reads the same
 * module when gating push dispatch, so toggles in the UI cannot drift from
 * what the server actually honors.
 */

import { useCallback, useEffect, useState } from "react";
import { playExecutionSound, type FeedbackState } from "@/lib/executionSounds";
import {
  ALERT_DEFINITIONS,
  defaultAlertPrefs,
  type AlertKey,
} from "@workspace/db/constants/alertKeys";

export { ALERT_DEFINITIONS };
export type { AlertKey };

export interface FeedbackPrefs {
  // Master switches
  pushEnabled:   boolean;
  soundsEnabled: boolean;
  hapticsEnabled:boolean;
  // Per-alert toggles
  alerts:        Record<AlertKey, boolean>;
}

const STORAGE_KEY = "aicandlez_feedback_prefs_v1";

export const DEFAULT_PREFS: FeedbackPrefs = {
  pushEnabled:    false,
  soundsEnabled:  true,
  hapticsEnabled: false, // OFF by default — institutional default
  alerts:         defaultAlertPrefs(),
};

function loadPrefs(): FeedbackPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<FeedbackPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      alerts: { ...defaultAlertPrefs(), ...(parsed.alerts ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: FeedbackPrefs) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

// ── Cross-tab sync ──────────────────────────────────────────────────────────
type Listener = (p: FeedbackPrefs) => void;
const listeners = new Set<Listener>();
function broadcast(p: FeedbackPrefs) { for (const l of listeners) l(p); }

// ── Hook ────────────────────────────────────────────────────────────────────
export function useFeedbackPrefs() {
  const [prefs, setPrefs] = useState<FeedbackPrefs>(() => loadPrefs());

  useEffect(() => {
    const l: Listener = p => setPrefs(p);
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(loadPrefs());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<FeedbackPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch, alerts: { ...prev.alerts, ...(patch.alerts ?? {}) } };
      savePrefs(next);
      broadcast(next);
      return next;
    });
  }, []);

  const toggleAlert = useCallback((key: AlertKey) => {
    setPrefs(prev => {
      const next = { ...prev, alerts: { ...prev.alerts, [key]: !prev.alerts[key] } };
      savePrefs(next);
      broadcast(next);
      return next;
    });
  }, []);

  return { prefs, update, toggleAlert };
}

// ── Effect primitives ───────────────────────────────────────────────────────

/** Subtle premium vibration. Respects user pref + browser support. */
export function triggerHaptic(intensity: "soft" | "medium" | "strong" = "soft") {
  const prefs = loadPrefs();
  if (!prefs.hapticsEnabled) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const pattern =
    intensity === "strong" ? [12, 40, 18] :
    intensity === "medium" ? [10]         :
                             [6];
  try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}

/** Premium notification chime — routes through the existing audio bus. */
export function playNotificationCue(state: FeedbackState) {
  const prefs = loadPrefs();
  if (!prefs.soundsEnabled) return;
  playExecutionSound(state);
}

/** Central gate — should we surface alerts of this type? */
export function shouldNotify(key: AlertKey): boolean {
  const prefs = loadPrefs();
  return prefs.alerts[key] === true;
}
