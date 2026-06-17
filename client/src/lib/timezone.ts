/** UI-only timezone preference. Backend timestamps stay UTC. */

export const TIMEZONE_STORAGE_KEY = "goodtrading.timezone";

export type TimezonePreferenceId =
  | "UTC"
  | "local"
  | "America/Argentina/Buenos_Aires"
  | "America/New_York"
  | "America/Chicago"
  | "Europe/London"
  | "Asia/Tokyo";

export const DEFAULT_TIMEZONE: TimezonePreferenceId = "UTC";

export type TimezoneOption = {
  id: TimezonePreferenceId;
  label: string;
  displayLabel: string;
  iana: string | null;
};

export const TIMEZONE_OPTIONS: readonly TimezoneOption[] = [
  { id: "UTC", label: "UTC", displayLabel: "UTC", iana: "UTC" },
  { id: "local", label: "Local Browser", displayLabel: "Local", iana: null },
  {
    id: "America/Argentina/Buenos_Aires",
    label: "UTC-3 Argentina",
    displayLabel: "UTC-3",
    iana: "America/Argentina/Buenos_Aires",
  },
  {
    id: "America/New_York",
    label: "New York (ET)",
    displayLabel: "ET",
    iana: "America/New_York",
  },
  {
    id: "America/Chicago",
    label: "Chicago (CT)",
    displayLabel: "CT",
    iana: "America/Chicago",
  },
  {
    id: "Europe/London",
    label: "London (GMT/BST)",
    displayLabel: "GMT",
    iana: "Europe/London",
  },
  {
    id: "Asia/Tokyo",
    label: "Tokyo (JST)",
    displayLabel: "JST",
    iana: "Asia/Tokyo",
  },
] as const;

const TIMEZONE_EVENT = "goodtrading:timezone-change";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function isTimezonePreferenceId(value: string): value is TimezonePreferenceId {
  return TIMEZONE_OPTIONS.some((opt) => opt.id === value);
}

export function readTimezonePreference(): TimezonePreferenceId {
  if (typeof window === "undefined") return DEFAULT_TIMEZONE;
  try {
    const raw = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (raw && isTimezonePreferenceId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_TIMEZONE;
}

export function writeTimezonePreference(id: TimezonePreferenceId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  clearTimezoneFormatterCache();
  window.dispatchEvent(new CustomEvent(TIMEZONE_EVENT, { detail: id }));
}

export function subscribeTimezonePreference(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onCustom = () => onStoreChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key === TIMEZONE_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener(TIMEZONE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(TIMEZONE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function getTimezoneOption(id: TimezonePreferenceId = readTimezonePreference()): TimezoneOption {
  return TIMEZONE_OPTIONS.find((opt) => opt.id === id) ?? TIMEZONE_OPTIONS[0];
}

export function getTimezoneDisplayLabel(id: TimezonePreferenceId = readTimezonePreference()): string {
  return getTimezoneOption(id).displayLabel;
}

export function resolveIanaTimezone(id: TimezonePreferenceId = readTimezonePreference()): string | undefined {
  const option = getTimezoneOption(id);
  return option.iana ?? undefined;
}

function toEpochMs(input: number | Date | string): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === "number") return input < 1e12 ? input * 1000 : input;
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function getFormatter(options: Intl.DateTimeFormatOptions, preferenceId?: TimezonePreferenceId): Intl.DateTimeFormat {
  const id = preferenceId ?? readTimezonePreference();
  const timeZone = resolveIanaTimezone(id);
  const key = `${id}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour12: false,
    ...options,
    ...(timeZone ? { timeZone } : {}),
  });
  formatterCache.set(key, formatter);
  return formatter;
}

export function formatTerminalTime(
  input: number | Date | string,
  preferenceId?: TimezonePreferenceId,
): string {
  return getFormatter(
    { hour: "2-digit", minute: "2-digit", second: "2-digit" },
    preferenceId,
  ).format(new Date(toEpochMs(input)));
}

export function formatTerminalDateTime(
  input: number | Date | string,
  preferenceId?: TimezonePreferenceId,
): string {
  return getFormatter(
    {
      year: "2-digit",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    preferenceId,
  ).format(new Date(toEpochMs(input)));
}

export function formatTerminalDate(
  input: number | Date | string,
  preferenceId?: TimezonePreferenceId,
): string {
  return getFormatter(
    { year: "numeric", month: "short", day: "2-digit" },
    preferenceId,
  ).format(new Date(toEpochMs(input)));
}

/** Bookmap / chart axis — compact HH:mm */
export function formatTerminalTimeAxis(
  inputMs: number,
  preferenceId?: TimezonePreferenceId,
): string {
  return getFormatter({ hour: "2-digit", minute: "2-digit" }, preferenceId).format(
    new Date(inputMs),
  );
}

/** Lightweight Charts UTCTimestamp (seconds) or BusinessDay */
export function formatLwChartTime(
  time: number | string | { year: number; month: number; day: number },
  preferenceId?: TimezonePreferenceId,
): string {
  if (typeof time === "number") {
    return formatTerminalTimeAxis(time * 1000, preferenceId);
  }
  if (typeof time === "string") return time;
  const ms = Date.UTC(time.year, time.month - 1, time.day);
  return formatTerminalDate(ms, preferenceId);
}

export function formatLwChartDate(
  date: { year: number; month: number; day: number },
  preferenceId?: TimezonePreferenceId,
): string {
  const ms = Date.UTC(date.year, date.month - 1, date.day);
  return formatTerminalDate(ms, preferenceId);
}

export function clearTimezoneFormatterCache(): void {
  formatterCache.clear();
}
