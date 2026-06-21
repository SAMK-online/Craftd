"use client";

import type { IntelReport, JobMatch } from "@/lib/types";
import { CopyButton } from "./CopyButton";

type Tone = "cream" | "lavender" | "peach" | "teal" | "pink" | "ochre" | "mint";

const TONE: Record<Tone, { bg: string; text: string; sub: string }> = {
  cream: { bg: "bg-surface-card", text: "text-ink", sub: "text-muted" },
  lavender: { bg: "bg-brand-lavender", text: "text-ink", sub: "text-ink/70" },
  peach: { bg: "bg-brand-peach", text: "text-ink", sub: "text-ink/70" },
  ochre: { bg: "bg-brand-ochre", text: "text-ink", sub: "text-ink/75" },
  mint: { bg: "bg-brand-mint", text: "text-ink", sub: "text-ink/70" },
  teal: { bg: "bg-brand-teal", text: "text-white", sub: "text-white/75" },
  pink: { bg: "bg-brand-pink", text: "text-white", sub: "text-white/80" },
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function ResultBrief({ report, onReset }: { report: IntelReport; onReset: () => void }) {
  const o = report.outreach;
  const emailFull = `Subject: ${o.follow_up_email_subject}\n\n${o.follow_up_email_body}`;

  return (
    <div className="space-y-5">
      {/* Hero (cream) */}
      <div className="animate-fade-up rounded-xl border border-hairline bg-surface-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-ink text-xl font-semibold text-on-primary">
            {initials(report.contact_name) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl leading-tight text-ink">{report.contact_name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {report.contact_title ? `${report.contact_title} · ` : ""}
              {report.contact_company}
            </p>
            <span
              className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                report.enrichment_used ? "bg-brand-mint text-ink" : "bg-surface-strong text-muted"
              }`}
            >
              {report.enrichment_used ? "● Researched" : "Public data"}
            </span>
          </div>
        </div>
      </div>

      {/* Verified email — explicit, actionable card */}
      {report.contact_email && (
        <Card tone="mint" title="Verified email" delay={1} icon={<IconMail />} action={<CopyButton text={report.contact_email} />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              href={`mailto:${report.contact_email}`}
              className="min-w-0 flex-1 truncate text-base font-semibold text-ink hover:underline"
            >
              {report.contact_email}
            </a>
            <a
              href={`mailto:${report.contact_email}?subject=${encodeURIComponent(o.follow_up_email_subject)}&body=${encodeURIComponent(o.follow_up_email_body)}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-on-primary transition hover:bg-body-strong"
            >
              Send email
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* Left column — the intel */}
        <div className="space-y-5">
          <Card tone="lavender" title="Who they are" delay={1} icon={<IconUser />}>
            <p className="text-[15px] leading-relaxed">{report.person_summary}</p>
          </Card>

          <Card tone="peach" title="Company" delay={2} icon={<IconBuilding />}>
            <p className="text-[15px] leading-relaxed">{report.company_snapshot}</p>
          </Card>

          <Card tone="teal" title="Why follow up" delay={3} icon={<IconSpark />}>
            <p className="text-[15px] leading-relaxed">{report.opportunity_angle}</p>
          </Card>

          {report.top_job_matches.length > 0 && (
            <Card tone="cream" title={`Open roles · ${report.top_job_matches.length}`} delay={4} icon={<IconBriefcase />}>
              <div className="space-y-3">
                {report.top_job_matches.map((j, i) => (
                  <JobCard key={i} job={j} />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column — the outreach */}
        <div className="space-y-5">
          <Card tone="pink" title="LinkedIn DM" delay={2} icon={<IconChat />} action={<CopyButton text={o.linkedin_dm} onColor />}>
            <p className="whitespace-pre-wrap rounded-md bg-white/15 p-4 text-[15px] leading-relaxed">{o.linkedin_dm}</p>
            <p className="mt-1.5 text-right text-[10px] tabular-nums text-white/70">{o.linkedin_dm.length} / 300</p>
          </Card>

          <Card tone="cream" title="Follow-up email" delay={3} icon={<IconMail />} action={<CopyButton text={emailFull} />}>
            <div className="rounded-md border border-hairline bg-canvas p-4">
              <p className="border-b border-hairline pb-2 text-xs text-muted">
                <span className="text-muted-soft">Subject:</span>{" "}
                <span className="font-semibold text-ink">{o.follow_up_email_subject}</span>
              </p>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-body">{o.follow_up_email_body}</p>
            </div>
          </Card>

          {o.talking_points.length > 0 && (
            <Card tone="ochre" title="Talking points" delay={4} icon={<IconList />}>
              <ul className="space-y-3">
                {o.talking_points.map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-ink text-[10px] font-bold text-on-primary">
                      {i + 1}
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full rounded-md border border-hairline bg-canvas px-4 py-3.5 text-sm font-semibold text-ink transition hover:bg-surface-card"
      >
        ← Back to dashboard
      </button>
    </div>
  );
}

function JobCard({ job: j }: { job: JobMatch }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
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
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">{j.description_snippet}…</p>
      )}
      <a
        href={j.url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-on-primary transition hover:bg-body-strong"
      >
        View role
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M7 17 17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface-card px-2 py-0.5 text-[10px] font-medium text-muted">{children}</span>
  );
}

function Card({
  tone,
  title,
  icon,
  action,
  delay = 0,
  children,
}: {
  tone: Tone;
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  delay?: number;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section
      className={`animate-fade-up rounded-xl p-6 ${t.bg} ${t.text} ${tone === "cream" ? "border border-hairline" : ""}`}
      style={{ animationDelay: `${delay * 55}ms` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={`flex items-center gap-2 ${t.sub}`}>
          {icon}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Icons ───────────────────────────────────────────────────── */
const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none" } as const;
const st = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconUser = () => (<svg {...ic} aria-hidden><circle cx="12" cy="8" r="3.5" {...st} /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" {...st} /></svg>);
const IconBuilding = () => (<svg {...ic} aria-hidden><rect x="5" y="3" width="14" height="18" rx="1.5" {...st} /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" {...st} /></svg>);
const IconSpark = () => (<svg {...ic} aria-hidden><path d="M12 3c.3 3.5 1.8 5 5.3 5.3-3.5.3-5 1.8-5.3 5.3-.3-3.5-1.8-5-5.3-5.3C10.2 8 11.7 6.5 12 3z" {...st} /></svg>);
const IconBriefcase = () => (<svg {...ic} aria-hidden><rect x="3" y="7" width="18" height="13" rx="2" {...st} /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...st} /></svg>);
const IconChat = () => (<svg {...ic} aria-hidden><path d="M4 5h16v11H9l-4 3.5V16H4z" {...st} /></svg>);
const IconMail = () => (<svg {...ic} aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" {...st} /><path d="m4 7 8 6 8-6" {...st} /></svg>);
const IconList = () => (<svg {...ic} aria-hidden><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...st} /></svg>);
