import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// ── Shape ────────────────────────────────────────────────────────────────────────
export interface UserProfile {
  name:         string;
  username:     string;
  email:        string;
  avatarUrl:    string | null;   // base64 data-URL or null → show initials
  riskLevel:    "low" | "balanced" | "aggressive";
  maxTrades:    number;
  stopLoss:     boolean;
  notifications: boolean;
  autoReinvest: boolean;
  paperMode:    boolean;
}

const STORAGE_KEY = "ac_user_profile";

const DEFAULTS: UserProfile = {
  name:          "Alex Morgan",
  username:      "alexmorgan",
  email:         "user@aicandlez.com",
  avatarUrl:     null,
  riskLevel:     "balanced",
  maxTrades:     3,
  stopLoss:      true,
  notifications: true,
  autoReinvest:  false,
  paperMode:     true,
};

function load(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return DEFAULTS; }
}

function save(p: UserProfile) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
  catch {}
}

// ── Context ──────────────────────────────────────────────────────────────────────
interface Ctx {
  profile:       UserProfile;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

const UserProfileContext = createContext<Ctx>({
  profile:       DEFAULTS,
  updateProfile: () => {},
});

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(load);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return (
    <UserProfileContext.Provider value={{ profile, updateProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export const useUserProfile = () => useContext(UserProfileContext);
