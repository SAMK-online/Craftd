"use client";

import type { StageState } from "@/lib/types";

const ICON: Record<StageState["status"], string> = {
  pending: "○",
  active: "◐",
  done: "✓",
  warning: "▲",
  error: "✕",
};

const COLOR: Record<StageState["status"], string> = {
  pending: "text-zinc-600",
  active: "text-violet-400 animate-pulse",
  done: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-rose-400",
};

export function ProgressStream({ stages }: { stages: StageState[] }) {
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.key} className="flex items-start gap-3">
          <span className={`mt-0.5 w-5 text-center text-lg ${COLOR[s.status]}`}>
            {ICON[s.status]}
          </span>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-medium ${
                  s.status === "pending" ? "text-zinc-500" : "text-zinc-100"
                }`}
              >
                {s.label}
              </span>
              {s.duration != null && (
                <span className="text-xs text-zinc-500">{s.duration}s</span>
              )}
            </div>
            {s.detail && (
              <p className="mt-0.5 text-xs text-zinc-500">{s.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
