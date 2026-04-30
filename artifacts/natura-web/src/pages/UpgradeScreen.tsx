import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Sparkles } from "lucide-react";
import { usePremium } from "@/contexts/PremiumContext";

const FEATURES = [
  "Full recipe library (50+ recipes)",
  "Guided wellness plans",
  "Stress, sleep & energy programs",
  "Daily routines & habit tracking",
  "New content added weekly",
];

type Plan = "monthly" | "yearly";

export default function UpgradeScreen() {
  const navigate = useNavigate();
  const { upgrade } = usePremium();
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly");

  const handleUpgrade = () => {
    upgrade();
    navigate(-1);
  };

  return (
    <div className="upgrade-screen">
      <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
        <X size={18} color="rgba(255,255,255,0.7)" />
      </button>

      {/* ── Hero ── */}
      <div className="upgrade-hero">
        <div className="upgrade-hero-glow" />
        <span className="upgrade-leaf">🌿</span>
        <h1 className="upgrade-title">Natura Premium</h1>
        <p className="upgrade-subtitle">Unlock your full wellness potential</p>
      </div>

      {/* ── Feature list ── */}
      <div className="upgrade-features">
        {FEATURES.map((text, i) => (
          <div key={i} className="upgrade-feature-item">
            <div className="upgrade-feature-check">
              <Check size={11} />
            </div>
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* ── Plan selection ── */}
      <div className="upgrade-plans">
        <button
          className={`upgrade-plan-card ${selectedPlan === "monthly" ? "selected" : ""}`}
          onClick={() => setSelectedPlan("monthly")}
        >
          <div>
            <div className="upgrade-plan-name">Monthly</div>
            <div className="upgrade-plan-price">$9.99<span> / month</span></div>
          </div>
          <div className={`upgrade-plan-selector ${selectedPlan === "monthly" ? "selected" : ""}`}>
            {selectedPlan === "monthly" && <Check size={11} color="#071a0c" />}
          </div>
        </button>

        <button
          className={`upgrade-plan-card featured ${selectedPlan === "yearly" ? "selected" : ""}`}
          onClick={() => setSelectedPlan("yearly")}
        >
          <div className="upgrade-plan-badge">Best Value — Save 50%</div>
          <div>
            <div className="upgrade-plan-name">Yearly</div>
            <div className="upgrade-plan-price">$59.99<span> / year</span></div>
            <div className="upgrade-plan-saving">Only $5.00 / month</div>
          </div>
          <div className={`upgrade-plan-selector ${selectedPlan === "yearly" ? "selected" : ""}`}>
            {selectedPlan === "yearly" && <Check size={11} color="#071a0c" />}
          </div>
        </button>
      </div>

      {/* ── CTA ── */}
      <div className="upgrade-cta-section">
        <button className="upgrade-cta-btn" onClick={handleUpgrade}>
          <Sparkles size={17} style={{ display: "inline", marginRight: 8, verticalAlign: "middle" }} />
          Start Free Trial
        </button>
        <p className="upgrade-cta-sub">Cancel anytime · No commitment</p>
      </div>

      {/* ── Footer ── */}
      <div className="upgrade-footer">
        <button className="upgrade-footer-link">Restore Purchase</button>
        <button className="upgrade-footer-link">Terms of Service</button>
        <button className="upgrade-footer-link">Privacy Policy</button>
      </div>
    </div>
  );
}
