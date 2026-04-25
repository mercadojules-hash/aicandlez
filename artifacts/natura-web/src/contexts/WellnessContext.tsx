import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getItem, setItem } from "@/lib/storage";

export interface SavedItem { id: string; type: "remedy" | "plan" | "recipe"; title: string; savedAt: string; }
export interface DailyCheckIn { date: string; energy: number; stress: number; sleep: number; }
export interface GroceryItem { id: string; name: string; checked: boolean; }

interface WellnessContextValue {
  savedItems: SavedItem[];
  completedTasks: string[];
  streak: number;
  lastCheckIn: DailyCheckIn | null;
  groceryList: GroceryItem[];
  checkIns: DailyCheckIn[];
  saveItem: (item: SavedItem) => void;
  removeItem: (id: string) => void;
  isSaved: (id: string) => boolean;
  toggleTask: (taskId: string) => void;
  isTaskDone: (taskId: string) => boolean;
  submitCheckIn: (data: Omit<DailyCheckIn, "date">) => void;
  addToGrocery: (items: string[]) => void;
  toggleGroceryItem: (id: string) => void;
  clearGroceryChecked: () => void;
}

const WellnessContext = createContext<WellnessContextValue>({
  savedItems: [], completedTasks: [], streak: 0, lastCheckIn: null, groceryList: [], checkIns: [],
  saveItem: () => {}, removeItem: () => {}, isSaved: () => false,
  toggleTask: () => {}, isTaskDone: () => false,
  submitCheckIn: () => {}, addToGrocery: () => {}, toggleGroceryItem: () => {}, clearGroceryChecked: () => {},
});

function todayStr() { return new Date().toISOString().split("T")[0]; }

export function WellnessProvider({ children }: { children: React.ReactNode }) {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState<DailyCheckIn | null>(null);
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [checkIns, setCheckIns] = useState<DailyCheckIn[]>([]);

  useEffect(() => {
    setSavedItems(getItem("natura_saved", []));
    setStreak(getItem("natura_streak", 0));
    setGroceryList(getItem("natura_grocery", []));
    const all: DailyCheckIn[] = getItem("natura_checkins", []);
    setCheckIns(all);
    const todayCI = all.find((c) => c.date === todayStr());
    if (todayCI) setLastCheckIn(todayCI);

    const lastDate = getItem("natura_today_date", "");
    const today = todayStr();
    if (lastDate === today) {
      setCompletedTasks(getItem("natura_tasks", []));
    } else {
      setItem("natura_today_date", today);
      setItem("natura_tasks", []);
    }
  }, []);

  const saveItem = useCallback((item: SavedItem) => {
    setSavedItems((prev) => {
      if (prev.find((s) => s.id === item.id)) return prev;
      const updated = [item, ...prev];
      setItem("natura_saved", updated);
      return updated;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setSavedItems((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      setItem("natura_saved", updated);
      return updated;
    });
  }, []);

  const isSaved = useCallback((id: string) => savedItems.some((s) => s.id === id), [savedItems]);

  const toggleTask = useCallback((taskId: string) => {
    setCompletedTasks((prev) => {
      const updated = prev.includes(taskId) ? prev.filter((t) => t !== taskId) : [...prev, taskId];
      setItem("natura_tasks", updated);
      return updated;
    });
  }, []);

  const isTaskDone = useCallback((taskId: string) => completedTasks.includes(taskId), [completedTasks]);

  const submitCheckIn = useCallback((data: Omit<DailyCheckIn, "date">) => {
    const checkIn: DailyCheckIn = { ...data, date: todayStr() };
    setLastCheckIn(checkIn);
    setCheckIns((prev) => {
      const filtered = prev.filter((c) => c.date !== todayStr());
      const updated = [checkIn, ...filtered];
      setItem("natura_checkins", updated);
      return updated;
    });
    setStreak((s) => {
      const newStreak = s + 1;
      setItem("natura_streak", newStreak);
      return newStreak;
    });
  }, []);

  const addToGrocery = useCallback((items: string[]) => {
    setGroceryList((prev) => {
      const existing = new Set(prev.map((g) => g.name.toLowerCase()));
      const newItems: GroceryItem[] = items
        .filter((i) => !existing.has(i.toLowerCase()))
        .map((name) => ({ id: Date.now().toString() + Math.random().toString(36).substr(2, 5), name, checked: false }));
      const updated = [...prev, ...newItems];
      setItem("natura_grocery", updated);
      return updated;
    });
  }, []);

  const toggleGroceryItem = useCallback((id: string) => {
    setGroceryList((prev) => {
      const updated = prev.map((g) => g.id === id ? { ...g, checked: !g.checked } : g);
      setItem("natura_grocery", updated);
      return updated;
    });
  }, []);

  const clearGroceryChecked = useCallback(() => {
    setGroceryList((prev) => {
      const updated = prev.filter((g) => !g.checked);
      setItem("natura_grocery", updated);
      return updated;
    });
  }, []);

  return (
    <WellnessContext.Provider value={{ savedItems, completedTasks, streak, lastCheckIn, groceryList, checkIns, saveItem, removeItem, isSaved, toggleTask, isTaskDone, submitCheckIn, addToGrocery, toggleGroceryItem, clearGroceryChecked }}>
      {children}
    </WellnessContext.Provider>
  );
}

export function useWellness() { return useContext(WellnessContext); }
