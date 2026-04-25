import { useState } from "react";
import { Zap, Bookmark, CheckCircle, RefreshCw } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";

const SCALE_LABELS = ["Very low", "Low", "Moderate", "Good", "Excellent"];

function ScaleSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="scale-label">{label}: <span style={{ color: "#3D7A45" }}>{SCALE_LABELS[value - 1]}</span></p>
      <div className="scale-row">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} className={`scale-dot ${value >= v ? "filled" : ""}`} onClick={() => onChange(v)} />
        ))}
      </div>
    </div>
  );
}

export default function Profile() {
  const { profile, resetOnboarding } = useUser();
  const { streak, savedItems, completedTasks, submitCheckIn, lastCheckIn } = useWellness();
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(3);
  const [sleep, setSleep] = useState(3);
  const [checkInDone, setCheckInDone] = useState(!!lastCheckIn);

  const handleCheckIn = () => {
    submitCheckIn({ energy, stress, sleep });
    setCheckInDone(true);
  };

  const handleReset = () => {
    if (window.confirm("This will clear all your data and restart the onboarding. Are you sure?")) {
      resetOnboarding();
    }
  };

  return (
    <Layout>
      <div className="scroll-view">
        <h1 className="page-title">Profile</h1>

        <div className="profile-card">
          <div className="profile-avatar">
            <span>{(profile.name.charAt(0) || "N").toUpperCase()}</span>
          </div>
          <div>
            <p className="profile-name">{profile.name || "Wellness Seeker"}</p>
            {profile.goals.length > 0 && (
              <p className="profile-goals">Goals: {profile.goals.slice(0, 3).join(", ")}</p>
            )}
          </div>
        </div>

        <div className="stats-row">
          {[
            { value: streak, label: "Day Streak", Icon: Zap },
            { value: savedItems.length, label: "Saved", Icon: Bookmark },
            { value: completedTasks.length, label: "Today", Icon: CheckCircle },
          ].map(({ value, label, Icon }) => (
            <div key={label} className="stat-box">
              <Icon size={18} color="#3D7A45" />
              <p className="stat-value">{value}</p>
              <p className="stat-label">{label}</p>
            </div>
          ))}
        </div>

        <div className="profile-section">
          <p className="profile-section-title">Daily Check-In</p>
          {checkInDone ? (
            <div className="checkin-done">
              <CheckCircle size={24} color="#3D7A45" />
              <span>Check-in complete for today!</span>
            </div>
          ) : (
            <>
              <p className="checkin-sub">How are you feeling today?</p>
              <ScaleSelector label="Energy" value={energy} onChange={setEnergy} />
              <ScaleSelector label="Stress" value={stress} onChange={setStress} />
              <ScaleSelector label="Sleep quality" value={sleep} onChange={setSleep} />
              <button className="btn-primary" style={{ marginTop: 4 }} onClick={handleCheckIn}>Submit Check-In</button>
            </>
          )}
        </div>

        {profile.dietaryPreferences.length > 0 && (
          <div className="profile-section">
            <p className="profile-section-title">Dietary Preferences</p>
            <div className="tag-row">
              {profile.dietaryPreferences.map((d) => (
                <span key={d} className="tag primary">{d}</span>
              ))}
            </div>
          </div>
        )}

        {profile.allergies.length > 0 && (
          <div className="profile-section">
            <p className="profile-section-title">Allergies & Sensitivities</p>
            <div className="tag-row">
              {profile.allergies.map((a) => (
                <span key={a} className="tag danger">{a}</span>
              ))}
            </div>
          </div>
        )}

        <div className="profile-section muted-section">
          <p className="profile-section-title">Medical Disclaimer</p>
          <p className="disclaimer-text">Natura AI provides educational wellness information only. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider for any health concerns.</p>
        </div>

        <button className="reset-btn" onClick={handleReset}>
          <RefreshCw size={16} color="#6B6B6B" />
          <span>Reset profile & onboarding</span>
        </button>
      </div>
    </Layout>
  );
}
