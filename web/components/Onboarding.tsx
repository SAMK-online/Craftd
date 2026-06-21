"use client";

import { useRef, useState } from "react";
import { parseResume } from "@/lib/api";
import { Logo } from "@/components/Logo";
import type { UserGoal, UserPersona } from "@/lib/types";

const GOALS: { value: UserGoal; label: string; hint: string }[] = [
  { value: "internship", label: "Internship", hint: "Find intern / new-grad roles" },
  { value: "full_time", label: "Full-time", hint: "Land a full-time role" },
  { value: "collaboration", label: "Collaboration", hint: "Partner or build together" },
  { value: "mentorship", label: "Mentorship", hint: "Seek advice & guidance" },
];

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
      ? {
          resume_summary: initial.resume_summary,
          skills: initial.skills ?? [],
          target_roles: initial.target_roles ?? [],
        }
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
      const profile = await parseResume(file, goal);
      setParsed(profile);
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
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
          {initial ? "Edit your profile" : "Welcome to Craft'ed"}
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500 text-balance">
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
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">What are you looking for?</span>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={`rounded-xl border p-3 text-left transition ${
                  goal === g.value
                    ? "border-violet-500/60 bg-violet-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className="block text-sm font-semibold text-zinc-100">{g.label}</span>
                <span className="block text-[11px] text-zinc-500">{g.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">
            Resume <span className="text-zinc-600">· optional, sharpens everything</span>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleResume(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="glass flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition hover:border-violet-500/40"
          >
            <span className="accent-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-zinc-200">
                {resume ? resume.name : "Upload resume (PDF)"}
              </span>
              <span className="block text-[11px] text-zinc-500">
                {busy ? "Reading your resume…" : parsed ? "Parsed ✓" : "Claude extracts your skills & target roles"}
              </span>
            </span>
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />}
          </button>

          {parsed && (
            <div className="mt-2 rounded-xl border border-white/8 bg-black/20 p-3">
              <p className="text-xs leading-relaxed text-zinc-400">{parsed.resume_summary}</p>
              {parsed.target_roles.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {parsed.target_roles.slice(0, 8).map((r, i) => (
                    <span key={i} className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <button
          onClick={finish}
          disabled={!canFinish || busy}
          className="accent-gradient ring-glow w-full rounded-2xl px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {initial ? "Save profile" : "Start crafting"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300">
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
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
        {label}
        {required && <span className="text-violet-400">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-500/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-500/20"
      />
    </label>
  );
}
