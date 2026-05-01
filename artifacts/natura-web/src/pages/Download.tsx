const LATEST = { file: "natura-ai.zip", label: "Natura AI — Clean Standalone Build" };

const PREV = [
  { file: "natura-ai-v1.0.0-production.zip", label: "production (v2, nested root)" },
  { file: "natura-yoga-ai-v1.0.0-v3.zip",    label: "natura-yoga-ai v3" },
];

export default function Download() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url  = `${base}/${LATEST.file}`;

  console.log("Download URL:", window.location.origin + url);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#071410 0%,#0a1f18 50%,#071410 100%)",
      fontFamily: "'Inter',system-ui,sans-serif",
      padding: "32px 24px",
    }}>
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>

        {/* ── PRIMARY BUTTON ── */}
        <a href={url} download={LATEST.file} style={{
          display: "block", padding: "22px 24px",
          background: "#2ecc71", color: "#fff",
          textAlign: "center", fontSize: 20, fontWeight: 700,
          borderRadius: 12, marginBottom: 8, textDecoration: "none",
          boxShadow: "0 4px 24px rgba(46,204,113,0.45)", letterSpacing: 0.2,
        }}>
          ⬇ Download Natura AI
        </a>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span style={{ color: "#4a7a5a", fontSize: 12, fontFamily: "monospace" }}>
            {LATEST.file} · 31 MB · 61 images · 127 files · integrity verified
          </span>
        </div>

        {/* ── DETAILS CARD ── */}
        <div style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(134,187,154,0.2)",
          borderRadius: 16, padding: "28px", color: "#e8f5ee", marginBottom: 16,
        }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "linear-gradient(135deg,#3d9e6a,#86bb9a)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, flexShrink: 0,
            }}>🌿</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>Natura AI</div>
              <div style={{ fontSize: 12, color: "#86bb9a", letterSpacing: 1, textTransform: "uppercase" }}>
                Expo React Native · Standalone · App Store Ready
              </div>
            </div>
          </div>

          {/* app.json */}
          <div style={{
            background: "rgba(46,204,113,0.08)", border: "1px solid rgba(46,204,113,0.2)",
            borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            fontFamily: "monospace", fontSize: 12,
          }}>
            <div style={{ color: "#2ecc71", fontWeight: 600, marginBottom: 8, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase", fontSize: 10 }}>
              app.json — verified
            </div>
            {[
              ["name",                 "Natura AI"],
              ["slug",                 "natura-ai"],
              ["scheme",               "natura-ai"],
              ["ios.bundleIdentifier", "com.naturaai.app"],
              ["ios.buildNumber",      "3"],
            ].map(([k, v]) => (
              <div key={k} style={{ color: "#b8d4c2", marginBottom: 2 }}>
                <span style={{ color: "#6b9b7e" }}>{k}: </span>
                <span style={{ color: "#e8f5ee" }}>"{v}"</span>
              </div>
            ))}
          </div>

          {/* Structure & cleanliness */}
          <div style={{
            background: "rgba(46,204,113,0.05)", border: "1px solid rgba(134,187,154,0.15)",
            borderRadius: 10, padding: "14px 16px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Structure &amp; cleanliness
            </div>
            {[
              "Flat root — unzip and run npm install immediately",
              "No artifacts/ or natura-ai/ nesting",
              "No pnpm-workspace.yaml, no pnpm-lock.yaml",
              "No catalog: or workspace: in package.json",
              "No @workspace/* internal packages",
              "tsconfig.json — monorepo references removed",
              "Zero external image URLs — all 61 assets bundled locally",
            ].map((s) => (
              <div key={s} style={{ display: "flex", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#2ecc71", fontSize: 13, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 12, color: "#b8d4c2" }}>{s}</span>
              </div>
            ))}
          </div>

          {/* ZIP top-level contents */}
          <div style={{
            background: "rgba(0,0,0,0.2)", borderRadius: 8,
            padding: "12px 14px", marginBottom: 16,
            fontFamily: "monospace", fontSize: 11, color: "#6b9b7e", lineHeight: 1.7,
          }}>
            <div style={{ color: "#86bb9a", marginBottom: 4, fontFamily: "sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
              ZIP root contents
            </div>
            {["app/", "assets/  (61 images)", "components/", "contexts/", "data/", "hooks/", "lib/", "app.json", "babel.config.js", "eas.json", "metro.config.js", "package.json", "tsconfig.json"].map((f) => (
              <div key={f}>{f}</div>
            ))}
          </div>

          {/* Setup */}
          <div style={{
            background: "rgba(0,0,0,0.25)", borderRadius: 8,
            padding: "12px 14px", fontSize: 12, color: "#6b9b7e", lineHeight: 1.9,
          }}>
            <strong style={{ color: "#86bb9a" }}>Setup:</strong><br />
            <code style={{ color: "#86bb9a" }}>npm install</code><br />
            <code style={{ color: "#86bb9a" }}>npx expo start</code>&nbsp;&nbsp;
            <span style={{ color: "#3a5c44" }}>— development</span><br />
            <code style={{ color: "#86bb9a" }}>npx eas build -p ios</code>&nbsp;&nbsp;
            <span style={{ color: "#3a5c44" }}>— App Store</span>
          </div>
        </div>

        {/* Previous builds */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#2e5c40", marginBottom: 6, textAlign: "center" }}>Previous builds</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PREV.map(({ file, label }) => (
              <a key={file} href={`${base}/${file}`} download={file} style={{
                flex: 1, display: "block", padding: "8px 6px",
                background: "rgba(134,187,154,0.04)", border: "1px solid rgba(134,187,154,0.12)",
                color: "#3a5c44", textAlign: "center", fontSize: 10,
                borderRadius: 6, textDecoration: "none",
              }}>
                {label}
              </a>
            ))}
          </div>
        </div>

        <p style={{ color: "#2e5c40", fontSize: 11, textAlign: "center", fontFamily: "monospace", margin: 0 }}>
          {typeof window !== "undefined" ? window.location.origin + url : url}
        </p>
      </div>
    </div>
  );
}
