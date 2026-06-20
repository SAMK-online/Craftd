"use client";

import type { StageState, StageStatus } from "@/lib/types";

function Node({ status }: { status: StageStatus }) {
  const base =
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs transition-all duration-300";
  if (status === "done")
    return (
      <span className={`${base} border-emerald-500/40 bg-emerald-500/15 text-emerald-300`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "active")
    return (
      <span className={`${base} pulse-ring accent-gradient border-transparent text-white`}>
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      </span>
    );
  if (status === "warning")
    return <span className={`${base} border-amber-500/40 bg-amber-500/15 text-amber-300`}>!</span>;
  if (status === "error")
    return <span className={`${base} border-rose-500/40 bg-rose-500/15 text-rose-300`}>✕</span>;
  return <span className={`${base} border-white/10 bg-white/[0.02] text-zinc-600`}>○</span>;
}

export function ProgressStream({ stages }: { stages: StageState[] }) {
  return (
    <div className="glass-strong animate-fade-up rounded-3xl p-6">
      <div className="space-y-1">
        {stages.map((s, i) => (
          <div key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {/* connector line */}
            {i < stages.length - 1 && (
              <span
                className={`absolute left-4 top-8 h-full w-px -translate-x-1/2 ${
                  s.status === "done" ? "bg-emerald-500/30" : "bg-white/10"
                }`}
                aria-hidden
              />
            )}
            <Node status={s.status} />
            <div className="flex-1 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm font-medium ${
                    s.status === "pending" ? "text-zinc-500" : "text-zinc-100"
                  }`}
                >
                  {s.label}
                </span>
                {s.duration != null && (
                  <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-zinc-500">
                    {s.duration}s
                  </span>
                )}
              </div>
              {s.detail && (
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{s.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
