"use client";

import { useRef, useState } from "react";
import { parseResume } from "@/lib/api";
import { Logo } from "@/components/Logo";
import type { UserGoal, UserPersona } from "@/lib/types";

const GOALS: { value: UserGoal; label: string; hint: string }[] = [
  { value: "internship", label: "Internship", hint: "Intern / new-grad roles" },
  { value: "full_time", label: "Full-time", hint: "Land a full-time role" },
  { value: "collaboration", label: "Collaboration", hint: "Partner or build together" },
  { value: "mentorship", label: "Mentorship", hint: "Seek advice & guidance" },
];

const GOAL_FILL: Record<UserGoal, string> = {
  internship: "bg-brand-peach",
  full_time: "bg-brand-lavender",
  collaboration: "bg-brand-mint",
  mentorship: "bg-brand-ochre",
};

export function Onboarding({
  initial,
  onDone,
  onCancel,
}: {
  initial?: UserPersona | null;
  onDone: (p: UserPersona) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [goal, setGoal] = useState<UserGoal>(initial?.goal ?? "full_time");
  const [resume, setResume] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{
    resume_summary: string;
    skills: string[];
    target_roles: string[];
  } | null>(
    initial?.resume_summary
      ? { resume_summary: initial.resume_summary, skills: initial.skills ?? [], target_roles: initial.target_roles ?? [] }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleResume(file: File | null) {
    setResume(file);
    setParsed(null);
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      setParsed(await parseResume(file, goal));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (!name.trim() || !position.trim()) return;
    onDone({
      name: name.trim(),
      position: position.trim(),
      goal,
      resume_summary: parsed?.resume_summary ?? null,
      skills: parsed?.skills ?? [],
      target_roles: parsed?.target_roles ?? [],
    });
  }

  const canFinish = name.trim() !== "" && position.trim() !== "";

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-10">
      <header className="mb-8 flex flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-4 font-display text-3xl text-ink">
          {initial ? "Edit your profile" : "Welcome to Craft'ed"}
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted text-balance">
          Tell us about you — every brief, DM, and job match is tailored to your goal.
        </p>
      </header>

      <div className="animate-fade-up flex-1 space-y-5">
        <Field label="Your name" required value={name} onChange={setName} placeholder="Jordan Lee" />
        <Field
          label="Where you're at"
          required
          value={position}
          onChange={setPosition}
          placeholder="CS senior at GMU · 2nd-year PM · bootcamp grad"
        />

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted">What are you looking for?</span>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => {
              const active = goal === g.value;
              return (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={`rounded-lg border p-3 text-left transition ${
                    active ? `${GOAL_FILL[g.value]} border-ink` : "border-hairline bg-canvas hover:border-ink/30"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">{g.label}</span>
                  <span className={`block text-[11px] ${active ? "text-ink/70" : "text-muted"}`}>{g.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted">
            Resume <span className="font-normal text-muted-soft">· optional, sharpens everything</span>
          </span>
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => handleResume(e.target.files?.[0] ?? null)} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-md border border-hairline bg-canvas p-3.5 text-left transition hover:border-ink/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-coral text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{resume ? resume.name : "Upload resume (PDF)"}</span>
              <span className="block text-[11px] text-muted">
                {busy ? "Reading your resume…" : parsed ? "Parsed ✓" : "Claude extracts your skills & target roles"}
              </span>
            </span>
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-ink" />}
          </button>

          {parsed && (
            <div className="mt-2 rounded-md border border-hairline bg-surface-card p-3">
              <p className="text-xs leading-relaxed text-body">{parsed.resume_summary}</p>
              {parsed.target_roles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parsed.target_roles.slice(0, 8).map((r, i) => (
                    <span key={i} className="rounded-full bg-brand-lavender px-2 py-0.5 text-[10px] font-medium text-ink">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-1 text-xs text-brand-coral">{error}</p>}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={finish}
          disabled={!canFinish || busy}
          className="w-full rounded-md bg-ink px-4 py-3.5 text-base font-semibold text-on-primary transition hover:bg-body-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted-soft"
        >
          {initial ? "Save profile" : "Start crafting"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="w-full py-2 text-xs text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted">
        {label}
        {required && <span className="text-brand-pink">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-hairline bg-canvas px-4 text-sm text-ink placeholder-muted-soft outline-none transition focus:border-ink"
      />
    </label>
  );
}
