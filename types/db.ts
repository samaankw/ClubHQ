export type Role = "director" | "coach" | "parent" | "player";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  avatar_url?: string | null;
  club_id?: string | null;
  coach_title?: string | null;
  coach_bio?: string | null;
  notify_events?: boolean;
  notify_announcements?: boolean;
}

export interface Club {
  id: string;
  name: string;
  crest_url?: string | null;
  owner_id: string;
}

export interface Team {
  id: string;
  club_id: string;
  name: string;
  age_group?: string | null;
  season?: string | null;
  archived_at?: string | null;
}

export interface Player {
  id: string;
  team_id: string;
  parent_id?: string | null;
  full_name: string;
  birth_date?: string | null;
  position?: string | null;
  photo_url?: string | null;
  archived_at?: string | null;
}

export type PaymentStatus = "paid" | "unpaid";

export interface PlayerPayment {
  id: string;
  player_id: string;
  club_id: string;
  period: string; // "YYYY-MM"
  status: PaymentStatus;
  amount?: number | null;
  note?: string | null;
  marked_by?: string | null;
  marked_at?: string | null;
}

export type AnnouncementCategory =
  | "schedule"
  | "weather"
  | "location"
  | "availability"
  | "clinic"
  | "camp"
  | "training_focus"
  | "challenge"
  | "what_to_bring"
  | "holiday"
  | "general";

export type AnnouncementTargetType = "everyone" | "team" | "players" | "parents";

export interface Announcement {
  id: string;
  club_id: string;
  team_id?: string | null;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  category: AnnouncementCategory;
  target_type: AnnouncementTargetType;
  created_at: string;
  // Set by the announce_event_change() trigger (0033) when a coach edits an
  // event's time or location. These rows aren't hand-written, so the card
  // labels them and hides the edit pencil.
  auto_generated?: boolean;
  source_event_id?: string | null;
  source_prev_starts_at?: string | null;
  source_prev_location?: string | null;
}

export type EventType = "practice" | "game" | "tournament" | "club_event";

export interface ClubEvent {
  id: string;
  club_id: string;
  team_id?: string | null;
  type: EventType;
  title: string;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  notes?: string | null;
  created_by: string;
  series_id?: string | null;
  // Only present when the query embeds these relations (schedule list, event detail).
  teams?: { name: string; age_group?: string | null } | null;
  event_players?: { players: { id: string; full_name: string } }[];
}

export interface Evaluation {
  id: string;
  player_id: string;
  coach_id: string;
  first_touch?: number | null;
  ball_control?: number | null;
  passing?: number | null;
  dribbling?: number | null;
  weak_foot?: number | null;
  finishing?: number | null;
  decision_making?: number | null;
  scanning?: number | null;
  speed?: number | null;
  positioning?: number | null;
  coach_notes?: string | null;
  source: "manual" | "voice";
  created_at: string;
}

export interface DevelopmentPriority {
  skill: string;
  note: string;
}

export type DevelopmentPlanStatus = "draft" | "coach_reviewed" | "published" | "archived";

export interface DevelopmentPlan {
  id: string;
  player_id: string;
  evaluation_id: string;
  priorities: DevelopmentPriority[];
  summary: string;
  overall_score_before?: number | null;
  overall_score_after?: number | null;
  week_start: string;
  status: DevelopmentPlanStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  created_at: string;
}

export interface HomeworkItem {
  id: string;
  development_plan_id: string;
  player_id: string;
  day_of_week?: string | null;
  title: string;
  description?: string | null;
  drill_id?: string | null;
  completed: boolean;
  completed_at?: string | null;
  due_date?: string | null;
  parent_note?: string | null;
  coach_feedback?: string | null;
  difficulty?: "easy" | "right_level" | "hard" | null;
}

export interface Drill {
  id: string;
  club_id?: string | null;
  skill: string;
  title: string;
  description: string;
  video_url?: string | null;
  age_range?: string | null;
  equipment?: string | null;
  added_by?: string | null;
}


export type RSVPStatus = "yes" | "no" | "maybe" | "no_response";
export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface EventRSVP {
  event_id: string;
  player_id: string;
  status: RSVPStatus;
}

export interface AttendanceRecord {
  event_id: string;
  player_id: string;
  status: AttendanceStatus;
  notes?: string | null;
  marked_by?: string | null;
  marked_at: string;
}
