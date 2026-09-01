export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcement_player_targets: {
        Row: {
          announcement_id: string
          id: string
          player_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          player_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_player_targets_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_player_targets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string | null
          auto_generated: boolean
          body: string
          category: string
          club_id: string | null
          created_at: string | null
          id: string
          pinned: boolean | null
          source_cancelled_event_ids: string[] | null
          source_cancelled_starts_at: string[] | null
          source_event_id: string | null
          source_prev_location: string | null
          source_prev_starts_at: string | null
          source_series_id: string | null
          target_type: string
          team_id: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          auto_generated?: boolean
          body: string
          category?: string
          club_id?: string | null
          created_at?: string | null
          id?: string
          pinned?: boolean | null
          source_cancelled_event_ids?: string[] | null
          source_cancelled_starts_at?: string[] | null
          source_event_id?: string | null
          source_prev_location?: string | null
          source_prev_starts_at?: string | null
          source_series_id?: string | null
          target_type?: string
          team_id?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          auto_generated?: boolean
          body?: string
          category?: string
          club_id?: string | null
          created_at?: string | null
          id?: string
          pinned?: boolean | null
          source_cancelled_event_ids?: string[] | null
          source_cancelled_starts_at?: string[] | null
          source_event_id?: string | null
          source_prev_location?: string | null
          source_prev_starts_at?: string | null
          source_series_id?: string | null
          target_type?: string
          team_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          event_id: string
          marked_at: string
          marked_by: string | null
          notes: string | null
          player_id: string
          status: string
        }
        Insert: {
          event_id: string
          marked_at?: string
          marked_by?: string | null
          notes?: string | null
          player_id: string
          status: string
        }
        Update: {
          event_id?: string
          marked_at?: string
          marked_by?: string | null
          notes?: string | null
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string | null
          crest_url: string | null
          id: string
          join_code: string | null
          name: string
          org_type: string
          owner_id: string | null
          timezone: string
        }
        Insert: {
          created_at?: string | null
          crest_url?: string | null
          id?: string
          join_code?: string | null
          name: string
          org_type?: string
          owner_id?: string | null
          timezone?: string
        }
        Update: {
          created_at?: string | null
          crest_url?: string | null
          id?: string
          join_code?: string | null
          name?: string
          org_type?: string
          owner_id?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_type: string
          consented_at: string | null
          id: string
          player_id: string | null
          policy_version: string
          user_id: string
        }
        Insert: {
          consent_type: string
          consented_at?: string | null
          id?: string
          player_id?: string | null
          policy_version?: string
          user_id: string
        }
        Update: {
          consent_type?: string
          consented_at?: string | null
          id?: string
          player_id?: string | null
          policy_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          club_id: string | null
          created_at: string | null
          id: string
          team_id: string | null
          type: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          id?: string
          team_id?: string | null
          type?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          id?: string
          team_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      development_plans: {
        Row: {
          created_at: string | null
          evaluation_id: string | null
          id: string
          overall_score_after: number | null
          overall_score_before: number | null
          player_id: string | null
          priorities: Json
          published_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          summary: string | null
          week_start: string | null
        }
        Insert: {
          created_at?: string | null
          evaluation_id?: string | null
          id?: string
          overall_score_after?: number | null
          overall_score_before?: number | null
          player_id?: string | null
          priorities: Json
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          week_start?: string | null
        }
        Update: {
          created_at?: string | null
          evaluation_id?: string | null
          id?: string
          overall_score_after?: number | null
          overall_score_before?: number | null
          player_id?: string | null
          priorities?: Json
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          summary?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "development_plans_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_plans_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drills: {
        Row: {
          added_by: string | null
          age_range: string | null
          club_id: string | null
          created_at: string | null
          description: string
          equipment: string | null
          id: string
          skill: string
          title: string
          video_url: string | null
        }
        Insert: {
          added_by?: string | null
          age_range?: string | null
          club_id?: string | null
          created_at?: string | null
          description: string
          equipment?: string | null
          id?: string
          skill: string
          title: string
          video_url?: string | null
        }
        Update: {
          added_by?: string | null
          age_range?: string | null
          club_id?: string | null
          created_at?: string | null
          description?: string
          equipment?: string | null
          id?: string
          skill?: string
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drills_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drills_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          ball_control: number | null
          coach_id: string | null
          coach_notes: string | null
          created_at: string | null
          decision_making: number | null
          dribbling: number | null
          finishing: number | null
          first_touch: number | null
          id: string
          passing: number | null
          player_id: string | null
          positioning: number | null
          scanning: number | null
          source: string | null
          speed: number | null
          weak_foot: number | null
        }
        Insert: {
          ball_control?: number | null
          coach_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          decision_making?: number | null
          dribbling?: number | null
          finishing?: number | null
          first_touch?: number | null
          id?: string
          passing?: number | null
          player_id?: string | null
          positioning?: number | null
          scanning?: number | null
          source?: string | null
          speed?: number | null
          weak_foot?: number | null
        }
        Update: {
          ball_control?: number | null
          coach_id?: string | null
          coach_notes?: string | null
          created_at?: string | null
          decision_making?: number | null
          dribbling?: number | null
          finishing?: number | null
          first_touch?: number | null
          id?: string
          passing?: number | null
          player_id?: string | null
          positioning?: number | null
          scanning?: number | null
          source?: string | null
          speed?: number | null
          weak_foot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_players: {
        Row: {
          club_id: string
          event_id: string
          id: string
          player_id: string
        }
        Insert: {
          club_id: string
          event_id: string
          id?: string
          player_id: string
        }
        Update: {
          club_id?: string
          event_id?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_players_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_players_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          event_id: string
          player_id: string
          status: string | null
        }
        Insert: {
          event_id: string
          player_id: string
          status?: string | null
        }
        Update: {
          event_id?: string
          player_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          club_id: string | null
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          id: string
          location: string | null
          notes: string | null
          series_id: string | null
          starts_at: string
          team_id: string | null
          title: string
          type: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          series_id?: string | null
          starts_at: string
          team_id?: string | null
          title: string
          type: string
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          series_id?: string | null
          starts_at?: string
          team_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_items: {
        Row: {
          coach_feedback: string | null
          completed: boolean | null
          completed_at: string | null
          day_of_week: string | null
          description: string | null
          development_plan_id: string | null
          difficulty: string | null
          drill_id: string | null
          due_date: string | null
          id: string
          parent_note: string | null
          player_id: string | null
          title: string
        }
        Insert: {
          coach_feedback?: string | null
          completed?: boolean | null
          completed_at?: string | null
          day_of_week?: string | null
          description?: string | null
          development_plan_id?: string | null
          difficulty?: string | null
          drill_id?: string | null
          due_date?: string | null
          id?: string
          parent_note?: string | null
          player_id?: string | null
          title: string
        }
        Update: {
          coach_feedback?: string | null
          completed?: boolean | null
          completed_at?: string | null
          day_of_week?: string | null
          description?: string | null
          development_plan_id?: string | null
          difficulty?: string | null
          drill_id?: string | null
          due_date?: string | null
          id?: string
          parent_note?: string | null
          player_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_items_development_plan_id_fkey"
            columns: ["development_plan_id"]
            isOneToOne: false
            referencedRelation: "development_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_items_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_items_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string | null
          created_at: string | null
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_link_codes: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          player_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          player_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_link_codes_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_link_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_link_codes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_payments: {
        Row: {
          amount: number | null
          club_id: string
          id: string
          marked_at: string | null
          marked_by: string | null
          note: string | null
          period: string
          player_id: string
          status: string
        }
        Insert: {
          amount?: number | null
          club_id: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          note?: string | null
          period: string
          player_id: string
          status?: string
        }
        Update: {
          amount?: number | null
          club_id?: string
          id?: string
          marked_at?: string | null
          marked_by?: string | null
          note?: string | null
          period?: string
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_payments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_payments_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_payments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          archived_at: string | null
          birth_date: string | null
          created_at: string | null
          full_name: string
          id: string
          parent_id: string | null
          photo_url: string | null
          position: string | null
          team_id: string | null
        }
        Insert: {
          archived_at?: string | null
          birth_date?: string | null
          created_at?: string | null
          full_name: string
          id?: string
          parent_id?: string | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
        }
        Update: {
          archived_at?: string | null
          birth_date?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          parent_id?: string | null
          photo_url?: string | null
          position?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          club_id: string | null
          coach_bio: string | null
          coach_title: string | null
          created_at: string | null
          full_name: string
          id: string
          notify_announcements: boolean
          notify_events: boolean
          role: string
        }
        Insert: {
          avatar_url?: string | null
          club_id?: string | null
          coach_bio?: string | null
          coach_title?: string | null
          created_at?: string | null
          full_name: string
          id: string
          notify_announcements?: boolean
          notify_events?: boolean
          role: string
        }
        Update: {
          avatar_url?: string | null
          club_id?: string | null
          coach_bio?: string | null
          coach_title?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          notify_announcements?: boolean
          notify_events?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_fk"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          enabled: boolean
          expo_push_token: string
          id: string
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          expo_push_token: string
          id?: string
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          expo_push_token?: string
          id?: string
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          created_at: string | null
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      report_views: {
        Row: {
          created_at: string | null
          id: string
          player_id: string | null
          viewer_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          player_id?: string | null
          viewer_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          player_id?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_views_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_log: {
        Row: {
          action: string
          actor_id: string
          club_id: string | null
          created_at: string | null
          id: string
          new_role: string | null
          old_role: string | null
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          club_id?: string | null
          created_at?: string | null
          id?: string
          new_role?: string | null
          old_role?: string | null
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          club_id?: string | null
          created_at?: string | null
          id?: string
          new_role?: string | null
          old_role?: string | null
          target_id?: string
        }
        Relationships: []
      }
      team_coaches: {
        Row: {
          coach_id: string
          team_id: string
        }
        Insert: {
          coach_id: string
          team_id: string
        }
        Update: {
          coach_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          archived_at: string | null
          club_id: string | null
          created_at: string | null
          id: string
          kind: string
          name: string
          season: string | null
        }
        Insert: {
          age_group?: string | null
          archived_at?: string | null
          club_id?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          name: string
          season?: string | null
        }
        Update: {
          age_group?: string | null
          archived_at?: string | null
          club_id?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          name?: string
          season?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_event_cancellation_notice: {
        Args: {
          p_event_title: string
          p_starts_at: string[]
          p_timezone: string
        }
        Returns: {
          body: string
          title: string
        }[]
      }
      build_event_change_notice: {
        Args: {
          p_event_id: string
          p_event_title: string
          p_new_location: string
          p_new_starts_at: string
          p_prev_location: string
          p_prev_starts_at: string
          p_timezone: string
        }
        Returns: {
          body: string
          category: string
          title: string
        }[]
      }
      cancel_event_series: {
        Args: { p_from: string; p_notify?: boolean; p_series_id: string }
        Returns: string[]
      }
      check_rate_limit: {
        Args: {
          p_function_name: string
          p_max_calls: number
          p_user_id: string
          p_window_minutes: number
        }
        Returns: boolean
      }
      claim_parent_link_code: {
        Args: { p_code: string; p_confirm_parental_consent: boolean }
        Returns: string
      }
      create_club: {
        Args: { club_name: string }
        Returns: {
          created_at: string | null
          crest_url: string | null
          id: string
          join_code: string | null
          name: string
          org_type: string
          owner_id: string | null
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_parent_link_code: {
        Args: { p_player_id: string }
        Returns: string
      }
      create_targeted_event: {
        Args: {
          p_club_id: string
          p_location: string
          p_notes: string
          p_player_ids: string[]
          p_series_id?: string
          p_starts_at: string
          p_team_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      current_user_club: { Args: never; Returns: string }
      delete_event: {
        Args: { p_event_id: string; p_notify?: boolean }
        Returns: string[]
      }
      delete_player_data: { Args: { p_player_id: string }; Returns: undefined }
      event_change_notice_window: { Args: never; Returns: string }
      get_conversation_inbox: {
        Args: never
        Returns: {
          id: string
          last_message: string
          last_message_at: string
          other_participant_name: string
          team_age_group: string
          team_id: string
          team_name: string
          type: string
        }[]
      }
      is_club_member: { Args: { target_club: string }; Returns: boolean }
      is_club_staff: { Args: { target_club: string }; Returns: boolean }
      join_club: {
        Args: { code: string }
        Returns: {
          created_at: string | null
          crest_url: string | null
          id: string
          join_code: string | null
          name: string
          org_type: string
          owner_id: string | null
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "clubs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_development_plan: {
        Args: { p_plan_id: string; p_publish: boolean }
        Returns: undefined
      }
      search_messages: {
        Args: { p_query: string }
        Returns: {
          body: string
          conversation_id: string
          conversation_type: string
          created_at: string
          message_id: string
          other_participant_name: string
          sender_name: string
          team_age_group: string
          team_name: string
        }[]
      }
      set_member_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: undefined
      }
      set_team_coach: {
        Args: { p_assigned: boolean; p_coach_id: string; p_team_id: string }
        Returns: undefined
      }
      start_direct_conversation: {
        Args: { p_other_user_id: string }
        Returns: string
      }
      start_team_conversation: { Args: { p_team_id: string }; Returns: string }
      update_targeted_event: {
        Args: {
          p_event_id: string
          p_location: string
          p_notes: string
          p_notify?: boolean
          p_player_ids: string[]
          p_starts_at: string
          p_team_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
