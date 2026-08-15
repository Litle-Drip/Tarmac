/**
 * Normalising free-text terminal and checkpoint names.
 *
 * The report form lets people type whatever the signage above them says, which
 * is the right call for the person in the line — but it means "North",
 * "north", "N", and "North Checkpoint" arrive as four different strings for
 * one physical queue. Grouping on the raw text fragments the breakdown exactly
 * as adoption grows.
 *
 * So we group on a normalised key and display the spelling travellers actually
 * use most. Nothing is lost: the raw text is stored alongside.
 */

/** Words that carry no distinguishing information in this context. */
const NOISE_WORDS = new Set([
  "terminal",
  "term",
  "checkpoint",
  "check",
  "point",
  "security",
  "screening",
  "tsa",
  "the",
  "at",
  "gate",
  "gates",
  "concourse",
  "hall",
  "entrance",
  "lane",
]);

/** "one" → "1", so "Terminal One" and "Terminal 1" agree. */
const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

const DIRECTIONS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  ctr: "central",
  cntrl: "central",
};

/**
 * Reduce a label to a stable grouping key, or null when nothing meaningful
 * remains. Returning null is important: an empty key must never become its own
 * bucket labelled "".
 */
export function normalizeLabel(input: string | null | undefined): string | null {
  if (!input) return null;

  const cleaned = input
    .toLowerCase()
    .normalize("NFKD")
    // Keep letters, digits and spaces; everything else becomes a separator.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!cleaned) return null;

  // "t1" / "a12" → "t 1" / "a 12" so the parts tokenise independently.
  const split = cleaned.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2");

  const tokens: string[] = [];
  for (const raw of split.split(/\s+/)) {
    if (!raw) continue;
    const token = NUMBER_WORDS[raw] ?? DIRECTIONS[raw] ?? raw;
    // "t" is only noise when it prefixes a number ("T 4"); alone it is a name.
    if (token === "t" && tokens.length === 0) continue;
    if (NOISE_WORDS.has(token)) continue;
    tokens.push(token);
  }

  if (tokens.length === 0) return null;

  // Sort so "north 2" and "2 north" land together, then join.
  return tokens.sort().join(" ");
}

/**
 * The label to show for a group: whichever spelling was used most, with ties
 * broken by the longer (more descriptive) one, then alphabetically so the
 * output is deterministic.
 */
export function pickDisplayLabel(labels: (string | null)[]): string | null {
  const counts = new Map<string, number>();

  for (const label of labels) {
    const trimmed = label?.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (b[0].length !== a[0].length) return b[0].length - a[0].length;
    return a[0].localeCompare(b[0]);
  })[0][0];
}

/** Tidy the text we store and echo back, without changing what was meant. */
export function cleanRawLabel(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned.length > 0 ? cleaned : null;
}
