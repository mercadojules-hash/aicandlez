import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export default function Disclaimer() {
  const { profile, updateProfile, completeOnboarding } = useUser();
  const [accepted, setAccepted] = useState(profile.disclaimerAccepted);
  const [name, setName] = useState(profile.name);
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleFinish = () => {
    updateProfile({ disclaimerAccepted: true, name });
    completeOnboarding();
    navigate(`${base}/home`);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-nav">
        <button className="back-btn" onClick={() => navigate(`${base}/onboarding/preferences`)}>
          <ChevronLeft size={24} />
        </button>
        <div className="progress-dots">
          <div className="dot done" /><div className="dot done" /><div className="dot active" />
        </div>
      </div>

      <div className="disclaimer-icon">
        <ShieldCheck size={40} color="#3D7A45" />
      </div>

      <h2 className="onboarding-step-title">A note before we begin</h2>

      <div className="disclaimer-card">
        <p>Natura AI provides <strong>educational wellness information only</strong>. Nothing in this app constitutes medical advice, diagnosis, or treatment.</p>
        <p style={{ marginTop: 12 }}>Always consult a qualified healthcare provider before starting any new supplement, herb, or wellness regimen — especially if you are pregnant, nursing, or taking medications.</p>
        <p style={{ marginTop: 12 }}>Our suggestions are rooted in traditional plant wisdom and may not be supported by clinical evidence. Individual results vary.</p>
      </div>

      <div className="name-input-wrap">
        <label className="name-label">What should we call you?</label>
        <input
          type="text"
          placeholder="Your first name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="name-input"
        />
      </div>

      <div className="accept-row">
        <button
          className={`checkbox ${accepted ? "checked" : ""}`}
          onClick={() => setAccepted((v) => !v)}
          aria-label="Accept disclaimer"
        >
          {accepted && <span>✓</span>}
        </button>
        <span className="accept-label">I understand and accept this disclaimer</span>
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleFinish} disabled={!accepted}>
          Start My Wellness Journey
        </button>
      </div>
    </div>
  );
}
