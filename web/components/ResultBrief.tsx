"use client";

import { cn } from "@/lib/utils";
import type { IntelReport, JobMatch } from "@/lib/types";
import { CopyButton } from "./CopyButton";

type Tone = "lavender" | "peach" | "teal" | "pink" | "ochre" | "mint" | "coral" | "ink";

const CHIP: Record<Tone, string> = {
  lavender: "bg-brand-lavender text-ink",
  peach: "bg-brand-peach text-ink",
  teal: "bg-brand-teal text-white",
  pink: "bg-brand-pink text-white",
  ochre: "bg-brand-ochre text-ink",
  mint: "bg-brand-mint text-ink",
  coral: "bg-brand-coral text-white",
  ink: "bg-ink text-on-primary",
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function ResultBrief({ report, onReset }: { report: IntelReport; onReset: () => void }) {
  const o = report.outreach;
  const emailFull = `Subject: ${o.follow_up_email_subject}\n\n${o.follow_up_email_body}`;
  const mailto =
    report.contact_email &&
    `mailto:${report.contact_email}?subject=${encodeURIComponent(o.follow_up_email_subject)}&body=${encodeURIComponent(o.follow_up_email_body)}`;

  return (
    <div className="space-y-7">
      {/* Hero */}
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-hairline bg-surface-card p-6 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-xl font-semibold text-on-primary">
          {initials(report.contact_name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight text-ink">{report.contact_name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {[report.contact_title, report.contact_company].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold",
            report.enrichment_used ? "bg-brand-mint text-ink" : "bg-surface-strong text-muted",
          )}
        >
          {report.enrichment_used ? "● Researched" : "Public data"}
        </span>
      </div>

      {/* Verified email — highlighted action strip */}
      {report.contact_email && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-mint/60 bg-brand-mint/15 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Chip tone="mint"><IconMail /></Chip>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/55">Verified email</p>
              <a href={`mailto:${report.contact_email}`} className="block truncate text-base font-semibold text-ink hover:underline">
                {report.contact_email}
              </a>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CopyButton text={report.contact_email} />
            {mailto && (
              <a
                href={mailto}
                className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-on-primary transition hover:bg-body-strong"
              >
                Send email
                <IconArrow />
              </a>
            )}
          </div>
        </div>
      )}

      {/* INTEL */}
      <section className="space-y-4">
        <SectionLabel>Intel</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card tone="lavender" title="Who they are" icon={<IconUser />}>
            <p className="text-[15px] leading-relaxed text-body">{report.person_summary}</p>
          </Card>
          <Card tone="peach" title="Company" icon={<IconBuilding />}>
            <p className="text-[15px] leading-relaxed text-body">{report.company_snapshot}</p>
          </Card>
        </div>
        <Card tone="teal" title="Why follow up" icon={<IconSpark />} highlight>
          <p className="text-[15px] font-medium leading-relaxed text-ink">{report.opportunity_angle}</p>
        </Card>
      </section>

      {/* OPEN ROLES */}
      {report.top_job_matches.length > 0 && (
        <section className="space-y-4">
          <SectionLabel count={report.top_job_matches.length}>Open roles for you</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.top_job_matches.map((j, i) => (
              <JobCard key={i} job={j} />
            ))}
          </div>
        </section>
      )}

      {/* OUTREACH */}
      <section className="space-y-4">
        <SectionLabel>Outreach</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {/* Left: short pieces */}
          <div className="space-y-4">
            <Card tone="pink" title="LinkedIn DM" icon={<IconChat />} action={<CopyButton text={o.linkedin_dm} />}>
              <p className="whitespace-pre-wrap rounded-lg border border-hairline bg-canvas p-3.5 text-[15px] leading-relaxed text-body">
                {o.linkedin_dm}
              </p>
              <p className="mt-1.5 text-right text-[10px] tabular-nums text-muted-soft">{o.linkedin_dm.length} / 300</p>
            </Card>
            {o.talking_points.length > 0 && (
              <Card tone="ochre" title="Talking points" icon={<IconList />}>
                <ul className="space-y-3">
                  {o.talking_points.map((p, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-body">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink text-[10px] font-bold text-on-primary">
                        {i + 1}
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* Right: the email draft (tall) */}
          <Card tone="coral" title="Follow-up email" icon={<IconMail />} action={<CopyButton text={emailFull} />}>
            <div className="rounded-lg border border-hairline bg-canvas p-3.5">
              <p className="border-b border-hairline pb-2 text-xs text-muted">
                <span className="text-muted-soft">Subject:</span>{" "}
                <span className="font-semibold text-ink">{o.follow_up_email_subject}</span>
              </p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-body">{o.follow_up_email_body}</p>
            </div>
          </Card>
        </div>
      </section>

      <button
        onClick={onReset}
        className="w-full rounded-xl border border-hairline bg-surface-card px-4 py-3.5 text-sm font-semibold text-ink transition hover:bg-surface-strong"
      >
        ← Back to dashboard
      </button>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────── */

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2.5 px-0.5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{children}</h3>
      {count != null && (
        <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-muted">{count}</span>
      )}
      <span className="h-px flex-1 bg-hairline" aria-hidden />
    </div>
  );
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", CHIP[tone])}>{children}</span>
  );
}

function Card({
  tone,
  title,
  icon,
  action,
  highlight,
  children,
}: {
  tone: Tone;
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border p-5",
        highlight ? "border-brand-teal/25 bg-brand-teal/[0.06]" : "border-hairline bg-surface-card",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Chip tone={tone}>{icon}</Chip>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function JobCard({ job: j }: { job: JobMatch }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-surface-card p-4">
      <p className="text-[15px] font-semibold leading-snug text-ink">{j.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {j.location && <Badge>{j.location}</Badge>}
        {j.job_type && <Badge>{j.job_type}</Badge>}
        {j.ats_platform && <Badge>{j.ats_platform}</Badge>}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-body">
        <span className="font-semibold text-ink">Why it fits — </span>
        {j.fit_reason}
      </p>
      {j.description_snippet && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{j.description_snippet}…</p>
      )}
      <a
        href={j.url}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex w-fit items-center gap-1.5 pt-3 text-xs font-semibold text-ink hover:underline"
      >
        View role <IconArrow />
      </a>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-hairline">{children}</span>;
}

/* ── Icons ───────────────────────────────────────────────────── */
const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none" } as const;
const st = { stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconUser = () => (<svg {...ic} aria-hidden><circle cx="12" cy="8" r="3.5" {...st} /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" {...st} /></svg>);
const IconBuilding = () => (<svg {...ic} aria-hidden><rect x="5" y="3" width="14" height="18" rx="1.5" {...st} /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" {...st} /></svg>);
const IconSpark = () => (<svg {...ic} aria-hidden><path d="M12 3c.3 3.5 1.8 5 5.3 5.3-3.5.3-5 1.8-5.3 5.3-.3-3.5-1.8-5-5.3-5.3C10.2 8 11.7 6.5 12 3z" {...st} /></svg>);
const IconChat = () => (<svg {...ic} aria-hidden><path d="M4 5h16v11H9l-4 3.5V16H4z" {...st} /></svg>);
const IconMail = () => (<svg {...ic} aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" {...st} /><path d="m4 7 8 6 8-6" {...st} /></svg>);
const IconList = () => (<svg {...ic} aria-hidden><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...st} /></svg>);
const IconArrow = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" {...st} /></svg>);
