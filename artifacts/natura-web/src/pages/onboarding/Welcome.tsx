import { useNavigate } from "react-router-dom";
import { Leaf } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="onboarding-screen">
      <div className="onboarding-hero">
        <div className="onboarding-icon-wrap">
          <Leaf size={48} color="#3D7A45" strokeWidth={1.5} />
        </div>
        <h1 className="onboarding-title">Natura AI</h1>
        <p className="onboarding-subtitle">Your personal natural wellness companion, powered by traditional plant wisdom.</p>
      </div>

      <div className="onboarding-features">
        {[
          { emoji: "🌿", label: "Herbal remedies & teas" },
          { emoji: "🧘", label: "Wellness plans & routines" },
          { emoji: "🍽️", label: "Healing recipes" },
          { emoji: "💬", label: "AI-powered guidance" },
        ].map(({ emoji, label }) => (
          <div key={label} className="feature-row">
            <span className="feature-emoji">{emoji}</span>
            <span className="feature-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="onboarding-disclaimer-box">
        <p>Educational wellness information only — not medical advice. Always consult a healthcare provider for health concerns.</p>
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={() => navigate(`${base}/onboarding/goals`)}>
          Get Started
        </button>
        <button className="btn-ghost" onClick={() => navigate(`${base}/onboarding/goals`)}>
          I already have an account
        </button>
      </div>
    </div>
  );
}
