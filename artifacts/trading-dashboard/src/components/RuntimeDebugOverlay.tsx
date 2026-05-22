import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/react";
import { useUserRole } from "@/hooks/useUserRole";

const apiBaseUrl = (
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ??
  (import.meta.env.BASE_URL ?? "/")
).replace(/\/$/, "");

type MeProbe = {
  status: number | null;
  contentType: string | null;
  bodyRole: string | null;
  bodyEmail: string | null;
  bodyClerkUserId: string | null;
  rawBody: string;
  err: string | null;
};

export function RuntimeDebugOverlay() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { role, isAdmin, isSuperAdmin, loading, email } = useUserRole();
  const [probe, setProbe] = useState<MeProbe>({
    status:          null,
    contentType:     null,
    bodyRole:        null,
    bodyEmail:       null,
    bodyClerkUserId: null,
    rawBody:         "",
    err:             null,
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken().catch(() => null);
        const res = await fetch(`${apiBaseUrl}/api/auth/me`, {
          credentials: "include",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const ct = res.headers.get("content-type") ?? "";
        const text = await res.text();
        let parsed: { role?: string; email?: string; clerkUserId?: string } = {};
        try { parsed = JSON.parse(text); } catch { /* HTML/error body */ }
        if (cancelled) return;
        setProbe({
          status:          res.status,
          contentType:     ct,
          bodyRole:        parsed.role ?? null,
          bodyEmail:       parsed.email ?? null,
          bodyClerkUserId: parsed.clerkUserId ?? null,
          rawBody:         text.slice(0, 240),
          err:             null,
        });
      } catch (err) {
        if (cancelled) return;
        setProbe((p) => ({ ...p, err: (err as Error).message }));
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  const hostname = typeof window !== "undefined" ? window.location.hostname : "?";
  const branch =
    loading       ? "RESOLVING…"
    : isAdmin     ? "ADMIN"
    : "CUSTOMER";

  const branchColor =
    loading   ? "#ffaa00"
    : isAdmin ? "#66FF66"
    : "#ff3355";

  const baseRow: React.CSSProperties = {
    display: "grid", gridTemplateColumns: "120px 1fr", gap: 6,
    fontSize: 11, lineHeight: 1.4,
  };

  return (
    <div
      style={{
        position:     "fixed",
        top:          12,
        left:         12,
        zIndex:       2147483647,
        background:   "rgba(0,0,0,0.92)",
        border:       `2px solid ${branchColor}`,
        borderRadius: 8,
        padding:      collapsed ? "6px 10px" : "12px 14px",
        fontFamily:   "ui-monospace, SFMono-Regular, Menlo, monospace",
        color:        "#e8ffe8",
        boxShadow:    `0 0 24px ${branchColor}55, 0 0 0 1px ${branchColor}33 inset`,
        maxWidth:     460,
        minWidth:     collapsed ? 0 : 320,
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          cursor:        "pointer",
          display:       "flex",
          alignItems:    "center",
          justifyContent:"space-between",
          gap:           10,
          fontSize:      11,
          fontWeight:    800,
          letterSpacing: "0.16em",
          color:         branchColor,
          textShadow:    `0 0 8px ${branchColor}90`,
          marginBottom:  collapsed ? 0 : 10,
        }}
      >
        <span>● RUNTIME · {branch}</span>
        <span style={{ opacity: 0.6, fontWeight: 600 }}>{collapsed ? "[+]" : "[−]"}</span>
      </div>

      {!collapsed && (
        <>
          <div style={baseRow}>
            <span style={{ color: "#88a" }}>hostname</span>
            <span>{hostname}</span>

            <span style={{ color: "#88a" }}>branch</span>
            <span style={{ color: branchColor, fontWeight: 800 }}>{branch}</span>

            <span style={{ color: "#88a" }}>role</span>
            <span style={{ color: isSuperAdmin ? "#7CFF00" : isAdmin ? "#66FF66" : "#ff8090" }}>
              {role ?? "(null — loading)"}
            </span>

            <span style={{ color: "#88a" }}>isAdmin</span>
            <span style={{ color: isAdmin ? "#66FF66" : "#ff8090" }}>{String(isAdmin)}</span>

            <span style={{ color: "#88a" }}>isSuperAdmin</span>
            <span>{String(isSuperAdmin)}</span>

            <span style={{ color: "#88a" }}>loading</span>
            <span>{String(loading)}</span>

            <span style={{ color: "#88a" }}>email</span>
            <span>{email ?? "(none)"}</span>

            <span style={{ color: "#88a" }}>clerkUserId</span>
            <span style={{ wordBreak: "break-all" }}>
              {user?.id ?? "(no clerk user)"}
            </span>

            <span style={{ color: "#88a" }}>clerk.isLoaded</span>
            <span>{String(isLoaded)}</span>

            <span style={{ color: "#88a" }}>clerk.isSignedIn</span>
            <span>{String(isSignedIn)}</span>

            <span style={{ color: "#88a" }}>apiBaseUrl</span>
            <span style={{ wordBreak: "break-all" }}>{apiBaseUrl || "(same-origin)"}</span>
          </div>

          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: "1px dashed rgba(102,255,102,0.25)",
          }}>
            <div style={{
              fontSize: 10, color: "#66FF66", letterSpacing: "0.14em",
              fontWeight: 700, marginBottom: 6,
            }}>
              /api/auth/me PROBE
            </div>
            <div style={baseRow}>
              <span style={{ color: "#88a" }}>http status</span>
              <span style={{
                color: probe.status === 200 || probe.status === 201 ? "#66FF66"
                     : probe.status === null ? "#ffaa00"
                     : "#ff3355",
              }}>
                {probe.status ?? "(pending)"}
              </span>

              <span style={{ color: "#88a" }}>content-type</span>
              <span style={{ wordBreak: "break-all" }}>{probe.contentType ?? "—"}</span>

              <span style={{ color: "#88a" }}>body.role</span>
              <span style={{
                color: probe.bodyRole === "super-admin" ? "#7CFF00"
                     : probe.bodyRole === "admin" ? "#66FF66"
                     : probe.bodyRole === "user" ? "#ff8090"
                     : "#ffaa00",
                fontWeight: 800,
              }}>
                {probe.bodyRole ?? "(absent)"}
              </span>

              <span style={{ color: "#88a" }}>body.email</span>
              <span>{probe.bodyEmail ?? "(absent)"}</span>

              <span style={{ color: "#88a" }}>body.clerkUserId</span>
              <span style={{ wordBreak: "break-all" }}>
                {probe.bodyClerkUserId ?? "(absent)"}
              </span>

              {probe.err && (
                <>
                  <span style={{ color: "#88a" }}>FETCH ERROR</span>
                  <span style={{ color: "#ff3355" }}>{probe.err}</span>
                </>
              )}
            </div>
            {probe.rawBody && (
              <div style={{
                marginTop: 8, padding: "6px 8px",
                background: "rgba(102,255,102,0.06)",
                border: "1px solid rgba(102,255,102,0.18)",
                borderRadius: 4,
                fontSize: 10, color: "#9fb",
                wordBreak: "break-all", whiteSpace: "pre-wrap",
                maxHeight: 120, overflowY: "auto",
              }}>
                {probe.rawBody}
              </div>
            )}
          </div>

          <div style={{
            marginTop: 10, paddingTop: 8,
            borderTop: "1px dashed rgba(102,255,102,0.25)",
            fontSize: 10, color: "#88a", lineHeight: 1.5,
          }}>
            {isAdmin
              ? "If you see customer UI below despite ADMIN branch, the issue is component-level — search Portal.tsx for `!isAdmin`."
              : probe.bodyRole === "user"
                ? "DB confirms role=user. Promotion not applied. Check email vs SUPER_ADMIN_EMAILS or DB row directly."
                : probe.status === 401
                  ? "API returned 401 — session not reaching api host. Cross-origin cookie likely blocked (Safari ITP / SameSite)."
                  : probe.status && probe.status >= 400
                    ? "API errored — see http status + raw body above."
                    : "Waiting for /api/auth/me…"}
          </div>
        </>
      )}
    </div>
  );
}
