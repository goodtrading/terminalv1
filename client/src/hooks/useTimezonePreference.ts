import { useSyncExternalStore } from "react";
import {
  DEFAULT_TIMEZONE,
  getTimezoneDisplayLabel,
  getTimezoneOption,
  readTimezonePreference,
  subscribeTimezonePreference,
  writeTimezonePreference,
  type TimezonePreferenceId,
} from "@/lib/timezone";

export function useTimezonePreference() {
  const preference = useSyncExternalStore(
    subscribeTimezonePreference,
    readTimezonePreference,
    () => DEFAULT_TIMEZONE,
  );

  return {
    preference,
    option: getTimezoneOption(preference),
    displayLabel: getTimezoneDisplayLabel(preference),
    setPreference: (id: TimezonePreferenceId) => {
      writeTimezonePreference(id);
    },
  };
}
