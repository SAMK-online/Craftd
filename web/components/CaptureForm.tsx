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
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex rounded-xl bg-zinc-900 p-1">
        {(["card", "type"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
              mode === m
                ? "bg-violet-600 text-white shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m === "card" ? "Snap a card" : "Type it in"}
          </button>
        ))}
      </div>

      {mode === "card" ? (
        <div>
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
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-10 text-zinc-400 transition hover:border-violet-500 hover:text-zinc-200"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Business card"
                className="max-h-48 rounded-lg object-contain"
              />
            ) : (
              <>
                <span className="text-4xl">📇</span>
                <span className="text-sm font-medium">
                  Tap to snap or upload a business card
                </span>
                <span className="text-xs text-zinc-500">
                  Uses your camera on mobile
                </span>
              </>
            )}
          </button>
          {preview && (
            <button
              onClick={() => handleFile(null)}
              className="mt-2 text-xs text-zinc-500 underline hover:text-zinc-300"
            >
              Remove image
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Name *" value={name} onChange={setName} placeholder="Sarah Chen" />
          <Field
            label="Company *"
            value={company}
            onChange={setCompany}
            placeholder="Anthropic"
          />
          <Field
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Solutions Engineer"
          />
        </div>
      )}

      <Field
        label="Event (optional)"
        value={eventName}
        onChange={setEventName}
        placeholder="AWS Summit 2025"
      />

      <button
        onClick={submit}
        disabled={!canSubmit || disabled}
        className="w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {disabled ? "Working…" : "Craft follow-up"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-500"
      />
    </label>
  );
}
