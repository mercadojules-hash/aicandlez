const V2_FILE = "natura-yoga-ai-v1.0.0-v2.zip";
const V1_FILE = "natura-yoga-ai-v1.0.0.zip";

export default function Download() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const v2Url = `${base}/${V2_FILE}`;
  const v1Url = `${base}/${V1_FILE}`;

  console.log("Download URL (v2):", window.location.origin + v2Url);

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

        {/* ── PRIMARY DOWNLOAD BUTTON — v2, top of page ── */}
        <a
          href={v2Url}
          download={V2_FILE}
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
          ⬇ Download Natura Yoga AI (v1.0.0 v2)
        </a>

        {/* File size badge */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span style={{ color: "#4a7a5a", fontSize: 12, fontFamily: "monospace" }}>
            {V2_FILE} · 31 MB · 61 images · 131 files · integrity verified
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
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3d9e6a, #86bb9a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                flexShrink: 0,
              }}
            >
              🌿
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>Natura Yoga AI</div>
              <div style={{ fontSize: 12, color: "#86bb9a", letterSpacing: 1, textTransform: "uppercase" }}>
                Expo React Native · v1.0.0 v2 · Complete Package
              </div>
            </div>
          </div>

          {/* Includes */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#86bb9a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              What's included
            </div>
            {[
              "61 locally bundled images — fully offline-ready",
              "14 chakra symbols & crystal images (7 chakras × 2)",
              "24 yoga pose images",
              "7 chakra yoga pose images",
              "Home slides, breathwork, AI coach, logo, splash",
              "4 journey week cover images",
              "All screens, components, data files & source code",
              "app.json · package.json · tsconfig.json",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "#2ecc71", fontSize: 13, marginTop: 1, flexShrink: 0 }}>✓</span>
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
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#86bb9a" }}>To run after unzipping:</strong>
            <br />
            <code style={{ color: "#86bb9a" }}>pnpm install</code> then{" "}
            <code style={{ color: "#86bb9a" }}>npx expo start</code>
          </div>
        </div>

        {/* Also available: v1 */}
        <a
          href={v1Url}
          download={V1_FILE}
          style={{
            display: "block",
            padding: "12px 16px",
            background: "rgba(134,187,154,0.08)",
            border: "1px solid rgba(134,187,154,0.2)",
            color: "#86bb9a",
            textAlign: "center",
            fontSize: 13,
            borderRadius: 10,
            textDecoration: "none",
            marginBottom: 16,
          }}
        >
          Also available: {V1_FILE} (original)
        </a>

        {/* URL */}
        <p style={{ color: "#2e5c40", fontSize: 11, textAlign: "center", fontFamily: "monospace", margin: 0 }}>
          {typeof window !== "undefined" ? window.location.origin + v2Url : v2Url}
        </p>
      </div>
    </div>
  );
}
