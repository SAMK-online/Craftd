import type { UserPersona } from "./types";

const KEY = "crafted_persona";

export function loadPersona(): UserPersona | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserPersona) : null;
  } catch {
    return null;
  }
}

export function savePersona(persona: UserPersona): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(persona));
}

export function clearPersona(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
