"use client";

import { useState } from "react";

/**
 * `onColor` = true when placed on a saturated (pink/teal) card → uses a
 * translucent white chip instead of the default ink-on-cream chip.
 */
export function CopyButton({
  text,
  label = "Copy",
  onColor = false,
}: {
  text: string;
  label?: string;
  onColor?: boolean;
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

  const base =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition active:scale-95";
  const cls = onColor
    ? "border border-white/30 bg-white/15 text-white hover:bg-white/25"
    : "border border-hairline bg-canvas text-ink hover:bg-surface-card";

  return (
    <button onClick={copy} className={`${base} ${cls}`}>
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
