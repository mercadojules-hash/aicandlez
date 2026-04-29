import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SOUND_KEY = "@natura_sound_enabled";

export function useSoundPreference() {
  const [soundEnabled, setSoundState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(SOUND_KEY).then((v) => {
      if (v === "false") setSoundState(false);
    });
  }, []);

  const setSoundEnabled = useCallback(async (val: boolean) => {
    setSoundState(val);
    await AsyncStorage.setItem(SOUND_KEY, String(val));
  }, []);

  return { soundEnabled, setSoundEnabled };
}
