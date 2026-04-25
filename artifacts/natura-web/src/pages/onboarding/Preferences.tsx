import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { ChevronLeft } from "lucide-react";

const DIETARY = ["Vegan", "Vegetarian", "Gluten-free", "Dairy-free", "Nut-free", "Keto", "Paleo", "No restrictions"];
const ALLERGIES_LIST = ["Pollen", "Ragweed", "Tree nuts", "Shellfish", "Soy", "Latex", "None"];

export default function Preferences() {
  const { profile, updateProfile } = useUser();
  const [dietary, setDietary] = useState<string[]>(profile.dietaryPreferences);
  const [allergies, setAllergies] = useState<string[]>(profile.allergies);
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const toggleDietary = (d: string) => setDietary((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  const toggleAllergy = (a: string) => setAllergies((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);

  const handleNext = () => {
    updateProfile({ dietaryPreferences: dietary, allergies });
    navigate(`${base}/onboarding/disclaimer`);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-nav">
        <button className="back-btn" onClick={() => navigate(`${base}/onboarding/goals`)}>
          <ChevronLeft size={24} />
        </button>
        <div className="progress-dots">
          <div className="dot done" /><div className="dot active" /><div className="dot" />
        </div>
      </div>

      <h2 className="onboarding-step-title">Your dietary preferences</h2>
      <p className="onboarding-step-sub">We'll tailor suggestions to match your lifestyle.</p>

      <div className="pref-section">
        <h3 className="pref-label">Diet & lifestyle</h3>
        <div className="chip-wrap">
          {DIETARY.map((d) => (
            <button key={d} className={`chip ${dietary.includes(d) ? "selected" : ""}`} onClick={() => toggleDietary(d)}>{d}</button>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <h3 className="pref-label">Allergies & sensitivities</h3>
        <div className="chip-wrap">
          {ALLERGIES_LIST.map((a) => (
            <button key={a} className={`chip ${allergies.includes(a) ? "selected" : ""}`} onClick={() => toggleAllergy(a)}>{a}</button>
          ))}
        </div>
      </div>

      <div className="onboarding-actions">
        <button className="btn-primary" onClick={handleNext}>Continue</button>
        <button className="btn-ghost" onClick={() => navigate(`${base}/onboarding/disclaimer`)}>Skip for now</button>
      </div>
    </div>
  );
}
