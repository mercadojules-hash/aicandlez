import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_DAY   = "@natura_journey_day";
const STORAGE_DONE  = "@natura_journey_done";
const STORAGE_START = "@natura_journey_start";

const TOTAL_DAYS = 28;

export function useJourney() {
  const [currentDay, setCurrentDay]       = useState(1);
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [startDate, setStartDate]         = useState<string | null>(null);
  const [loaded, setLoaded]               = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [day, done, start] = await Promise.all([
          AsyncStorage.getItem(STORAGE_DAY),
          AsyncStorage.getItem(STORAGE_DONE),
          AsyncStorage.getItem(STORAGE_START),
        ]);
        if (day) setCurrentDay(Math.min(parseInt(day, 10), TOTAL_DAYS));
        if (done) setCompletedDays(JSON.parse(done));
        if (!start) {
          const today = new Date().toISOString();
          setStartDate(today);
          await AsyncStorage.setItem(STORAGE_START, today);
        } else {
          setStartDate(start);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const completeDay = async (day: number) => {
    if (completedDays.includes(day)) return;
    const newDone = [...completedDays, day];
    const nextDay = Math.min(day + 1, TOTAL_DAYS);
    setCompletedDays(newDone);
    setCurrentDay(nextDay);
    try {
      await AsyncStorage.setItem(STORAGE_DONE, JSON.stringify(newDone));
      await AsyncStorage.setItem(STORAGE_DAY, String(nextDay));
    } catch {}
  };

  const currentWeek = Math.ceil(currentDay / 7);

  return { currentDay, currentWeek, completedDays, startDate, loaded, completeDay };
}
