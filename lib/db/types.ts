/**
 * TypeScript-types van de database, met de hand gelijk gehouden met
 * supabase/migrations. (Later kun je ze genereren met
 * `npx supabase gen types typescript --project-id <id>`.)
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;

export type VacancyStatus = "draft" | "open" | "paused" | "closed";
export type CandidateStatus = "active" | "opted_out" | "anonymized";
export type Stage = "new" | "contacted" | "replied" | "interview" | "placed" | "rejected" | "opted_out";
export type Channel = "linkedin_invite" | "linkedin_message" | "email";
export type MessageStatus = "draft" | "approved" | "rejected" | "queued" | "sent" | "failed" | "received";
export type ReplyCategory = "interest" | "no_interest" | "question" | "opt_out" | "review";
export type ApiType = "classic" | "sales_navigator" | "recruiter";

/** Maakt van een rij-type een insert-type: velden met een standaardwaarde zijn optioneel. */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Omit<Row, Required>>;

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Vacancy = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  country: string;
  requirements: Json;
  status: VacancyStatus;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Candidate = {
  id: string;
  linkedin_provider_id: string | null;
  linkedin_url: string | null;
  full_name: string;
  headline: string | null;
  location: string | null;
  country: string | null;
  language: "nl" | "en";
  current_company: string | null;
  experience: Json;
  skills: string[];
  email: string | null;
  phone: string | null;
  source: "manual" | "linkedin_search" | "linkedin_import";
  status: CandidateStatus;
  opted_out_at: Timestamp | null;
  last_contacted_at: Timestamp | null;
  last_reply_at: Timestamp | null;
  anonymized_at: Timestamp | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type CandidateVacancy = {
  candidate_id: string;
  vacancy_id: string;
  match_score: number | null;
  match_reason: string | null;
  match_details: Json;
  matched_at: Timestamp | null;
  stage: Stage;
  stage_changed_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type Message = {
  id: string;
  candidate_id: string;
  vacancy_id: string | null;
  channel: Channel;
  direction: "out" | "in";
  subject: string | null;
  body: string;
  status: MessageStatus;
  follow_up_step: number;
  approved_by: string | null;
  approved_at: Timestamp | null;
  unipile_chat_id: string | null;
  unipile_message_id: string | null;
  reply_category: ReplyCategory | null;
  error: string | null;
  scheduled_at: Timestamp | null;
  sent_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type FollowUp = {
  id: string;
  candidate_id: string;
  vacancy_id: string | null;
  message_id: string | null;
  due_at: Timestamp;
  step: number;
  done: boolean;
  created_at: Timestamp;
};

export type Search = {
  id: string;
  vacancy_id: string | null;
  query: Json;
  api_type: ApiType;
  results_count: number;
  created_by: string | null;
  created_at: Timestamp;
};

export type ActivityLog = {
  id: number;
  actor: "user" | "system";
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Json;
  created_at: Timestamp;
};

export type Setting = {
  key: string;
  value: Json;
  description: string | null;
  updated_at: Timestamp;
};

export type DoNotContact = {
  hash: string;
  kind: "linkedin" | "email";
  reason: string;
  created_at: Timestamp;
};

export type LinkedinAction = {
  id: number;
  kind: "profile_view" | "search" | "invite" | "message";
  amount: number;
  at: Timestamp;
  details: Json;
};

export type RateState = { key: string; next_at: Timestamp };

export type ImportStatus = "pending" | "processing" | "done" | "skipped" | "failed";

export type ImportQueueItem = {
  id: string;
  vacancy_id: string | null;
  search_id: string | null;
  provider_id: string;
  public_identifier: string | null;
  name: string | null;
  status: ImportStatus;
  result: string | null;
  candidate_id: string | null;
  attempts: number;
  claimed_at: Timestamp | null;
  created_by: string | null;
  created_at: Timestamp;
  processed_at: Timestamp | null;
};

/** Antwoord van linkedin_take_slot / linkedin_record_search. */
export type SlotResult = {
  ok: boolean;
  reason?: "wait" | "daily_limit" | "weekly_limit";
  wait_seconds?: number;
  used?: number;
  limit?: number;
};

export type Database = {
  public: {
    Tables: {
      vacancies: Table<Vacancy, "title">;
      candidates: Table<Candidate, "full_name">;
      candidate_vacancy: Table<CandidateVacancy, "candidate_id" | "vacancy_id">;
      messages: Table<Message, "candidate_id" | "channel" | "direction" | "body">;
      follow_ups: Table<FollowUp, "candidate_id" | "due_at" | "step">;
      searches: Table<Search, never>;
      activity_log: Table<ActivityLog, "actor" | "action" | "entity">;
      settings: Table<Setting, "key" | "value">;
      do_not_contact: Table<DoNotContact, "hash" | "kind">;
      linkedin_actions: Table<LinkedinAction, "kind">;
      rate_state: Table<RateState, "key">;
      import_queue: Table<ImportQueueItem, "provider_id">;
    };
    Views: { [_ in never]: never };
    Functions: {
      linkedin_take_slot: {
        Args: {
          p_kind: LinkedinAction["kind"];
          p_daily_limit: number;
          p_weekly_limit?: number | null;
          p_min_delay?: number;
          p_max_delay?: number;
          p_details?: Json;
        };
        Returns: Json;
      };
      linkedin_record_search: {
        Args: { p_results: number; p_daily_limit: number; p_details?: Json };
        Returns: Json;
      };
      linkedin_count: { Args: { p_kind: string; p_period: string }; Returns: number };
      claim_next_import: { Args: { p_vacancy_id?: string | null }; Returns: ImportQueueItem[] };
      release_stuck_imports: { Args: Record<string, never>; Returns: number };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
