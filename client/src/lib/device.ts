/**
 * A stable, anonymous identifier for this browser.
 *
 * It exists so we can enforce a reporting cooldown and clean up abuse after
 * the fact. It is not an account, it is not tied to a person, and it carries
 * nothing about them — just a random string this install keeps.
 *
 * If storage is unavailable (private mode, storage disabled) we fall back to
 * an in-memory value for the session so reporting still works.
 */

const STORAGE_KEY = "tarmac.device-id";

export const DEVICE_HEADER = "X-Tarmac-Device";

let cached: string | null = null;

function generate(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // URL-safe base64 keeps it inside the server's [A-Za-z0-9_-]{16,64} check.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getDeviceId(): string {
  if (cached) return cached;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage unavailable — fall through to a session-only identifier.
  }

  const created = generate();
  cached = created;

  try {
    localStorage.setItem(STORAGE_KEY, created);
  } catch {
    // Session-only is an acceptable degradation.
  }

  return created;
}

/**
 * Reports and confirmations this browser has already made, so the UI can show
 * its own contributions without a round trip and avoid offering a second vote.
 */
const VOTED_KEY = "tarmac.voted-reports";

export function getVotedReports(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VOTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberVote(reportId: string, agrees: boolean): void {
  try {
    const votes = getVotedReports();
    votes[reportId] = agrees;
    // Keep this bounded; only recent reports are ever displayed.
    const entries = Object.entries(votes).slice(-200);
    localStorage.setItem(VOTED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Non-critical.
  }
}

/** The line the traveller actually stands in, remembered between visits. */
const LINE_KEY = "tarmac.line-type";

export type StoredLineType = "standard" | "tsa_precheck" | "clear";

export function getPreferredLineType(): StoredLineType {
  try {
    const stored = localStorage.getItem(LINE_KEY);
    if (stored === "standard" || stored === "tsa_precheck" || stored === "clear") {
      return stored;
    }
  } catch {
    // Fall through to the default.
  }
  return "standard";
}

export function setPreferredLineType(lineType: StoredLineType): void {
  try {
    localStorage.setItem(LINE_KEY, lineType);
  } catch {
    // Non-critical.
  }
}
