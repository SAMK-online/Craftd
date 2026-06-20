"use client";

import type { IntelReport } from "@/lib/types";
import { CopyButton } from "./CopyButton";

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{report.contact_name}</h2>
          <p className="text-sm text-zinc-400">
            {report.contact_title ? `${report.contact_title} · ` : ""}
            {report.contact_company}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
            report.enrichment_used
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-zinc-700/40 text-zinc-400"
          }`}
        >
          {report.enrichment_used ? "Enriched" : "Public data"}
        </span>
      </div>

      <Section title="Who they are">
        <p className="text-sm leading-relaxed text-zinc-300">{report.person_summary}</p>
      </Section>

      <Section title="Company">
        <p className="text-sm leading-relaxed text-zinc-300">{report.company_snapshot}</p>
      </Section>

      <Section title="Why follow up">
        <p className="text-sm leading-relaxed text-violet-200">
          {report.opportunity_angle}
        </p>
      </Section>

      {report.top_job_matches.length > 0 && (
        <Section title={`Open roles (${report.top_job_matches.length})`}>
          <div className="space-y-3">
            {report.top_job_matches.map((j, i) => (
              <a
                key={i}
                href={j.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-violet-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{j.title}</span>
                  {j.ats_platform && (
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {j.ats_platform}
                    </span>
                  )}
                </div>
                {j.location && (
                  <p className="text-xs text-zinc-500">{j.location}</p>
                )}
                <p className="mt-1 text-xs text-zinc-400">{j.fit_reason}</p>
              </a>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="LinkedIn DM"
        action={<CopyButton text={o.linkedin_dm} />}
      >
        <p className="whitespace-pre-wrap rounded-lg bg-zinc-900/60 p-3 text-sm text-zinc-200">
          {o.linkedin_dm}
        </p>
        <p className="mt-1 text-right text-[10px] text-zinc-600">
          {o.linkedin_dm.length} chars
        </p>
      </Section>

      <Section title="Follow-up email" action={<CopyButton text={emailFull} />}>
        <div className="rounded-lg bg-zinc-900/60 p-3">
          <p className="text-xs font-semibold text-zinc-400">
            Subject: <span className="text-zinc-200">{o.follow_up_email_subject}</span>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
            {o.follow_up_email_body}
          </p>
        </div>
      </Section>

      {o.talking_points.length > 0 && (
        <Section title="Talking points">
          <ul className="space-y-2">
            {o.talking_points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="text-violet-400">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <button
        onClick={onReset}
        className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-violet-500 hover:text-white"
      >
        New contact
      </button>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
