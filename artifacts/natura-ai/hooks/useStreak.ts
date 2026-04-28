import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STREAK_KEY = "@natura_yoga_streak";
const LAST_ACTIVE_KEY = "@natura_yoga_last_active";

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export function useStreak() {
  const [streak, setStreak] = useState(0);
  const [lastActive, setLastActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [storedStreak, storedLastActive] = await Promise.all([
        AsyncStorage.getItem(STREAK_KEY),
        AsyncStorage.getItem(LAST_ACTIVE_KEY),
      ]);
      const today = getTodayString();
      const yesterday = getYesterdayString();
      let currentStreak = storedStreak ? parseInt(storedStreak, 10) : 0;

      if (storedLastActive && storedLastActive !== today && storedLastActive !== yesterday) {
        currentStreak = 0;
        await AsyncStorage.setItem(STREAK_KEY, "0");
      }

      setStreak(currentStreak);
      setLastActive(storedLastActive);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }

  const recordActivity = useCallback(async () => {
    const today = getTodayString();
    if (lastActive === today) return;

    const yesterday = getYesterdayString();
    let newStreak = streak;

    if (lastActive === yesterday) {
      newStreak = streak + 1;
    } else if (lastActive === null || lastActive < yesterday) {
      newStreak = 1;
    }

    await Promise.all([
      AsyncStorage.setItem(STREAK_KEY, String(newStreak)),
      AsyncStorage.setItem(LAST_ACTIVE_KEY, today),
    ]);
    setStreak(newStreak);
    setLastActive(today);
  }, [streak, lastActive]);

  return { streak, loading, recordActivity };
}
