"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { RunStatus, RunSummary } from "@/lib/types";

const STATUS: Record<RunStatus, { label: string; cls: string; dot: string }> = {
  queued: { label: "Queued", cls: "bg-surface-strong text-muted", dot: "bg-muted-soft" },
  running: { label: "Researching", cls: "bg-brand-lavender text-ink", dot: "bg-ink animate-pulse" },
  ready: { label: "Ready", cls: "bg-brand-mint text-ink", dot: "bg-ink" },
  error: { label: "Failed", cls: "bg-brand-coral text-white", dot: "bg-white" },
};

const AVATAR_TONES = ["bg-brand-pink", "bg-brand-teal", "bg-brand-lavender", "bg-brand-peach", "bg-brand-ochre"];
const DARK = new Set(["bg-brand-pink", "bg-brand-teal"]);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}
function timeAgo(ts?: number) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function ContactsGrid({
  runs,
  onOpen,
  onRemove,
  maxDisplayed = 6,
}: {
  runs: RunSummary[];
  onOpen: (r: RunSummary) => void;
  onRemove: (id: string) => void;
  maxDisplayed?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? runs : runs.slice(0, maxDisplayed);

  return (
    <div className="relative">
      <div
        className={cn(
          "flex flex-wrap justify-center gap-4",
          !showAll && runs.length > maxDisplayed && "max-h-[640px] overflow-hidden",
        )}
      >
        {shown.map((r, i) => {
          const tone = AVATAR_TONES[i % AVATAR_TONES.length];
          const s = STATUS[r.status];
          const ready = r.status === "ready";
          return (
            <div
              key={r.id}
              onClick={() => ready && onOpen(r)}
              className={cn(
                "group relative w-full rounded-xl border border-hairline bg-surface-card p-5 transition sm:w-[300px]",
                ready ? "cursor-pointer hover:border-ink/25" : "",
              )}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(r.id);
                }}
                className="absolute right-3 top-3 rounded-md p-1 text-muted-soft opacity-0 transition hover:text-ink group-hover:opacity-100"
                aria-label="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div className="flex items-center gap-3 pr-5">
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-semibold", tone, DARK.has(tone) ? "text-white" : "text-ink")}>
                  {initials(r.name) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg text-ink">{r.name}</p>
                  <p className="truncate text-sm text-muted">
                    {[r.title, r.company].filter(Boolean).join(" · ") || r.company || "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold", s.cls)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                  {s.label}
                </span>
                {ready && !!r.jobs_found && (
                  <span className="rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                    {r.jobs_found} role{r.jobs_found === 1 ? "" : "s"}
                  </span>
                )}
                {ready && r.has_email && (
                  <span className="rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                    ✉ email
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                <span className="truncate text-[11px] text-muted-soft">
                  {r.event_name || timeAgo(r.created_at) || "Contact"}
                </span>
                {ready ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink">
                    Open brief
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                ) : r.status === "error" && r.error ? (
                  <span className="truncate text-[11px] text-brand-coral">{r.error.slice(0, 28)}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {runs.length > maxDisplayed && !showAll && (
        <>
          <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-gradient-to-t from-canvas to-transparent" />
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <button
              onClick={() => setShowAll(true)}
              className="rounded-md border border-hairline bg-canvas px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-surface-card"
            >
              Load more ({runs.length - maxDisplayed})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
