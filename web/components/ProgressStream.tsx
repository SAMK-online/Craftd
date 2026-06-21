"use client";

import type { StageState, StageStatus } from "@/lib/types";

function Node({ status }: { status: StageStatus }) {
  const base =
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs transition-all duration-300";
  if (status === "done")
    return (
      <span className={`${base} border-transparent bg-brand-mint text-ink`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "active")
    return (
      <span className={`${base} border-transparent bg-ink text-on-primary`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-on-primary" />
      </span>
    );
  if (status === "warning")
    return <span className={`${base} border-transparent bg-brand-ochre text-ink`}>!</span>;
  if (status === "error")
    return <span className={`${base} border-transparent bg-brand-coral text-white`}>✕</span>;
  return <span className={`${base} border-hairline bg-canvas text-muted-soft`}>○</span>;
}

export function ProgressStream({ stages }: { stages: StageState[] }) {
  return (
    <div className="animate-fade-up rounded-lg border border-hairline bg-surface-card p-6">
      <div className="space-y-1">
        {stages.map((s, i) => (
          <div key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 && (
              <span
                className={`absolute left-4 top-8 h-full w-px -translate-x-1/2 ${
                  s.status === "done" ? "bg-brand-mint" : "bg-hairline"
                }`}
                aria-hidden
              />
            )}
            <Node status={s.status} />
            <div className="flex-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${s.status === "pending" ? "text-muted-soft" : "text-ink"}`}>
                  {s.label}
                </span>
                {s.duration != null && (
                  <span className="text-[11px] tabular-nums text-muted-soft">{s.duration}s</span>
                )}
              </div>
              {s.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
