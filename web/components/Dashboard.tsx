"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRun, enqueueRun, getRun, listRuns } from "@/lib/api";
import { ContactsGrid } from "@/components/ContactsGrid";
import { ResultBrief } from "@/components/ResultBrief";
import type { IntelReport, RunSummary, UserPersona } from "@/lib/types";

export function Dashboard({ persona, deviceId }: { persona: UserPersona; deviceId: string }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [eventName, setEventName] = useState("");
  const [context, setContext] = useState("");
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
        {
          name: name.trim(),
          company: company.trim(),
          eventName: eventName.trim() || undefined,
          context: context.trim() || undefined,
        },
        deviceId,
        persona,
      );
      setName("");
      setCompany("");
      setContext("");
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

  const readyCount = runs.filter((r) => r.status === "ready").length;
  const emailCount = runs.filter((r) => r.has_email).length;

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
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          placeholder="Context / notes (optional) — e.g. hiring an FDE; we talked about RAG eval"
          className="mt-2 w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder-muted-soft outline-none focus:border-ink"
        />
      </div>

      {/* Stats strip */}
      {runs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Contacts" value={runs.length} fill="bg-surface-card" />
          <Stat label="Ready" value={readyCount} fill="bg-brand-mint" />
          <Stat label="Emails" value={emailCount} fill="bg-brand-peach" />
        </div>
      )}

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline bg-surface-card p-8 text-center">
          <p className="text-sm text-muted">Drop a name + company as you meet people.</p>
          <p className="mt-1 text-xs text-muted-soft">Briefs research in the background and land here.</p>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Your contacts</span>
            <span className="rounded-full bg-surface-strong px-1.5 text-[10px] font-semibold text-muted">{runs.length}</span>
            <span className="ml-auto text-[10px] text-muted-soft">tap a ready card to open</span>
          </div>
          <ContactsGrid runs={runs} onOpen={openRun} onRemove={remove} />
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
