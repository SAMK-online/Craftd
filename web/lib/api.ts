import type {
  FoundContact,
  GenerateInput,
  IntelReport,
  RunSummary,
  StreamEvent,
  StreamEventName,
  UserGoal,
  UserPersona,
} from "./types";

// Base URL of the FastAPI backend. Override via NEXT_PUBLIC_API_URL.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

function buildFormData(input: GenerateInput, persona?: UserPersona | null): FormData {
  const fd = new FormData();
  if (input.name) fd.append("name", input.name);
  if (input.company) fd.append("company", input.company);
  if (input.title) fd.append("title", input.title);
  if (input.eventName) fd.append("event_name", input.eventName);
  if (input.cardImage) fd.append("card_image", input.cardImage);
  if (persona) fd.append("persona", JSON.stringify(persona));
  return fd;
}

/** Queue a contact for background processing. Returns immediately. */
export async function enqueueRun(
  input: GenerateInput,
  persona?: UserPersona | null,
): Promise<RunSummary> {
  const resp = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    body: buildFormData(input, persona),
  });
  if (!resp.ok) throw new Error(`Could not queue contact (${resp.status})`);
  return resp.json();
}

/** List all runs for the dashboard (newest first). */
export async function listRuns(): Promise<RunSummary[]> {
  const resp = await fetch(`${API_BASE}/api/runs`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Could not load dashboard (${resp.status})`);
  return (await resp.json()).runs as RunSummary[];
}

/** Fetch a full run including its report. */
export async function getRun(
  id: string,
): Promise<RunSummary & { report: IntelReport | null }> {
  const resp = await fetch(`${API_BASE}/api/runs/${id}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Could not load run (${resp.status})`);
  return resp.json();
}

export async function deleteRun(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/runs/${id}`, { method: "DELETE" });
}

/** Parse a resume PDF into a profile (summary, skills, target roles). */
export async function parseResume(
  file: File,
  goal: UserGoal,
): Promise<{ resume_summary: string; skills: string[]; target_roles: string[] }> {
  const fd = new FormData();
  fd.append("resume", file);
  fd.append("goal", goal);
  const resp = await fetch(`${API_BASE}/api/persona/resume`, { method: "POST", body: fd });
  if (!resp.ok) throw new Error(`Resume parsing failed (${resp.status})`);
  return resp.json();
}

/**
 * Call POST /api/generate/stream and invoke `onEvent` for each SSE frame.
 *
 * EventSource only supports GET, and this endpoint is a multipart POST, so we
 * read the response body as a stream and parse the `event:`/`data:` frames by
 * hand. Resolves when the stream ends; rejects on a network/HTTP failure.
 */
export async function streamGenerate(
  input: GenerateInput,
  onEvent: (evt: StreamEvent) => void,
  signal?: AbortSignal,
  persona?: UserPersona | null,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/generate/stream`, {
    method: "POST",
    body: buildFormData(input, persona),
    signal,
  });

  if (!resp.ok || !resp.body) {
    let detail = `Request failed (${resp.status})`;
    try {
      const j = await resp.json();
      detail = (j?.detail && JSON.stringify(j.detail)) || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
    }
  }
}

/** Discover people matching a free-text query (Exa Search + Claude). */
export async function findPeople(
  query: string,
  count = 5,
  signal?: AbortSignal,
): Promise<FoundContact[]> {
  const fd = new FormData();
  fd.append("query", query);
  fd.append("count", String(count));
  const resp = await fetch(`${API_BASE}/api/find`, {
    method: "POST",
    body: fd,
    signal,
  });
  if (!resp.ok) throw new Error(`Search failed (${resp.status})`);
  const json = await resp.json();
  return (json.contacts ?? []) as FoundContact[];
}

function parseFrame(frame: string): StreamEvent | null {
  let event: StreamEventName | null = null;
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() as StreamEventName;
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!event) return null;
  let data: Record<string, unknown> = {};
  if (dataLines.length) {
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      data = { raw: dataLines.join("\n") };
    }
  }
  return { event, data };
}
