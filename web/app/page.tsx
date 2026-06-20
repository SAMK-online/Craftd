"use client";

import { useCallback, useRef, useState } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { Logo } from "@/components/Logo";
import { ProgressStream } from "@/components/ProgressStream";
import { ResultBrief } from "@/components/ResultBrief";
import { streamGenerate } from "@/lib/api";
import type {
  GenerateInput,
  IntelReport,
  StageKey,
  StageState,
  StreamEvent,
} from "@/lib/types";

type Phase = "input" | "running" | "result" | "error";

const STAGE_LABELS: Record<StageKey, string> = {
  ocr: "Reading the card",
  enrich_and_jobs: "Researching & scanning jobs",
  report: "Crafting your follow-up",
};

// Backend emits a "enrichment" warning under the combined stage.
function normalizeStage(stage: string): StageKey | null {
  if (stage === "enrichment") return "enrich_and_jobs";
  if (stage === "ocr" || stage === "enrich_and_jobs" || stage === "report") {
    return stage;
  }
  return null;
}

function initialStages(hasCard: boolean): StageState[] {
  const keys: StageKey[] = hasCard
    ? ["ocr", "enrich_and_jobs", "report"]
    : ["enrich_and_jobs", "report"];
  return keys.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    status: "pending",
  }));
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("input");
  const [stages, setStages] = useState<StageState[]>([]);
  const [report, setReport] = useState<IntelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patchStage = useCallback((key: StageKey, patch: Partial<StageState>) => {
    setStages((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const handleEvent = useCallback(
    (evt: StreamEvent) => {
      const stage = normalizeStage(String(evt.data.stage ?? ""));
      switch (evt.event) {
        case "stage_start":
          if (stage)
            patchStage(stage, {
              status: "active",
              detail: String(evt.data.message ?? ""),
            });
          break;
        case "stage_complete": {
          if (!stage) break;
          const d = evt.data.data as Record<string, unknown> | undefined;
          let detail: string | undefined;
          if (stage === "enrich_and_jobs" && d) {
            const jobs = Number(d.jobs_found ?? 0);
            detail = `${jobs} matching role${jobs === 1 ? "" : "s"} found`;
          } else if (stage === "ocr" && d) {
            detail = [d.name, d.company].filter(Boolean).join(" · ") || undefined;
          }
          patchStage(stage, {
            status: "done",
            duration: evt.data.duration as number | undefined,
            detail,
          });
          break;
        }
        case "stage_warning":
          if (stage)
            patchStage(stage, {
              status: "warning",
              detail: String(evt.data.message ?? ""),
            });
          break;
        case "stage_error":
          if (stage)
            patchStage(stage, {
              status: "error",
              detail: String(evt.data.error ?? ""),
            });
          break;
        case "done":
          setReport(evt.data.report as IntelReport);
          setPhase("result");
          break;
        case "error":
          setError(String(evt.data.message ?? "Something went wrong"));
          setPhase("error");
          break;
      }
    },
    [patchStage],
  );

  async function run(input: GenerateInput) {
    const hasCard = !!input.cardImage;
    setStages(initialStages(hasCard));
    setReport(null);
    setError(null);
    setPhase("running");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamGenerate(input, handleEvent, ctrl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      setPhase("error");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setPhase("input");
    setReport(null);
    setError(null);
    setStages([]);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-10">
      <header className="mb-9 flex flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
          Craft<span className="text-gradient">&apos;</span>ed
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500 text-balance">
          Meet someone → a warm, researched follow-up before you leave the room.
        </p>
      </header>

      <div className="flex-1">
        {phase === "input" && <CaptureForm onSubmit={run} disabled={false} />}

        {phase === "running" && (
          <div className="space-y-5">
            <ProgressStream stages={stages} />
            <p className="text-center text-xs text-zinc-600">
              Usually ready in 15–20 seconds…
            </p>
          </div>
        )}

        {phase === "result" && report && <ResultBrief report={report} onReset={reset} />}

        {phase === "error" && (
          <div className="glass animate-fade-up space-y-4 rounded-3xl p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <p className="text-sm text-zinc-300">{error}</p>
            <button
              onClick={reset}
              className="accent-gradient rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <footer className="mt-10 text-center text-[10px] tracking-wide text-zinc-700">
        Powered by Claude · live web research · job boards
      </footer>
    </main>
  );
}
