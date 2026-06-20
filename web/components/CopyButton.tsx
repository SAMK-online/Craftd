"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; no-op */
    }
  }

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-violet-500/50 hover:text-white"
      }`}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
