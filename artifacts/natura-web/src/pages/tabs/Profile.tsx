import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Zap, Bookmark, CheckCircle, RefreshCw, Moon, Sun, Smartphone,
  Bell, Lock, LogOut, ChevronRight, Sparkles, Target,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { useUser } from "@/contexts/UserContext";
import { useWellness } from "@/contexts/WellnessContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { getBackgroundStyle, BG } from "@/lib/background";

const SCALE_LABELS = ["Very low", "Low", "Moderate", "Good", "Excellent"];

function ScaleSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p className="scale-label">
        {label}: <span style={{ color: "#7CFFB2" }}>{SCALE_LABELS[value - 1]}</span>
      </p>
      <div className="scale-row">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} className={`scale-dot ${value >= v ? "filled" : ""}`} onClick={() => onChange(v)} />
        ))}
      </div>
    </div>
  );
}

const THEME_OPTIONS = [
  { mode: "dark"  as ThemeMode, label: "Dark",  Icon: Moon },
  { mode: "light" as ThemeMode, label: "Light", Icon: Sun },
  { mode: "auto"  as ThemeMode, label: "Auto",  Icon: Smartphone },
];

export default function Profile() {
  const { profile, resetOnboarding } = useUser();
  const { streak, savedItems, completedTasks, submitCheckIn, lastCheckIn } = useWellness();
  const { isPremium } = usePremium();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
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

  const savedPlans    = savedItems.filter((s) => s.type === "plan");
  const savedRemedies = savedItems.filter((s) => s.type === "remedy" || s.type === "recipe");
  const focusArea     = profile.goals[0] ?? "General Wellness";
  const initial       = (profile.name.charAt(0) || "N").toUpperCase();

  return (
    <Layout bgStyle={getBackgroundStyle(BG.calm)}>
      <div className="profile-screen">

        {/* ── Hero ── */}
        <div className="profile-hero">
          <span className="profile-hero-glow" />
          <div className="profile-avatar-wrap">
            <div className="profile-avatar-ring" />
            <div className="profile-avatar">{initial}</div>
          </div>
          <p className="profile-hero-name">{profile.name || "Wellness Seeker"}</p>
          <p className="profile-hero-sub">Your wellness journey</p>
          {profile.goals.length > 0 && (
            <div className="profile-goals-row">
              {profile.goals.slice(0, 3).map((g) => (
                <span key={g} className="profile-goal-pill">{g}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Progress cards ── */}
        <div className="profile-stats-row">
          <div className="profile-stat-card">
            <span className="profile-stat-icon"><Zap size={16} color="#F5C842" /></span>
            <p className="profile-stat-value">{streak}</p>
            <p className="profile-stat-label">Day Streak</p>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-icon"><CheckCircle size={16} color="#7CFFB2" /></span>
            <p className="profile-stat-value">{completedTasks.length}</p>
            <p className="profile-stat-label">Sessions</p>
          </div>
          <div className="profile-stat-card">
            <span className="profile-stat-icon"><Target size={16} color="#A78BFA" /></span>
            <p className="profile-stat-value profile-stat-value--sm">{focusArea.split(" ")[0]}</p>
            <p className="profile-stat-label">Focus</p>
          </div>
        </div>

        {/* ── Daily Check-In ── */}
        <div className="profile-section">
          <p className="profile-section-title">Daily Check-In</p>
          {checkInDone ? (
            <div className="checkin-done">
              <CheckCircle size={22} color="#7CFFB2" />
              <span>Check-in complete for today!</span>
            </div>
          ) : (
            <>
              <p className="checkin-sub">How are you feeling today?</p>
              <ScaleSelector label="Energy"        value={energy} onChange={setEnergy} />
              <ScaleSelector label="Stress"        value={stress} onChange={setStress} />
              <ScaleSelector label="Sleep quality" value={sleep}  onChange={setSleep} />
              <button className="profile-cta-btn profile-cta-btn--secondary" onClick={handleCheckIn}>
                Submit Check-In
              </button>
            </>
          )}
        </div>

        {/* ── Membership ── */}
        <div className="membership-card">
          <span className="membership-badge">{isPremium ? "PREMIUM" : "FREE"}</span>
          <p className="membership-title">{isPremium ? "Natura Premium" : "Unlock Premium"}</p>
          <p className="membership-sub">
            {isPremium
              ? "You have access to all features and guided programs."
              : "Get unlimited AI guidance, all plans, and offline access."}
          </p>
          {!isPremium && (
            <button className="membership-upgrade-btn" onClick={() => navigate(`${base}/upgrade`)}>
              <Sparkles size={16} style={{ display: "inline", marginRight: 6 }} />
              Upgrade to Premium
            </button>
          )}
        </div>

        {/* ── Saved content ── */}
        {(savedPlans.length > 0 || savedRemedies.length > 0) && (
          <div className="profile-section">
            <p className="profile-section-title">
              <Bookmark size={15} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              Saved
            </p>
            {savedPlans.length > 0 && (
              <div style={{ marginBottom: savedRemedies.length ? 14 : 0 }}>
                <p className="profile-sub-label">Plans</p>
                {savedPlans.map((item) => (
                  <button
                    key={item.id}
                    className="saved-mini-card"
                    onClick={() => navigate(`/plan/${item.id}`)}
                  >
                    <span className="saved-mini-dot" />
                    <span className="saved-mini-title">{item.title}</span>
                    <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
                  </button>
                ))}
              </div>
            )}
            {savedRemedies.length > 0 && (
              <div>
                <p className="profile-sub-label">Remedies</p>
                {savedRemedies.map((item) => (
                  <button
                    key={item.id}
                    className="saved-mini-card"
                    onClick={() => navigate(`/remedy/${item.id}`)}
                  >
                    <span className="saved-mini-dot" />
                    <span className="saved-mini-title">{item.title}</span>
                    <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Appearance ── */}
        <div className="profile-section">
          <p className="profile-section-title">Appearance</p>
          <div className="theme-toggle-row">
            {THEME_OPTIONS.map(({ mode: m, label, Icon }) => (
              <button key={m} className={`theme-btn ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Settings ── */}
        <div className="profile-section">
          <p className="profile-section-title">Settings</p>
          {[
            { Icon: Bell,  label: "Notifications", sub: "Daily reminders & tips" },
            { Icon: Lock,  label: "Privacy",        sub: "Data & permissions" },
          ].map(({ Icon, label, sub }) => (
            <button key={label} className="settings-row">
              <span className="settings-icon"><Icon size={16} color="rgba(255,255,255,0.6)" /></span>
              <span className="settings-body">
                <span className="settings-label">{label}</span>
                <span className="settings-sub">{sub}</span>
              </span>
              <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
            </button>
          ))}
          <button className="settings-row settings-row--danger" onClick={handleReset}>
            <span className="settings-icon"><LogOut size={16} color="rgba(229,62,62,0.8)" /></span>
            <span className="settings-body">
              <span className="settings-label settings-label--danger">Reset & Sign Out</span>
              <span className="settings-sub">Clear all data and restart</span>
            </span>
            <ChevronRight size={16} color="rgba(229,62,62,0.3)" />
          </button>
        </div>

        {/* ── Disclaimer ── */}
        <div className="profile-disclaimer">
          <p className="disclaimer-text">
            Natura AI provides educational wellness information only. Nothing in this app constitutes medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider.
          </p>
        </div>

        <div style={{ height: 32 }} />
      </div>
    </Layout>
  );
}
