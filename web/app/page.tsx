"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { FindPeople } from "@/components/FindPeople";
import { Logo } from "@/components/Logo";
import { Onboarding } from "@/components/Onboarding";
import { ProgressStream } from "@/components/ProgressStream";
import { ResultBrief } from "@/components/ResultBrief";
import { streamGenerate } from "@/lib/api";
import { loadPersona, savePersona } from "@/lib/persona";
import type {
  GenerateInput,
  IntelReport,
  StageKey,
  StageState,
  StreamEvent,
  UserPersona,
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

type Tab = "followup" | "find";

export default function Home() {
  const [tab, setTab] = useState<Tab>("followup");
  const [phase, setPhase] = useState<Phase>("input");
  const [stages, setStages] = useState<StageState[]>([]);
  const [report, setReport] = useState<IntelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persona: loaded from localStorage on mount; onboarding shows if absent.
  const [persona, setPersona] = useState<UserPersona | null>(null);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPersona(loadPersona());
    setMounted(true);
  }, []);

  function completeOnboarding(p: UserPersona) {
    savePersona(p);
    setPersona(p);
    setEditing(false);
  }

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
      await streamGenerate(input, handleEvent, ctrl.signal, persona);
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

  // Avoid a flash before localStorage is read.
  if (!mounted) return <main className="min-h-[100dvh]" />;

  // First run (or editing) → onboarding.
  if (!persona || editing) {
    return (
      <Onboarding
        initial={editing ? persona : null}
        onDone={completeOnboarding}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-10">
      <header className="mb-9 flex flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-4 font-display-tight text-4xl text-ink">Craft&apos;ed</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted text-balance">
          Meet someone → a warm, researched follow-up before you leave the room.
        </p>
        <button
          onClick={() => setEditing(true)}
          className="mt-3 flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1 text-[11px] text-muted transition hover:text-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-coral" />
          {persona.name} · {persona.goal.replace("_", " ")}
          <span className="text-muted-soft">· edit</span>
        </button>
      </header>

      <div className="flex-1">
        {phase === "input" && (
          <div className="space-y-5">
            <div className="relative flex rounded-md border border-hairline bg-surface-card p-1">
              <span
                className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-[8px] bg-canvas shadow-sm transition-transform duration-300 ease-out"
                style={{ transform: tab === "followup" ? "translateX(0)" : "translateX(100%)" }}
                aria-hidden
              />
              {(["followup", "find"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`relative z-10 flex-1 rounded-[8px] px-4 py-2.5 text-sm font-semibold transition-colors ${
                    tab === t ? "text-ink" : "text-muted hover:text-body-strong"
                  }`}
                >
                  {t === "followup" ? "Follow up" : "Find people"}
                </button>
              ))}
            </div>
            {tab === "followup" ? (
              <CaptureForm onSubmit={run} disabled={false} />
            ) : (
              <FindPeople onPick={run} />
            )}
          </div>
        )}

        {phase === "running" && (
          <div className="space-y-5">
            <ProgressStream stages={stages} />
            <p className="text-center text-xs text-muted-soft">Usually ready in 15–20 seconds…</p>
          </div>
        )}

        {phase === "result" && report && <ResultBrief report={report} onReset={reset} />}

        {phase === "error" && (
          <div className="animate-fade-up space-y-4 rounded-xl border border-hairline bg-surface-card p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-coral text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <p className="text-sm text-body">{error}</p>
            <button
              onClick={reset}
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-body-strong"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <footer className="mt-10 text-center text-[11px] tracking-wide text-muted-soft">
        Powered by Claude · live web research · job boards
      </footer>
    </main>
  );
}
