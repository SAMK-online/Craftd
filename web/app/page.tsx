"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { FindPeople } from "@/components/FindPeople";
import { Logo } from "@/components/Logo";
import { Onboarding } from "@/components/Onboarding";
import { enqueueRun, getServerPersona, saveServerPersona } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import { loadPersona, savePersona } from "@/lib/persona";
import type { GenerateInput, UserPersona } from "@/lib/types";

type Tab = "event" | "find";

export default function Home() {
  const [persona, setPersona] = useState<UserPersona | null>(null);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("event");
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    (async () => {
      // Prefer the DB-saved persona; fall back to a local cache.
      const server = await getServerPersona(id);
      const local = loadPersona();
      const p = server ?? local;
      if (p) {
        setPersona(p);
        savePersona(p); // keep a local cache in sync
        // Migrate a pre-existing local persona into the DB so it persists.
        if (!server) saveServerPersona(id, p);
      }
      setMounted(true);
    })();
  }, []);

  function completeOnboarding(p: UserPersona) {
    savePersona(p);
    if (deviceId) saveServerPersona(deviceId, p);
    setPersona(p);
    setEditing(false);
  }

  // From "Find people": queue the chosen contact, then jump to the dashboard.
  async function pickFromSearch(input: GenerateInput) {
    if (!persona || !deviceId) return;
    try {
      await enqueueRun(input, deviceId, persona);
    } catch {
      /* surfaced on the dashboard */
    }
    setTab("event");
  }

  if (!mounted) return <main className="min-h-[100dvh]" />;

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
      <header className="mb-7 flex flex-col items-center text-center">
        <Logo size={44} />
        <h1 className="mt-4 font-display-tight text-4xl text-ink">Craft&apos;ed</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted text-balance">
          Drop a name as you meet people — briefs research in the background and land on your dashboard.
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

      <div className="mb-5 flex rounded-md border border-hairline bg-surface-card p-1">
        {(["event", "find"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-[8px] px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-body-strong"
            }`}
          >
            {t === "event" ? "Dashboard" : "Find people"}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {tab === "event" ? (
          <Dashboard persona={persona} deviceId={deviceId} />
        ) : (
          <FindPeople onPick={pickFromSearch} />
        )}
      </div>

      <footer className="mt-10 text-center text-[11px] tracking-wide text-muted-soft">
        Powered by Claude · live web research · job boards
      </footer>
    </main>
  );
}
