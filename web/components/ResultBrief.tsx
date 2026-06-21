"use client";

import type { IntelReport } from "@/lib/types";
import { CopyButton } from "./CopyButton";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function ResultBrief({
  report,
  onReset,
}: {
  report: IntelReport;
  onReset: () => void;
}) {
  const o = report.outreach;
  const emailFull = `Subject: ${o.follow_up_email_subject}\n\n${o.follow_up_email_body}`;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="glass-strong ring-glow animate-fade-up rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="accent-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white">
            {initials(report.contact_name) || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold tracking-tight text-white">
              {report.contact_name}
            </h2>
            <p className="truncate text-sm text-zinc-400">
              {report.contact_title ? `${report.contact_title} · ` : ""}
              {report.contact_company}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
              report.enrichment_used
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-zinc-400"
            }`}
          >
            {report.enrichment_used ? "● Researched" : "Public data"}
          </span>
        </div>

        {report.contact_email && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <svg className="shrink-0 text-violet-300" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <a
              href={`mailto:${report.contact_email}`}
              className="min-w-0 flex-1 truncate font-[family-name:var(--font-geist-mono)] text-xs text-zinc-200 hover:text-white"
            >
              {report.contact_email}
            </a>
            <CopyButton text={report.contact_email} label="Copy" />
          </div>
        )}
      </div>

      <Card title="Who they are" delay={1} icon={<IconUser />}>
        <p className="text-sm leading-relaxed text-zinc-300">{report.person_summary}</p>
      </Card>

      <Card title="Company" delay={2} icon={<IconBuilding />}>
        <p className="text-sm leading-relaxed text-zinc-300">{report.company_snapshot}</p>
      </Card>

      <Card title="Why follow up" delay={3} icon={<IconSpark />} accent>
        <p className="text-sm leading-relaxed text-violet-100">{report.opportunity_angle}</p>
      </Card>

      {report.top_job_matches.length > 0 && (
        <Card
          title={`Open roles · ${report.top_job_matches.length}`}
          delay={4}
          icon={<IconBriefcase />}
        >
          <div className="space-y-2.5">
            {report.top_job_matches.map((j, i) => (
              <a
                key={i}
                href={j.url}
                target="_blank"
                rel="noreferrer"
                className="group block rounded-xl border border-white/8 bg-white/[0.02] p-3.5 transition hover:border-violet-500/40 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100 group-hover:text-white">
                    {j.title}
                  </span>
                  <svg
                    className="mt-0.5 shrink-0 text-zinc-600 transition group-hover:text-violet-400"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                  >
                    <path d="M7 17 17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                  {j.location && <span>{j.location}</span>}
                  {j.location && j.ats_platform && <span className="text-zinc-700">·</span>}
                  {j.ats_platform && <span>{j.ats_platform}</span>}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{j.fit_reason}</p>
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card title="LinkedIn DM" delay={5} icon={<IconChat />} action={<CopyButton text={o.linkedin_dm} />}>
        <p className="whitespace-pre-wrap rounded-xl border border-white/8 bg-black/20 p-3.5 text-sm leading-relaxed text-zinc-200">
          {o.linkedin_dm}
        </p>
        <p className="mt-1.5 text-right font-[family-name:var(--font-geist-mono)] text-[10px] text-zinc-600">
          {o.linkedin_dm.length} / 300
        </p>
      </Card>

      <Card title="Follow-up email" delay={6} icon={<IconMail />} action={<CopyButton text={emailFull} />}>
        <div className="rounded-xl border border-white/8 bg-black/20 p-3.5">
          <p className="border-b border-white/8 pb-2 text-xs text-zinc-400">
            <span className="text-zinc-500">Subject:</span>{" "}
            <span className="font-medium text-zinc-200">{o.follow_up_email_subject}</span>
          </p>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {o.follow_up_email_body}
          </p>
        </div>
      </Card>

      {o.talking_points.length > 0 && (
        <Card title="Talking points" delay={7} icon={<IconList />}>
          <ul className="space-y-2.5">
            {o.talking_points.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                <span className="accent-gradient mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <button
        onClick={onReset}
        className="glass w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-violet-500/40 hover:text-white"
      >
        + New contact
      </button>
    </div>
  );
}

function Card({
  title,
  icon,
  action,
  accent,
  delay = 0,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  accent?: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`animate-fade-up rounded-3xl p-5 ${accent ? "glass-strong ring-glow" : "glass"}`}
      style={{ animationDelay: `${delay * 60}ms` }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={accent ? "text-violet-300" : "text-zinc-500"}>{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Icons (16px line icons) ─────────────────────────────────── */
const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none" } as const;
const st = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconUser = () => (<svg {...ic} aria-hidden><circle cx="12" cy="8" r="3.5" {...st} /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" {...st} /></svg>);
const IconBuilding = () => (<svg {...ic} aria-hidden><rect x="5" y="3" width="14" height="18" rx="1.5" {...st} /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" {...st} /></svg>);
const IconSpark = () => (<svg {...ic} aria-hidden><path d="M12 3c.3 3.5 1.8 5 5.3 5.3-3.5.3-5 1.8-5.3 5.3-.3-3.5-1.8-5-5.3-5.3C10.2 8 11.7 6.5 12 3z" {...st} /></svg>);
const IconBriefcase = () => (<svg {...ic} aria-hidden><rect x="3" y="7" width="18" height="13" rx="2" {...st} /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" {...st} /></svg>);
const IconChat = () => (<svg {...ic} aria-hidden><path d="M4 5h16v11H9l-4 3.5V16H4z" {...st} /></svg>);
const IconMail = () => (<svg {...ic} aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" {...st} /><path d="m4 7 8 6 8-6" {...st} /></svg>);
const IconList = () => (<svg {...ic} aria-hidden><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" {...st} /></svg>);
