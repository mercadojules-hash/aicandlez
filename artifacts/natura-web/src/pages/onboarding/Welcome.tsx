import { useNavigate } from "react-router-dom";
import { ArrowRight, Leaf, Droplets, Brain, ShoppingBasket } from "lucide-react";

function NaturaLogo() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="48" fill="#EBF5EC" />
      <circle cx="48" cy="48" r="38" fill="#D4EDD6" />
      <path
        d="M48 22C48 22 28 34 28 52C28 63.046 36.954 72 48 72C59.046 72 68 63.046 68 52C68 34 48 22 48 22Z"
        fill="#3D7A45"
        opacity="0.15"
      />
      <path
        d="M48 28C48 28 32 38.5 32 53C32 62.941 39.059 71 48 71C56.941 71 64 62.941 64 53C64 38.5 48 28 48 28Z"
        fill="#3D7A45"
        opacity="0.3"
      />
      <path
        d="M48 72C48 72 38 58 38 46C38 38.268 42.477 31.6 48 28C53.523 31.6 58 38.268 58 46C58 58 48 72 48 72Z"
        fill="#3D7A45"
      />
      <line x1="48" y1="50" x2="48" y2="70" stroke="#EBF5EC" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="62" cy="36" r="5" fill="#6BAA4A" />
      <circle cx="62" cy="36" r="2.5" fill="#fff" />
    </svg>
  );
}

const FEATURES = [
  { icon: Leaf,          label: "Herbal remedies & teas" },
  { icon: Brain,         label: "AI-powered guidance" },
  { icon: Droplets,      label: "Wellness plans & routines" },
  { icon: ShoppingBasket,label: "Healing recipes & grocery lists" },
];

export default function Welcome() {
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="onboarding-screen">
      <div className="onboarding-hero">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <NaturaLogo />
        </div>
        <h1 className="onboarding-title">Natura AI</h1>
        <p className="onboarding-subtitle">
          Your personal natural wellness companion, powered by traditional plant wisdom.
        </p>
      </div>

      <div className="onboarding-features">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div key={label} className="feature-row">
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: "var(--secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={20} color="#3D7A45" strokeWidth={1.8} />
            </div>
            <span className="feature-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="onboarding-disclaimer-box">
        Educational wellness information only — not medical advice. Always consult a healthcare provider for health concerns.
      </div>

      <div className="onboarding-actions">
        <button
          className="btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}
          onClick={() => navigate(`${base}/onboarding/goals`)}
        >
          <span style={{ flex: 1, textAlign: "center" }}>Begin Your Journey</span>
          <ArrowRight size={18} color="#fff" style={{ flexShrink: 0 }} />
        </button>
        <button className="btn-ghost" onClick={() => navigate(`${base}/onboarding/goals`)}>
          Start Guide
        </button>
      </div>
    </div>
  );
}
