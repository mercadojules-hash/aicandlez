import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface UserProfile {
  name: string;
  goals: string[];
  dietaryPreferences: string[];
  allergies: string[];
  disclaimerAccepted: boolean;
}

interface UserContextValue {
  profile: UserProfile;
  isOnboarded: boolean;
  loading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

const defaultProfile: UserProfile = {
  name: "",
  goals: [],
  dietaryPreferences: [],
  allergies: [],
  disclaimerAccepted: false,
};

const UserContext = createContext<UserContextValue>({
  profile: defaultProfile,
  isOnboarded: false,
  loading: true,
  updateProfile: async () => {},
  completeOnboarding: async () => {},
  resetOnboarding: async () => {},
});

const PROFILE_KEY = "natura_profile";
const ONBOARDED_KEY = "natura_onboarded";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [profileJson, onboardedStr] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(ONBOARDED_KEY),
        ]);
        if (profileJson) setProfile(JSON.parse(profileJson));
        if (onboardedStr === "true") setIsOnboarded(true);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, "true");
    setIsOnboarded(true);
  }, []);

  const resetOnboarding = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(ONBOARDED_KEY),
      AsyncStorage.removeItem(PROFILE_KEY),
    ]);
    setProfile(defaultProfile);
    setIsOnboarded(false);
  }, []);

  return (
    <UserContext.Provider
      value={{
        profile,
        isOnboarded,
        loading,
        updateProfile,
        completeOnboarding,
        resetOnboarding,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
