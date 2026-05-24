import { isApiBaseUrlMisconfigured } from "@/lib/authFetch";
import { AlertTriangle } from "lucide-react";

// Boot-time diagnostic banner. Renders ONLY when:
//   • we are on a static production host (admintrade./trade./app.aicandlez.com), AND
//   • VITE_API_BASE_URL is empty at build time
//
// Intentionally NOT gated by useUserRole(). In the misconfigured state
// `/api/auth/me` returns HTML, useUserRole degrades to role="user", and
// gating on `isAdmin` would suppress the banner exactly when operators
// need to see it. Visible to everyone on the misconfigured host —
// non-admin customers seeing the warning is far better than silent
// data-empty pages on every dashboard. See lib/authFetch.ts for context.
export function ApiBaseUrlBanner() {
  if (!isApiBaseUrlMisconfigured()) return null;

  return (
    <div
      role="alert"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: "#3a0a0a",
        borderBottom: "1px solid #ff4455",
        color: "#ffdddd",
        padding: "10px 16px",
        fontFamily: "monospace",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <AlertTriangle style={{ width: 16, height: 16, color: "#ff4455", flexShrink: 0 }} />
      <span>
        <strong style={{ color: "#ff8888" }}>BUILD MISCONFIGURED:</strong>{" "}
        <code>VITE_API_BASE_URL</code> is empty on{" "}
        <code>{typeof window !== "undefined" ? window.location.hostname : ""}</code>.{" "}
        Every <code>/api/*</code> request will hit the SPA fallback and return HTML.{" "}
        Set <code>VITE_API_BASE_URL=https://api.aicandlez.com</code> on this Render service and redeploy.
      </span>
    </div>
  );
}
