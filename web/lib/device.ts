// A stable per-device id used to scope this user's persona + contacts in the DB.
// (No auth yet — this identifies "you" on this browser; swap for real auth later.)
const KEY = "crafted_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
