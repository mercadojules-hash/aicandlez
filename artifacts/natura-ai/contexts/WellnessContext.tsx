import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface SavedItem {
  id: string;
  type: "remedy" | "plan" | "recipe";
  title: string;
  savedAt: string;
}

export interface RoutineTask {
  id: string;
  label: string;
  time?: string;
  category: "morning" | "afternoon" | "evening";
}

export interface DailyCheckIn {
  date: string;
  energy: number;
  stress: number;
  sleep: number;
}

export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  category?: string;
}

interface WellnessContextValue {
  savedItems: SavedItem[];
  completedTasks: string[];
  streak: number;
  lastCheckIn: DailyCheckIn | null;
  groceryList: GroceryItem[];
  checkIns: DailyCheckIn[];

  saveItem: (item: SavedItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  isSaved: (id: string) => boolean;
  toggleTask: (taskId: string) => Promise<void>;
  isTaskDone: (taskId: string) => boolean;
  submitCheckIn: (checkIn: Omit<DailyCheckIn, "date">) => Promise<void>;
  addToGrocery: (items: string[]) => Promise<void>;
  toggleGroceryItem: (id: string) => Promise<void>;
  clearGroceryChecked: () => Promise<void>;
}

const WellnessContext = createContext<WellnessContextValue>({
  savedItems: [],
  completedTasks: [],
  streak: 0,
  lastCheckIn: null,
  groceryList: [],
  checkIns: [],
  saveItem: async () => {},
  removeItem: async () => {},
  isSaved: () => false,
  toggleTask: async () => {},
  isTaskDone: () => false,
  submitCheckIn: async () => {},
  addToGrocery: async () => {},
  toggleGroceryItem: async () => {},
  clearGroceryChecked: async () => {},
});

const SAVED_KEY = "natura_saved";
const TASKS_KEY = "natura_tasks";
const STREAK_KEY = "natura_streak";
const CHECKINS_KEY = "natura_checkins";
const GROCERY_KEY = "natura_grocery";
const TODAY_KEY = "natura_today_date";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function WellnessProvider({ children }: { children: React.ReactNode }) {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState<DailyCheckIn | null>(null);
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [savedJson, tasksJson, streakStr, checkInsJson, groceryJson, lastDateStr] =
          await Promise.all([
            AsyncStorage.getItem(SAVED_KEY),
            AsyncStorage.getItem(TASKS_KEY),
            AsyncStorage.getItem(STREAK_KEY),
            AsyncStorage.getItem(CHECKINS_KEY),
            AsyncStorage.getItem(GROCERY_KEY),
            AsyncStorage.getItem(TODAY_KEY),
          ]);

        if (savedJson) setSavedItems(JSON.parse(savedJson));
        if (streakStr) setStreak(Number(streakStr));
        if (checkInsJson) {
          const all: DailyCheckIn[] = JSON.parse(checkInsJson);
          setCheckIns(all);
          const todayCheckIn = all.find((c) => c.date === todayStr());
          if (todayCheckIn) setLastCheckIn(todayCheckIn);
        }
        if (groceryJson) setGroceryList(JSON.parse(groceryJson));

        const today = todayStr();
        if (tasksJson && lastDateStr === today) {
          setCompletedTasks(JSON.parse(tasksJson));
        } else if (lastDateStr !== today) {
          await AsyncStorage.setItem(TODAY_KEY, today);
          await AsyncStorage.setItem(TASKS_KEY, JSON.stringify([]));
        }
      } catch {}
    };
    load();
  }, []);

  const saveItem = useCallback(async (item: SavedItem) => {
    setSavedItems((prev) => {
      const exists = prev.find((s) => s.id === item.id);
      if (exists) return prev;
      const updated = [item, ...prev];
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeItem = useCallback(async (id: string) => {
    setSavedItems((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isSaved = useCallback(
    (id: string) => savedItems.some((s) => s.id === id),
    [savedItems]
  );

  const toggleTask = useCallback(async (taskId: string) => {
    setCompletedTasks((prev) => {
      const updated = prev.includes(taskId)
        ? prev.filter((t) => t !== taskId)
        : [...prev, taskId];
      AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isTaskDone = useCallback(
    (taskId: string) => completedTasks.includes(taskId),
    [completedTasks]
  );

  const submitCheckIn = useCallback(
    async (data: Omit<DailyCheckIn, "date">) => {
      const checkIn: DailyCheckIn = { ...data, date: todayStr() };
      setLastCheckIn(checkIn);
      setCheckIns((prev) => {
        const filtered = prev.filter((c) => c.date !== todayStr());
        const updated = [checkIn, ...filtered];
        AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(updated));
        return updated;
      });

      const newStreak = streak + 1;
      setStreak(newStreak);
      await AsyncStorage.setItem(STREAK_KEY, String(newStreak));
    },
    [streak]
  );

  const addToGrocery = useCallback(async (items: string[]) => {
    setGroceryList((prev) => {
      const existing = new Set(prev.map((g) => g.name.toLowerCase()));
      const newItems: GroceryItem[] = items
        .filter((i) => !existing.has(i.toLowerCase()))
        .map((name) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          name,
          checked: false,
        }));
      const updated = [...prev, ...newItems];
      AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleGroceryItem = useCallback(async (id: string) => {
    setGroceryList((prev) => {
      const updated = prev.map((g) =>
        g.id === id ? { ...g, checked: !g.checked } : g
      );
      AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearGroceryChecked = useCallback(async () => {
    setGroceryList((prev) => {
      const updated = prev.filter((g) => !g.checked);
      AsyncStorage.setItem(GROCERY_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <WellnessContext.Provider
      value={{
        savedItems,
        completedTasks,
        streak,
        lastCheckIn,
        groceryList,
        checkIns,
        saveItem,
        removeItem,
        isSaved,
        toggleTask,
        isTaskDone,
        submitCheckIn,
        addToGrocery,
        toggleGroceryItem,
        clearGroceryChecked,
      }}
    >
      {children}
    </WellnessContext.Provider>
  );
}

export function useWellness() {
  return useContext(WellnessContext);
}
