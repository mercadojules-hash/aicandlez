import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, AlertTriangle, TrendingUp, Info, Zap } from "lucide-react";

const Q_OPTS = { refetchOnWindowFocus: false, retry: false } as const;

const UNREAD_ONLY_STORAGE_KEY = "aicandlez_notifications_unread_only_v1";

function loadUnreadOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(UNREAD_ONLY_STORAGE_KEY) === "1";
  } catch { return false; }
}

function saveUnreadOnly(v: boolean) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(UNREAD_ONLY_STORAGE_KEY, v ? "1" : "0"); } catch { /* quota */ }
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const TYPE_META: Record<string, { color: string; icon: React.FC<{ size?: number }> }> = {
  TRADE_EXECUTED: { color: "#00ff8a", icon: TrendingUp },
  RISK_ALERT:     { color: "#ff3355", icon: AlertTriangle },
  SIGNAL:         { color: "#00f0ff", icon: Zap },
  SYSTEM:         { color: "#4a8fa8", icon: Info },
};

function getMeta(type: string) {
  return TYPE_META[type] ?? { color: "#9FB3C8", icon: Info };
}

export default function Alerts() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnlyState] = useState<boolean>(() => loadUnreadOnly());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === UNREAD_ONLY_STORAGE_KEY) {
        setUnreadOnlyState(e.newValue === "1");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setUnreadOnly = (v: boolean) => {
    setUnreadOnlyState(v);
    saveUnreadOnly(v);
  };

  const { data, isLoading } = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey:        ["notifications-page"],
    queryFn:         () => fetch("/api/user/notifications").then(r => r.json()),
    refetchInterval: 15_000,
    ...Q_OPTS,
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch("/api/user/notifications/read-all", { method: "POST" }).then(r => r.json()),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notifications-page"] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => fetch(`/api/user/notifications/${id}/read`, { method: "POST" }).then(r => r.json()),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["notifications-page"] }),
  });

  const allNotifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const notifications = useMemo(
    () => unreadOnly ? allNotifications.filter(n => !n.read) : allNotifications,
    [allNotifications, unreadOnly],
  );

  return (
    <div style={{ padding: "24px 28px", fontFamily: "monospace", color: "#EAF2FF", background: "#000508", minHeight: "100vh" }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 9, color: "#2a4a60", letterSpacing: "0.25em", marginBottom: 6, textTransform: "uppercase" }}>
            OPERATOR CONSOLE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#EAF2FF", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 10 }}>
              <Bell size={18} style={{ color: "#00aaff" }} />
              System Alerts
            </div>
            {unread > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: "3px 10px", borderRadius: 10,
                background: "#ff660018", color: "#ff6600",
                border: "1px solid #ff660040",
                letterSpacing: "0.1em",
              }}>
                {unread} UNREAD
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#3a5a70", marginTop: 4 }}>
            Real-time trade, signal, and risk notifications
          </div>
        </div>

        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 3,
              background: "#00aaff0a", color: "#00aaff",
              border: "1px solid #00aaff35",
              cursor: "pointer", fontSize: 9,
              fontFamily: "monospace", fontWeight: 700,
              letterSpacing: "0.12em",
              opacity: markAllRead.isPending ? 0.6 : 1,
            }}>
            <CheckCheck size={12} />
            MARK ALL READ
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => setUnreadOnly(!unreadOnly)}
          aria-pressed={unreadOnly}
          aria-label={unreadOnly ? "Showing unread only, click to show all" : "Show unread only"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "7px 14px", borderRadius: 3,
            background: unreadOnly ? "#00aaff14" : "#00060c",
            border: `1px solid ${unreadOnly ? "#00aaff55" : "#0d1e2e"}`,
            color: unreadOnly ? "#00aaff" : "#7a9eb8",
            cursor: "pointer", fontSize: 9, fontFamily: "monospace",
            fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: unreadOnly ? "#00aaff" : "#2a4050",
            boxShadow: unreadOnly ? "0 0 6px #00aaff" : "none",
          }}/>
          UNREAD ONLY
          <span style={{ color: unreadOnly ? "#00aaff" : "#3a5a70", letterSpacing: 0 }}>
            {unread > 99 ? "99+" : unread}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: "48px 32px", textAlign: "center", border: "1px solid #0d1e2e", borderRadius: 3 }}>
          <div style={{ fontSize: 10, color: "#2a4050", letterSpacing: "0.15em" }}>CONNECTING…</div>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: "56px 32px", textAlign: "center", border: "1px solid #0d1e2e", borderRadius: 3 }}>
          <div style={{ margin: "0 auto 14px", display: "flex", justifyContent: "center", color: "#1e3a50" }}>
            <Bell size={22} />
          </div>
          <div style={{ fontSize: 12, color: "#3a5a70" }}>
            {unreadOnly ? "No unread alerts" : "No alerts"}
          </div>
          <div style={{ fontSize: 9, color: "#2a4050", marginTop: 5 }}>
            {unreadOnly
              ? "You're all caught up. Click UNREAD ONLY again to see everything."
              : "Trade executions, signal events and risk notifications will appear here"}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #0d1e2e", borderRadius: 3, overflow: "hidden" }}>
          {notifications.map(n => {
            const meta = getMeta(n.type);
            const Icon = meta.icon;
            return (
              <div
                key={n.id}
                onClick={() => !n.read && markOne.mutate(n.id)}
                style={{
                  display: "flex", gap: 14, padding: "13px 18px",
                  background: n.read ? "#000000" : "#000c16",
                  borderBottom: "1px solid #07111a",
                  borderLeft: `3px solid ${n.read ? "#0a1420" : meta.color}`,
                  cursor: n.read ? "default" : "pointer",
                  transition: "background 0.15s",
                }}>
                <div style={{ flexShrink: 0, marginTop: 2, color: n.read ? `${meta.color}40` : meta.color }}>
                  <Icon size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 6.5, fontWeight: 700,
                      padding: "1.5px 6px", borderRadius: 2,
                      background: `${meta.color}10`, color: meta.color,
                      textTransform: "uppercase", letterSpacing: "0.12em",
                    }}>
                      {n.type.replace(/_/g, " ")}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: n.read ? "#EAF2FF60" : "#EAF2FF",
                    }}>
                      {n.title}
                    </span>
                    {!n.read && (
                      <span style={{ marginLeft: "auto", fontSize: 7, color: meta.color, letterSpacing: "0.1em" }}>
                        ● UNREAD
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: n.read ? "#4a6a80" : "#7a9eb8", lineHeight: 1.55 }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 8, color: "#2a4050", marginTop: 5 }}>
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
