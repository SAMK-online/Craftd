"use client";

import { useState } from "react";
import { findPeople } from "@/lib/api";
import type { FoundContact, GenerateInput } from "@/lib/types";

type FindPhase = "input" | "searching" | "results";

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
      <div className="glass-strong animate-fade-up rounded-3xl p-8 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
        <p className="text-sm text-zinc-300">Searching the web for people…</p>
        <p className="mt-1 text-xs text-zinc-600">Usually 5–15 seconds</p>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="animate-fade-up space-y-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-zinc-500">
            {contacts.length} {contacts.length === 1 ? "person" : "people"} for “{query}”
          </p>
          <button
            onClick={() => setPhase("input")}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            New search
          </button>
        </div>

        {contacts.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-sm text-zinc-400">
            No people found. Try a more specific search (role + company).
          </div>
        )}

        {contacts.map((c, i) => (
          <div
            key={i}
            className="glass flex items-center gap-3 rounded-2xl p-3.5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="accent-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white">
              {c.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-100">{c.name}</p>
              <p className="truncate text-xs text-zinc-500">
                {[c.title, c.company].filter(Boolean).join(" · ") || "—"}
              </p>
              {c.linkedin_url && (
                <a
                  href={c.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-violet-400/80 hover:text-violet-300"
                >
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
                })
              }
              disabled={!c.company}
              title={c.company ? "" : "No company found — can't craft a brief"}
              className="accent-gradient shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40"
            >
              Craft →
            </button>
          </div>
        ))}
      </div>
    );
  }

  // input
  return (
    <div className="animate-fade-up space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">
          Who are you looking for?
        </span>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search();
          }}
          rows={3}
          placeholder="e.g. Solutions Engineers at Anthropic — or — Heads of Growth at Series B fintechs"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-500/20"
        />
      </label>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        onClick={search}
        disabled={!query.trim()}
        className="accent-gradient ring-glow w-full rounded-2xl px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        Find people
      </button>
      <p className="text-center text-[11px] text-zinc-600">
        Searches the web for matching profiles. Pick one to craft a follow-up.
      </p>
    </div>
  );
}
