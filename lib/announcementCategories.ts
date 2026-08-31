import { AnnouncementCategory } from "@/types/db";

export type FilterBucket = "schedule" | "weather" | "training" | "events" | "general";

// Three urgency tiers, not just decoration:
//   changed  — something about a plan a parent already made just changed
//   opportunity — scarcity-driven, act if interested (spots, registration)
//   info     — routine, read-when-you-have-a-sec
export type UrgencyTier = "changed" | "opportunity" | "info";

const TIER_COLOR: Record<UrgencyTier, string> = {
  changed: "#FF9F0A",
  opportunity: "#30D158",
  info: "#0A6CFF",
};

interface CategoryMeta {
  label: string;
  icon: keyof typeof import("@expo/vector-icons/Ionicons").default.glyphMap;
  bucket: FilterBucket;
  tier: UrgencyTier;
  color: string;
  actionLabel?: string;
}

function meta(
  label: string,
  icon: CategoryMeta["icon"],
  bucket: FilterBucket,
  tier: UrgencyTier,
  actionLabel?: string
): CategoryMeta {
  return { label, icon, bucket, tier, color: TIER_COLOR[tier], actionLabel };
}

// Drives: the category chip shown on each create-announcement pick, the
// icon/label/accent-color on each card, which of the 6 top filter chips a
// post falls under, and whether a card gets an optional "View ___" button.
export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, CategoryMeta> = {
  schedule: meta("Schedule Update", "time-outline", "schedule", "changed", "View Schedule"),
  location: meta("Location Change", "location-outline", "schedule", "changed", "View Schedule"),
  holiday: meta("Holiday / No Training", "calendar-outline", "schedule", "changed", "View Schedule"),
  cancellation: meta("Session Cancelled", "close-circle-outline", "schedule", "changed", "View Schedule"),
  weather: meta("Weather Update", "rainy-outline", "weather", "changed"),
  availability: meta("Training Availability", "checkmark-circle-outline", "training", "opportunity", "View Availability"),
  clinic: meta("Upcoming Clinic", "megaphone-outline", "events", "opportunity", "View Details"),
  camp: meta("Camp", "sunny-outline", "events", "opportunity", "View Details"),
  training_focus: meta("Weekly Training Focus", "football-outline", "training", "info"),
  challenge: meta("Player Challenge", "trophy-outline", "training", "info"),
  what_to_bring: meta("What to Bring", "bag-outline", "training", "info"),
  general: meta("General Update", "chatbubble-ellipses-outline", "general", "info"),
};

// Categories a coach can pick when composing by hand. 'cancellation' is
// excluded: it's written by the delete trigger (0034), and choosing it in the
// composer would post "Cancelled" while the session stays on the schedule —
// exactly the contradiction the automatic notices exist to remove. To cancel
// a session, delete the session.
export const COMPOSABLE_CATEGORIES = (
  Object.keys(ANNOUNCEMENT_CATEGORIES) as AnnouncementCategory[]
).filter((key) => key !== "cancellation");

export const FILTER_BUCKETS: { key: FilterBucket | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "schedule", label: "Schedule" },
  { key: "weather", label: "Weather" },
  { key: "training", label: "Training" },
  { key: "events", label: "Events" },
  { key: "general", label: "General" },
];
