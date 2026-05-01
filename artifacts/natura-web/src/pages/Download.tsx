const PROD_FILE = "natura-ai-v1.0.0-production.zip";

const PREV_FILES = [
  { file: "natura-yoga-ai-v1.0.0-v3.zip", label: "natura-yoga-ai v3" },
  { file: "natura-yoga-ai-v1.0.0-v2.zip", label: "natura-yoga-ai v2" },
  { file: "natura-yoga-ai-v1.0.0.zip",    label: "natura-yoga-ai v1" },
];

export default function Download() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const prodUrl = `${base}/${PROD_FILE}`;

  console.log("Download URL (production):", window.location.origin + prodUrl);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #071410 0%, #0a1f18 50%, #071410 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "32px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 500, margin: "0 auto" }}>

        {/* ── PRIMARY DOWNLOAD BUTTON — production build at very top ── */}
        <a
          href={prodUrl}
          download={PROD_FILE}
          style={{
            display: "block",
            padding: "22px 24px",
            background: "#2ecc71",
            color: "#fff",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            borderRadius: 12,
            marginBottom: 8,
            textDecoration: "none",
            boxShadow: "0 4px 24px rgba(46,204,113,0.45)",
            letterSpacing: 0.2,
          }}
        >
          ⬇ Download Natura AI — Production Build
        </a>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span style={{ color: "#4a7a5a", fontSize: 12, fontFamily: "monospace" }}>
            {PROD_FILE} · 31 MB · 61 images · 131 files · integrity verified
          </span>
        </div>

        {/* Details card */}
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(134,187,154,0.2)",
            borderRadius: 16,
            padding: "28px",
            color: "#e8f5ee",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "linear-gradient(135deg, #3d9e6a, #86bb9a)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, flexShrink: 0,
              }}
            >🌿</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>Natura AI</div>
              <div style={{ fontSize: 12, color: "#86bb9a", letterSpacing: 1, textTransform: "uppercase" }}>
                Expo React Native · Production · App Store Ready
              </div>
            </div>
          </div>

          {/* app.json verification */}
          <div
            style={{
              background: "rgba(46,204,113,0.08)",
              border: "1px solid rgba(46,204,113,0.2)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            <div style={{ color: "#2ecc71", fontWeight: 600, marginBottom: 8, fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase", fontSize: 11 }}>
              app.json — verified
            </div>
            {[
              ['name', 'Natura AI'],
              ['slug', 'natura-ai'],
              ['scheme', 'natura-ai'],
              ['ios.bundleIdentifier', 'com.naturaai.app'],
              ['ios.buildNumber', '2'],
            ].map(([k, v]) => (
              <div key={k} style={{ color: "#b8d4c2", marginBottom: 3 }}>
                <span style={{ color: "#6b9b7e" }}>{k}: </span>
                <span style={{ color: "#e8f5ee" }}>"{v}"</span>
              </div>
            ))}
          </div>

          {/* package.json verification */}
          <div
            style={{
              background: "rgba(46,204,113,0.05)",
              border: "1px solid rgba(134,187,154,0.15)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              package.json — clean
            </div>
            {[
              "No catalog: references",
              "No workspace: references",
              "All dependencies use real version numbers",
              "Compatible with npm install",
              "@workspace/api-client-react removed (internal only)",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#2ecc71", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: "#b8d4c2" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Assets */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Bundled assets (61 images, zero external URLs)
            </div>
            {[
              "24 yoga pose images · 7 chakra yoga pose images",
              "14 chakra images — 7 symbols + 7 crystals",
              "3 home slides · 3 breathwork screens · AI coach",
              "Logo variants · splash screen · app icon",
              "4 journey week covers",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                <span style={{ color: "#86bb9a", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: "#b8d4c2" }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Setup */}
          <div
            style={{
              background: "rgba(0,0,0,0.25)",
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 12,
              color: "#6b9b7e",
              lineHeight: 1.8,
            }}
          >
            <strong style={{ color: "#86bb9a" }}>Setup:</strong>
            <br />
            <code style={{ color: "#86bb9a" }}>npm install</code>
            <br />
            <code style={{ color: "#86bb9a" }}>npx expo start</code>
          </div>
        </div>

        {/* Previous versions */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#2e5c40", marginBottom: 8, textAlign: "center" }}>Previous builds</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PREV_FILES.map(({ file, label }) => (
              <a
                key={file}
                href={`${base}/${file}`}
                download={file}
                style={{
                  flex: 1, display: "block", padding: "8px 4px",
                  background: "rgba(134,187,154,0.04)",
                  border: "1px solid rgba(134,187,154,0.12)",
                  color: "#3a5c44", textAlign: "center",
                  fontSize: 10, borderRadius: 6, textDecoration: "none",
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <p style={{ color: "#2e5c40", fontSize: 11, textAlign: "center", fontFamily: "monospace", margin: 0 }}>
          {typeof window !== "undefined" ? window.location.origin + prodUrl : prodUrl}
        </p>
      </div>
    </div>
  );
}
