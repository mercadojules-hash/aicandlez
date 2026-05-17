/* ── AICandlez Service Worker — Web Push + Offline ──────────────────────────── */

const CACHE = "aicandlez-v1";
const SCOPE = self.registration.scope;
const ICON  = SCOPE + "aicandlez-logo.png";

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Push handler ──────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: "AICandlez", body: event.data.text() }; }

  const title   = data.title   ?? "AICandlez";
  const body    = data.body    ?? data.message ?? "";
  const url     = data.url     ?? SCOPE;
  const tag     = data.tag     ?? "aicandlez-alert";
  const notifType = data.notifType ?? "general";

  const badgeColor =
    notifType === "buy"  ? "#00ff88" :
    notifType === "sell" ? "#ff3355" :
    notifType === "risk" ? "#ffd200" :
    "#00e5ff";

  const options = {
    body,
    icon:               ICON,
    badge:              ICON,
    tag,
    renotify:           true,
    requireInteraction: notifType === "risk",
    silent:             false,
    data:               { url, notifType, ...data },
    actions: [
      { action: "open",    title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
    vibrate: notifType === "risk" ? [200, 100, 200, 100, 200] : [100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? SCOPE;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      for (const client of all) {
        if (client.url.startsWith(SCOPE) && "focus" in client) {
          client.postMessage({ type: "notification_click", data: event.notification.data });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});

// ── Background sync / fetch passthrough ──────────────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/")) return;
  // Passthrough — no aggressive caching in trading context (data must be fresh)
});
