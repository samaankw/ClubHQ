import { addWeeks } from "date-fns";

// Coaches overwhelmingly schedule practices at a round time — these six cover
// the common evening slots. A screen's "Custom" option (its own sentinel, not
// part of this list) reveals the original hour/minute/AM-PM fields for
// anything else, so there's still exactly one way to end up with an
// arbitrary time.
export const TIME_PRESETS: { label: string; hour: string; minute: string; meridiem: "AM" | "PM" }[] = [
  { label: "4:00 PM", hour: "4", minute: "00", meridiem: "PM" },
  { label: "4:30 PM", hour: "4", minute: "30", meridiem: "PM" },
  { label: "5:00 PM", hour: "5", minute: "00", meridiem: "PM" },
  { label: "5:30 PM", hour: "5", minute: "30", meridiem: "PM" },
  { label: "6:00 PM", hour: "6", minute: "00", meridiem: "PM" },
  { label: "6:30 PM", hour: "6", minute: "30", meridiem: "PM" },
];

/** The preset whose hour/minute/meridiem match the current field values, if
 * any. A prefilled time that isn't one of the chips must fall back to the
 * custom fields rather than being silently rounded to the nearest one. */
export function matchTimePreset(hour: string, minute: string, meridiem: "AM" | "PM") {
  return TIME_PRESETS.find((p) => p.hour === hour && p.minute === minute && p.meridiem === meridiem);
}

/**
 * Combines a `yyyy-MM-dd` date string with a 12-hour clock reading into the
 * `starts_at` timestamp that gets written to the database.
 *
 * The conversion rule — `hour24 = (hour12 % 12) + (PM ? 12 : 0)` — is what
 * makes 12 AM land on hour 0 and 12 PM land on hour 12, the two cases naive
 * 12-hour conversions classically get backwards. Do not alter it.
 */
export function buildStartsAt(dateStr: string, hour: number, minute: number, meridiem: "AM" | "PM"): Date {
  const hour24 = (hour % 12) + (meridiem === "PM" ? 12 : 0);
  return new Date(`${dateStr}T${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}

/**
 * `count` occurrences of `start`, one a week apart, same day-of-week and
 * clock time every time — the only repeat pattern this club needs, not a
 * full RRULE. Uses date-fns' `addWeeks` (calendar arithmetic) rather than
 * adding `7 * 24 * 60 * 60 * 1000` ms, so a series that spans a DST
 * transition keeps its wall-clock time (e.g. a 5 PM practice stays at 5 PM)
 * instead of drifting an hour.
 */
export function weeklyOccurrences(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addWeeks(start, i));
}
