"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRun, enqueueRun, getRun, listRuns } from "@/lib/api";
import { PeopleStack } from "@/components/PeopleStack";
import { ResultBrief } from "@/components/ResultBrief";
import type { IntelReport, RunStatus, RunSummary, UserPersona } from "@/lib/types";

const STATUS: Record<RunStatus, { label: string; cls: string; dot: string }> = {
  queued: { label: "Queued", cls: "bg-surface-strong text-muted", dot: "bg-muted-soft" },
  running: { label: "Researching", cls: "bg-brand-lavender text-ink", dot: "bg-ink animate-pulse" },
  ready: { label: "Ready", cls: "bg-brand-mint text-ink", dot: "bg-ink" },
  error: { label: "Failed", cls: "bg-brand-coral text-white", dot: "bg-white" },
};

const AVATAR_TONES = ["bg-brand-pink", "bg-brand-teal", "bg-brand-lavender", "bg-brand-peach", "bg-brand-ochre"];
const DARK = new Set(["bg-brand-pink", "bg-brand-teal"]);

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function Dashboard({ persona, deviceId }: { persona: UserPersona; deviceId: string }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [eventName, setEventName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<(RunSummary & { report: IntelReport | null }) | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    try {
      setRuns(await listRuns(deviceId));
    } catch {
      /* transient */
    }
  }, [deviceId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function add() {
    if (!name.trim() || !company.trim() || busy) return;
    setBusy(true);
    try {
      await enqueueRun(
        { name: name.trim(), company: company.trim(), eventName: eventName.trim() || undefined },
        deviceId,
        persona,
      );
      setName("");
      setCompany("");
      await refresh();
      nameRef.current?.focus(); // ready for the next person
    } catch {
      /* surfaced via dashboard status */
    } finally {
      setBusy(false);
    }
  }

  async function addCard(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      await enqueueRun({ cardImage: file, eventName: eventName.trim() || undefined }, deviceId, persona);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openRun(r: RunSummary) {
    if (r.status !== "ready") return;
    try {
      setOpen(await getRun(r.id, deviceId));
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    await deleteRun(id, deviceId);
    setRuns((rs) => rs.filter((r) => r.id !== id));
  }

  // Full-screen wide brief overlay (breaks out of the narrow dashboard column)
  if (open && open.report) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
        <div className="mx-auto max-w-4xl animate-fade-up px-4 py-8">
          <button
            onClick={() => setOpen(null)}
            className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 18 9 12l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          <ResultBrief report={open.report} onReset={() => setOpen(null)} />
        </div>
      </div>
    );
  }

  const ready = runs.filter((r) => r.status === "ready");
  const inProgress = runs.filter((r) => r.status === "queued" || r.status === "running");
  const failed = runs.filter((r) => r.status === "error");
  const emailCount = runs.filter((r) => r.has_email).length;

  const renderCard = (r: RunSummary, i: number) => {
    const tone = AVATAR_TONES[i % AVATAR_TONES.length];
    const s = STATUS[r.status];
    return (
      <div
        key={r.id}
        onClick={() => openRun(r)}
        className={`group flex items-center gap-3 rounded-lg border border-hairline bg-canvas p-3.5 transition ${
          r.status === "ready" ? "cursor-pointer hover:border-ink/30" : ""
        }`}
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${tone} ${DARK.has(tone) ? "text-white" : "text-ink"}`}>
          {initials(r.name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
          <p className="truncate text-xs text-muted">
            {r.company || "—"}
            {r.status === "ready" && r.jobs_found ? ` · ${r.jobs_found} role${r.jobs_found === 1 ? "" : "s"}` : ""}
            {r.status === "ready" && r.has_email ? " · ✉ email" : ""}
            {r.status === "error" && r.error ? ` · ${r.error.slice(0, 40)}` : ""}
            {r.status !== "error" && ` · ${timeAgo(r.created_at)}`}
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${s.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            remove(r.id);
          }}
          className="shrink-0 rounded-md p-1 text-muted-soft opacity-0 transition hover:text-ink group-hover:opacity-100"
          aria-label="Remove"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Quick capture */}
      <div className="animate-fade-up rounded-xl border border-hairline bg-surface-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Add contact</span>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="8" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13 10h5M13 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Snap card
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => addCard(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex gap-2">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Name"
            className="h-11 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder-muted-soft outline-none focus:border-ink"
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Company"
            className="h-11 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder-muted-soft outline-none focus:border-ink"
          />
          <button
            onClick={add}
            disabled={!name.trim() || !company.trim() || busy}
            className="h-11 shrink-0 rounded-md bg-ink px-4 text-sm font-semibold text-on-primary transition hover:bg-body-strong active:scale-95 disabled:bg-surface-strong disabled:text-muted-soft"
          >
            Add
          </button>
        </div>
        <input
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="Event (optional, stays for the session)"
          className="mt-2 h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-xs text-ink placeholder-muted-soft outline-none focus:border-ink"
        />
      </div>

      {/* Stats strip */}
      {runs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Contacts" value={runs.length} fill="bg-surface-card" />
          <Stat label="Ready" value={ready.length} fill="bg-brand-mint" />
          <Stat label="Emails" value={emailCount} fill="bg-brand-peach" />
        </div>
      )}

      {runs.length === 0 && (
        <div className="rounded-xl border border-dashed border-hairline bg-surface-card p-8 text-center">
          <p className="text-sm text-muted">Drop a name + company as you meet people.</p>
          <p className="mt-1 text-xs text-muted-soft">Briefs research in the background and land here.</p>
        </div>
      )}

      {/* Active items first (flat) */}
      {inProgress.length > 0 && (
        <Section title="In progress" count={inProgress.length}>
          {inProgress.map((r, i) => renderCard(r, i))}
        </Section>
      )}
      {failed.length > 0 && (
        <Section title="Needs attention" count={failed.length}>
          {failed.map((r, i) => renderCard(r, inProgress.length + i))}
        </Section>
      )}

      {/* Collected contacts — the deck */}
      {ready.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Your contacts</span>
            <span className="rounded-full bg-surface-strong px-1.5 text-[10px] font-semibold text-muted">{ready.length}</span>
            <span className="ml-auto text-[10px] text-muted-soft">scroll · tap a card to open</span>
          </div>
          <PeopleStack runs={ready} onOpen={openRun} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, fill }: { label: string; value: number; fill: string }) {
  return (
    <div className={`rounded-lg border border-hairline p-3 text-center ${fill}`}>
      <div className="font-display text-2xl text-ink">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{label}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</span>
        <span className="rounded-full bg-surface-strong px-1.5 text-[10px] font-semibold text-muted">{count}</span>
      </div>
      {children}
    </div>
  );
}
