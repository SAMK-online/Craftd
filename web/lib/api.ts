import type { GenerateInput, StreamEvent, StreamEventName } from "./types";

// Base URL of the FastAPI backend. Override via NEXT_PUBLIC_API_URL.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

function buildFormData(input: GenerateInput): FormData {
  const fd = new FormData();
  if (input.name) fd.append("name", input.name);
  if (input.company) fd.append("company", input.company);
  if (input.title) fd.append("title", input.title);
  if (input.eventName) fd.append("event_name", input.eventName);
  if (input.cardImage) fd.append("card_image", input.cardImage);
  return fd;
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
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/generate/stream`, {
    method: "POST",
    body: buildFormData(input),
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
