"use client";

import { useState } from "react";
import { findPeople } from "@/lib/api";
import type { FoundContact, GenerateInput } from "@/lib/types";

type FindPhase = "input" | "searching" | "results";

const AVATAR_TONES = ["bg-brand-pink", "bg-brand-teal", "bg-brand-lavender", "bg-brand-peach", "bg-brand-ochre", "bg-brand-mint"];
const DARK_TONES = new Set(["bg-brand-pink", "bg-brand-teal"]);

export function FindPeople({ onPick }: { onPick: (input: GenerateInput) => void }) {
  const [phase, setPhase] = useState<FindPhase>("input");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<FoundContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setPhase("searching");
    setError(null);
    try {
      const found = await findPeople(query.trim(), 6);
      setContacts(found);
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
        <p className="text-sm text-ink">Searching the web for people…</p>
        <p className="mt-1 text-xs text-muted">Usually 5–15 seconds</p>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="animate-fade-up space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted">
            {contacts.length} {contacts.length === 1 ? "person" : "people"} for “{query}”
          </p>
          <button
            onClick={() => setPhase("input")}
            className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            New search
          </button>
        </div>

        {contacts.length === 0 && (
          <div className="rounded-lg border border-hairline bg-surface-card p-6 text-center text-sm text-muted">
            No people found. Try a more specific search (role + company).
          </div>
        )}

        {contacts.map((c, i) => {
          const tone = AVATAR_TONES[i % AVATAR_TONES.length];
          return (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-hairline bg-canvas p-3.5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${tone} ${DARK_TONES.has(tone) ? "text-white" : "text-ink"}`}>
                {c.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  {[c.title, c.company].filter(Boolean).join(" · ") || "—"}
                </p>
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-coral hover:underline">
                    LinkedIn ↗
                  </a>
                )}
              </div>
              <button
                onClick={() =>
                  onPick({
                    name: c.name,
                    company: c.company ?? undefined,
                    title: c.title ?? undefined,
                    // For an event-link search, pass the source as context so a
                    // name-only contact still gets a grounded follow-up.
                    context: /^https?:\/\//.test(query) ? `Found via event page: ${query}` : undefined,
                  })
                }
                className="shrink-0 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-on-primary transition hover:bg-body-strong active:scale-95"
              >
                Craft →
              </button>
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
        <span className="mb-1.5 block text-xs font-semibold text-muted">Who are you looking for?</span>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search();
          }}
          rows={3}
          placeholder="e.g. Solutions Engineers at Anthropic · Heads of Growth at Series B fintechs · or paste an event link (lu.ma/…)"
          className="w-full resize-none rounded-md border border-hairline bg-canvas px-4 py-3 text-sm text-ink placeholder-muted-soft outline-none transition focus:border-ink"
        />
      </label>
      {error && <p className="text-xs text-brand-coral">{error}</p>}
      <button
        onClick={search}
        disabled={!query.trim()}
        className="w-full rounded-md bg-ink px-4 py-3.5 text-base font-semibold text-on-primary transition hover:bg-body-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted-soft"
      >
        Find people
      </button>
      <p className="text-center text-[11px] text-muted-soft">
        Searches the web for matching profiles. Pick one to craft a follow-up.
      </p>
    </div>
  );
}
