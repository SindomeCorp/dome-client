import { useState } from "react";

export function usePersistentPreference(key, defaultValue, parse = (value) => value, serialize = String) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored == null ? defaultValue : parse(stored);
  });

  const setPersistedValue = (nextValueOrUpdater) => {
    setValue((currentValue) => {
      const nextValue = typeof nextValueOrUpdater === "function"
        ? nextValueOrUpdater(currentValue)
        : nextValueOrUpdater;
      localStorage.setItem(key, serialize(nextValue));
      return nextValue;
    });
  };

  return [value, setPersistedValue];
}
