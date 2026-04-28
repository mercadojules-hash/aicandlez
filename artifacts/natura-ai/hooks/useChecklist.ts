import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CHECKLIST_KEY = "@natura_yoga_checklist";
const CHECKLIST_DATE_KEY = "@natura_yoga_checklist_date";

export interface ChecklistState {
  yoga: boolean;
  breathwork: boolean;
  chakra: boolean;
}

const defaultState: ChecklistState = {
  yoga: false,
  breathwork: false,
  chakra: false,
};

export function useChecklist() {
  const [checklist, setChecklist] = useState<ChecklistState>(defaultState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [storedChecklist, storedDate] = await Promise.all([
        AsyncStorage.getItem(CHECKLIST_KEY),
        AsyncStorage.getItem(CHECKLIST_DATE_KEY),
      ]);

      if (storedDate === today && storedChecklist) {
        setChecklist(JSON.parse(storedChecklist));
      } else {
        await AsyncStorage.setItem(CHECKLIST_DATE_KEY, today);
        await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(defaultState));
        setChecklist(defaultState);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }

  const markComplete = useCallback(
    async (key: keyof ChecklistState) => {
      const updated = { ...checklist, [key]: true };
      setChecklist(updated);
      await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(updated));
    },
    [checklist]
  );

  const getProgress = useCallback(() => {
    const total = Object.keys(checklist).length;
    const done = Object.values(checklist).filter(Boolean).length;
    return total > 0 ? done / total : 0;
  }, [checklist]);

  return { checklist, loading, markComplete, getProgress };
}
