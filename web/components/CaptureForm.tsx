"use client";

import { useRef, useState } from "react";
import type { GenerateInput } from "@/lib/types";

type Mode = "card" | "type";

export function CaptureForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (input: GenerateInput) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("card");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [eventName, setEventName] = useState("");
  const [cardImage, setCardImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    mode === "card" ? !!cardImage : name.trim() !== "" && company.trim() !== "";

  function handleFile(file: File | null) {
    setCardImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function submit() {
    if (!canSubmit || disabled) return;
    onSubmit({
      name: name.trim() || undefined,
      company: company.trim() || undefined,
      title: title.trim() || undefined,
      eventName: eventName.trim() || undefined,
      cardImage: mode === "card" ? cardImage : null,
    });
  }

  return (
    <div className="animate-fade-up space-y-5">
      <SegmentedToggle mode={mode} setMode={setMode} />

      {mode === "card" ? (
        <div className="animate-fade-up">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-hairline bg-surface-card px-4 py-12 transition hover:border-ink/40"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Business card" className="max-h-52 rounded-lg object-contain" />
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-peach text-ink">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="8" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M13 10h5M13 14h5M5 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-ink">Tap to snap or upload a card</span>
                <span className="text-xs text-muted">Uses your camera on mobile</span>
              </>
            )}
          </button>
          {preview && (
            <button
              onClick={() => handleFile(null)}
              className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Remove image
            </button>
          )}
        </div>
      ) : (
        <div className="animate-fade-up space-y-3">
          <Field label="Name" required value={name} onChange={setName} placeholder="Sarah Chen" />
          <Field label="Company" required value={company} onChange={setCompany} placeholder="Anthropic" />
          <Field label="Title" value={title} onChange={setTitle} placeholder="Solutions Engineer" />
        </div>
      )}

      <Field label="Event" value={eventName} onChange={setEventName} placeholder="AWS Summit 2025" hint="optional" />

      <button
        onClick={submit}
        disabled={!canSubmit || disabled}
        className="w-full rounded-md bg-ink px-4 py-3.5 text-base font-semibold text-on-primary transition hover:bg-body-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted-soft"
      >
        {disabled ? "Working…" : "Craft follow-up"}
      </button>
    </div>
  );
}

export function SegmentedToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="relative flex rounded-md border border-hairline bg-surface-card p-1">
      <span
        className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-[8px] bg-canvas shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: mode === "card" ? "translateX(0)" : "translateX(100%)" }}
        aria-hidden
      />
      {(["card", "type"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`relative z-10 flex-1 rounded-[8px] px-4 py-2.5 text-sm font-semibold transition-colors ${
            mode === m ? "text-ink" : "text-muted hover:text-body-strong"
          }`}
        >
          {m === "card" ? "Snap a card" : "Type it in"}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
        {label}
        {required && <span className="text-brand-pink">*</span>}
        {hint && <span className="font-normal text-muted-soft">· {hint}</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-hairline bg-canvas px-4 text-sm text-ink placeholder-muted-soft outline-none transition focus:border-ink"
      />
    </label>
  );
}
