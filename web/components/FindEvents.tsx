"use client";

import { useState } from "react";
import { findEvents } from "@/lib/api";
import type { FoundEvent } from "@/lib/types";

type FindPhase = "input" | "searching" | "results";

const TONES = ["bg-brand-lavender", "bg-brand-peach", "bg-brand-mint", "bg-brand-ochre", "bg-brand-teal", "bg-brand-pink"];

/**
 * Vertical-specific event finder. Type an industry (+ optional location) and it
 * surfaces upcoming events; pick one to jump into "Find people" pre-seeded with
 * the event page, which extracts its speakers/organizers.
 */
export function FindEvents({ onFindPeople }: { onFindPeople: (eventUrl: string) => void }) {
  const [phase, setPhase] = useState<FindPhase>("input");
  const [vertical, setVertical] = useState("");
  const [location, setLocation] = useState("");
  const [events, setEvents] = useState<FoundEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!vertical.trim()) return;
    setPhase("searching");
    setError(null);
    try {
      const found = await findEvents(vertical.trim(), location.trim() || undefined, 6);
      setEvents(found);
      setPhase("results");
    } catch (e) {
      setError((e as Error).message);
      setPhase("input");
    }
  }

  if (phase === "searching") {
    return (
      <div className="animate-fade-up rounded-xl border border-hairline bg-surface-card p-8 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-ink" />
        <p className="text-sm text-ink">Scanning the web for events…</p>
        <p className="mt-1 text-xs text-muted">Usually 5–15 seconds</p>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="animate-fade-up space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted">
            {events.length} {events.length === 1 ? "event" : "events"} for “{vertical}”
            {location.trim() ? ` · ${location.trim()}` : ""}
          </p>
          <button
            onClick={() => setPhase("input")}
            className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            New search
          </button>
        </div>

        {events.length === 0 && (
          <div className="rounded-lg border border-hairline bg-surface-card p-6 text-center text-sm text-muted">
            No events found. Try a broader vertical, or drop the location.
          </div>
        )}

        {events.map((ev, i) => {
          const tone = TONES[i % TONES.length];
          const meta = [ev.date, ev.location].filter(Boolean).join(" · ");
          return (
            <div key={i} className="rounded-lg border border-hairline bg-canvas p-3.5">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 h-9 w-1.5 shrink-0 rounded-full ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{ev.name}</p>
                  {meta && <p className="mt-0.5 text-xs text-muted">{meta}</p>}
                  {ev.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted">{ev.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-coral hover:underline"
                      >
                        Event page ↗
                      </a>
                    )}
                    {ev.url && (
                      <button
                        onClick={() => onFindPeople(ev.url as string)}
                        className="rounded-md bg-ink px-3 py-1.5 text-[11px] font-semibold text-on-primary transition hover:bg-body-strong active:scale-95"
                      >
                        Find people →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // input
  return (
    <div className="animate-fade-up space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-muted">What vertical?</span>
        <input
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="e.g. AI infrastructure · climate tech · developer tools"
          className="w-full rounded-md border border-hairline bg-canvas px-4 py-3 text-sm text-ink placeholder-muted-soft outline-none transition focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Location <span className="text-muted-soft">(optional)</span></span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="e.g. San Francisco · New York · Virtual"
          className="w-full rounded-md border border-hairline bg-canvas px-4 py-3 text-sm text-ink placeholder-muted-soft outline-none transition focus:border-ink"
        />
      </label>
      {error && <p className="text-xs text-brand-coral">{error}</p>}
      <button
        onClick={search}
        disabled={!vertical.trim()}
        className="w-full rounded-md bg-ink px-4 py-3.5 text-base font-semibold text-on-primary transition hover:bg-body-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted-soft"
      >
        Find events
      </button>
      <p className="text-center text-[11px] text-muted-soft">
        Finds upcoming events in your space. Pick one to surface its people.
      </p>
    </div>
  );
}
