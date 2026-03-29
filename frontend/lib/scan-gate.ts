// lib/scan-gate.ts
// Controls the freemium scan gate.
// Guests get 1 free scan. After that they must sign up.

const GUEST_SCAN_KEY = "devxray_guest_scans";
const FREE_SCAN_LIMIT = 1;

export function getGuestScanCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(GUEST_SCAN_KEY) || "0", 10);
}

export function incrementGuestScan(): void {
  if (typeof window === "undefined") return;
  const current = getGuestScanCount();
  localStorage.setItem(GUEST_SCAN_KEY, String(current + 1));
}

export function hasGuestScansRemaining(): boolean {
  return getGuestScanCount() < FREE_SCAN_LIMIT;
}

export function resetGuestScans(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GUEST_SCAN_KEY);
}

export function getScansUsedByGuest(): number {
  return getGuestScanCount();
}
