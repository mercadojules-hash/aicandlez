import { isApiBaseUrlMisconfigured } from "@/lib/authFetch";

// Boot-time diagnostic banner for the PWA. Renders ONLY when on a static
// production host with an empty VITE_API_BASE_URL — same failure mode as
// the trading-dashboard banner. Shown to all PWA users since the PWA has
// no admin role separation.
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
        padding: "10px 14px",
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <strong style={{ color: "#ff8888" }}>BUILD MISCONFIGURED:</strong>{" "}
      <code>VITE_API_BASE_URL</code> is empty. API calls will fail. Set{" "}
      <code>VITE_API_BASE_URL=https://api.aicandlez.com</code> and redeploy.
    </div>
  );
}
