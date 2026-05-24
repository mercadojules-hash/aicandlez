import { useEffect, useCallback, useState } from "react";
import { useAuth } from "@clerk/react";
import { authFetch } from "@/lib/authFetch";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
// BASE is the SPA's own base path (not the API host). It is used only for
// the service-worker script URL — same-origin and unrelated to /api/*.
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64     = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(b64);
  const buf     = new ArrayBuffer(raw.length);
  const out     = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export interface PushState {
  supported:  boolean;
  permission: PushPermission;
  subscribed: boolean;
  loading:    boolean;
  subscribe:   () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): PushState {
  const { getToken, isSignedIn } = useAuth();

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager"   in window &&
    "Notification"  in window &&
    !!VAPID_PUBLIC;

  const [permission, setPermission] = useState<PushPermission>(
    supported ? (Notification.permission as PushPermission) : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);

  // ── Register SW + check existing subscription ─────────────────────────────
  useEffect(() => {
    if (!supported || !isSignedIn) return;

    navigator.serviceWorker
      .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) setSubscribed(true);
        setPermission(Notification.permission as PushPermission);
      })
      .catch(() => {});
  }, [supported, isSignedIn, BASE]);

  // ── Subscribe ─────────────────────────────────────────────────────────────
  const subscribe = useCallback(async (): Promise<void> => {
    if (!supported || !VAPID_PUBLIC) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

      const token = await getToken();
      if (!token) return;

      const res = await authFetch(`/api/user/push-token`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token:      JSON.stringify(sub.toJSON()),
          platform:   "web",
          deviceName: navigator.userAgent.slice(0, 150),
        }),
      });

      if (res.ok) setSubscribed(true);
    } catch (err) {
      console.warn("[AICandlez] Push subscription failed:", err);
    } finally {
      setLoading(false);
    }
  }, [supported, getToken, BASE]);

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setSubscribed(false); return; }

      const token = await getToken();
      if (token) {
        await authFetch(`/api/user/push-token`, {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: JSON.stringify(sub.toJSON()) }),
        });
      }

      await sub.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      console.warn("[AICandlez] Push unsubscribe failed:", err);
    } finally {
      setLoading(false);
    }
  }, [supported, getToken, BASE]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
