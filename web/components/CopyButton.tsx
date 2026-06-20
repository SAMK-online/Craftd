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
      className="rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs font-medium text-zinc-200 transition hover:border-violet-500 hover:text-white active:scale-95"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
