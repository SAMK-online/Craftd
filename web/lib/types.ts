// Types mirror the backend Pydantic models in app/models/pipeline.py.

export interface JobMatch {
  title: string;
  company: string;
  url: string;
  location?: string | null;
  job_type?: string | null;
  posted_date?: string | null;
  description_snippet: string;
  fit_reason: string;
  ats_platform?: string | null;
}

export interface OutreachDraft {
  linkedin_dm: string;
  follow_up_email_subject: string;
  follow_up_email_body: string;
  talking_points: string[];
}

export interface IntelReport {
  contact_name: string;
  contact_company: string;
  contact_title?: string | null;
  contact_email?: string | null;
  person_summary: string;
  company_snapshot: string;
  opportunity_angle: string;
  top_job_matches: JobMatch[];
  outreach: OutreachDraft;
  enrichment_used: boolean;
}

// A person discovered via the "Find people" search.
export interface FoundContact {
  name: string;
  company?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
}

// Input the user provides to kick off the pipeline.
export interface GenerateInput {
  name?: string;
  company?: string;
  title?: string;
  eventName?: string;
  cardImage?: File | null;
}

// Server-Sent Event names emitted by /api/generate/stream.
export type StreamEventName =
  | "pipeline_start"
  | "stage_start"
  | "stage_complete"
  | "stage_warning"
  | "stage_error"
  | "done"
  | "error";

export interface StreamEvent {
  event: StreamEventName;
  data: Record<string, unknown>;
}

// The pipeline stages, in display order.
export type StageKey = "ocr" | "enrich_and_jobs" | "report";
export type StageStatus = "pending" | "active" | "done" | "warning" | "error";

export interface StageState {
  key: StageKey;
  label: string;
  status: StageStatus;
  detail?: string;
  duration?: number;
}
