import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { ChevronLeft } from "lucide-react";

const GOALS = [
  { id: "stress", emoji: "🧘", label: "Reduce stress & anxiety" },
  { id: "sleep", emoji: "😴", label: "Improve sleep quality" },
  { id: "energy", emoji: "⚡", label: "Boost energy naturally" },
  { id: "immunity", emoji: "🛡️", label: "Support immune health" },
  { id: "digestion", emoji: "🌿", label: "Better digestion" },
  { id: "focus", emoji: "🎯", label: "Sharpen mental focus" },
  { id: "weight", emoji: "⚖️", label: "Healthy weight support" },
  { id: "mood", emoji: "☀️", label: "Elevate mood & energy" },
];

export default function Goals() {
  const { profile, updateProfile } = useUser();
  const [selected, setSelected] = useState<string[]>(profile.goals);
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const toggle = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  const handleNext = () => {
    updateProfile({ goals: selected });
    navigate(`${base}/onboarding/preferences`);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-nav">
        <button className="back-btn" onClick={() => navigate(`${base}/onboarding`)}>
          <ChevronLeft size={24} />
        </button>
        <div className="progress-dots">
          <div className="dot active" /><div className="dot" /><div className="dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">What are your wellness goals?</h2>
      <p className="onboarding-step-sub">Select all that apply. We'll personalize your experience.</p>

      <div className="goal-grid">
        {GOALS.map(({ id, emoji, label }) => (
          <button
            key={id}
            className={`goal-chip ${selected.includes(id) ? "selected" : ""}`}
            onClick={() => toggle(id)}
          >
            <span className="goal-emoji">{emoji}</span>
            <span className="goal-label">{label}</span>
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleNext} disabled={selected.length === 0}>
          Continue
        </button>
        <button className="btn-ghost" onClick={() => { updateProfile({ goals: [] }); navigate(`${base}/onboarding/preferences`); }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
