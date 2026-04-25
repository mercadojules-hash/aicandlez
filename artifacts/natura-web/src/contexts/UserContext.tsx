import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getItem, setItem, removeItem } from "@/lib/storage";

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
  updateProfile: (updates: Partial<UserProfile>) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

const defaultProfile: UserProfile = { name: "", goals: [], dietaryPreferences: [], allergies: [], disclaimerAccepted: false };

const UserContext = createContext<UserContextValue>({
  profile: defaultProfile, isOnboarded: false, loading: true,
  updateProfile: () => {}, completeOnboarding: () => {}, resetOnboarding: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfile(getItem("natura_profile", defaultProfile));
    setIsOnboarded(getItem("natura_onboarded", false));
    setLoading(false);
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...updates };
      setItem("natura_profile", updated);
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setItem("natura_onboarded", true);
    setIsOnboarded(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    removeItem("natura_onboarded");
    removeItem("natura_profile");
    removeItem("natura_saved");
    removeItem("natura_tasks");
    removeItem("natura_streak");
    removeItem("natura_checkins");
    removeItem("natura_grocery");
    setProfile(defaultProfile);
    setIsOnboarded(false);
  }, []);

  return (
    <UserContext.Provider value={{ profile, isOnboarded, loading, updateProfile, completeOnboarding, resetOnboarding }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() { return useContext(UserContext); }
