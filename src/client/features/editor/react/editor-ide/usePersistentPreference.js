import { useState } from "react";

export function usePersistentPreference(key, defaultValue, parse = (value) => value, serialize = String) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? defaultValue : parse(stored);
    } catch {
      return defaultValue;
    }
  });

  const setPersistedValue = (nextValueOrUpdater) => {
    setValue((currentValue) => {
      const nextValue = typeof nextValueOrUpdater === "function"
        ? nextValueOrUpdater(currentValue)
        : nextValueOrUpdater;
      try {
        localStorage.setItem(key, serialize(nextValue));
      } catch {
        // The preference still applies in this editor when storage is unavailable.
      }
      return nextValue;
    });
  };

  return [value, setPersistedValue];
}
