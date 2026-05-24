import { useState, useEffect } from "react";
import { TRADE_PORTAL_URL } from "../../lib/appUrls";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Security", href: "#trust" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: "all 0.3s ease",
        background: scrolled
          ? "rgba(0,0,0,0.9)"
          : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid transparent",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="AICandlez — back to top"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #00e5ff, #9b5cf5)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 900,
              color: "#000",
            }}
          >
            AI
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#fff",
            }}
          >
            AICandlez
          </span>
        </a>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
          className="hidden-mobile"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                color: "#8892a4",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.01em",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = "#8892a4";
              }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href={TRADE_PORTAL_URL}
            className="hidden-mobile"
            style={{
              color: "#8892a4",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.02em",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#fff";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#8892a4";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
            }}
            title="Operator / Admin Dashboard"
          >
            Operator Console
          </a>
          <a
            href={TRADE_PORTAL_URL}
            className="btn-ghost"
            style={{ padding: "10px 20px", fontSize: 14 }}
          >
            Sign In
          </a>
          <a
            href={TRADE_PORTAL_URL}
            className="btn-primary"
            style={{ padding: "10px 20px", fontSize: 14 }}
          >
            Launch App →
          </a>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              color: "#fff",
              display: "none",
            }}
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {menuOpen ? (
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          style={{
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(20px)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "16px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                color: "#8892a4",
                textDecoration: "none",
                fontSize: 16,
                fontWeight: 500,
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {link.label}
            </a>
          ))}
          {/* Sign In + Launch App CTAs — without these the mobile menu was
              a dead end (CTA buttons in the desktop strip are hidden on
              narrow viewports). Pricing/sign-in/sign-up etc. resolve via
              cross-app links to app.aicandlez.com (Clerk hosts the auth UI). */}
          <a
            href={TRADE_PORTAL_URL}
            onClick={() => setMenuOpen(false)}
            style={{
              color: "#8892a4",
              textDecoration: "none",
              fontSize: 16,
              fontWeight: 600,
              padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            Sign In
          </a>
          <a
            href={TRADE_PORTAL_URL}
            onClick={() => setMenuOpen(false)}
            className="btn-primary"
            style={{
              padding: "12px 16px",
              fontSize: 15,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            Launch App →
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
