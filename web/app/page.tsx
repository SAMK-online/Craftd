"use client";

import { useCallback, useRef, useState } from "react";
import { CaptureForm } from "@/components/CaptureForm";
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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Craft<span className="text-violet-500">&apos;</span>ed
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Meet someone → a warm, researched follow-up before you leave the room.
        </p>
      </header>

      <div className="flex-1">
        {phase === "input" && <CaptureForm onSubmit={run} />}

        {phase === "running" && (
          <div className="space-y-6">
            <ProgressStream stages={stages} />
            <p className="text-center text-xs text-zinc-600">
              This usually takes 15–20 seconds…
            </p>
          </div>
        )}

        {phase === "result" && report && (
          <ResultBrief report={report} onReset={reset} />
        )}

        {phase === "error" && (
          <div className="space-y-4 text-center">
            <p className="text-4xl">😕</p>
            <p className="text-sm text-zinc-300">{error}</p>
            <button
              onClick={reset}
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-[10px] text-zinc-700">
        Powered by Claude · Clay · live job boards
      </footer>
    </main>
  );
}
