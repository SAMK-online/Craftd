"use client";

import {
  CardTransformed,
  CardsContainer,
  ContainerScroll,
} from "@/components/ui/animated-cards-stack";
import type { RunSummary } from "@/lib/types";

const AVATAR_TONES = ["bg-brand-pink", "bg-brand-teal", "bg-brand-lavender", "bg-brand-peach", "bg-brand-ochre"];
const DARK = new Set(["bg-brand-pink", "bg-brand-teal"]);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function PeopleStack({
  runs,
  onOpen,
}: {
  runs: RunSummary[];
  onOpen: (r: RunSummary) => void;
}) {
  const n = runs.length;
  // Enough scroll room to fan the deck, capped so it isn't endless.
  const heightVh = Math.min(110 + n * 40, 300);

  return (
    <ContainerScroll style={{ height: `${heightVh}vh` }}>
      <div className="sticky top-6 flex h-[62vh] w-full items-start justify-center">
        <CardsContainer className="h-[250px] w-full max-w-[360px]">
          {runs.map((r, index) => {
            const tone = AVATAR_TONES[index % AVATAR_TONES.length];
            return (
              <CardTransformed
                key={r.id}
                arrayLength={n}
                index={index + 2}
                onClick={() => onOpen(r)}
                role="button"
                aria-label={`Open brief for ${r.name}`}
                className="!items-stretch !justify-start !gap-0 cursor-pointer rounded-xl border border-hairline bg-surface-card p-5 text-ink"
              >
                <div className="flex h-full w-full flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-semibold ${tone} ${
                        DARK.has(tone) ? "text-white" : "text-ink"
                      }`}
                    >
                      {initials(r.name) || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg text-ink">{r.name}</p>
                      <p className="truncate text-sm text-muted">
                        {[r.title, r.company].filter(Boolean).join(" · ") || r.company}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {r.enrichment_used && <Chip className="bg-brand-mint">● Researched</Chip>}
                    {!!r.jobs_found && (
                      <Chip className="bg-canvas border border-hairline text-muted">
                        {r.jobs_found} role{r.jobs_found === 1 ? "" : "s"}
                      </Chip>
                    )}
                    {r.has_email && (
                      <Chip className="bg-canvas border border-hairline text-muted">✉ email</Chip>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-hairline pt-3">
                    <span className="text-xs text-muted-soft">{r.event_name || "Contact"}</span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-ink">
                      Open brief
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
              </CardTransformed>
            );
          })}
        </CardsContainer>
      </div>
    </ContainerScroll>
  );
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-ink ${className}`}>
      {children}
    </span>
  );
}
