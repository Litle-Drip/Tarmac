import { describe, it, expect } from "vitest";
import { normalizeLabel, pickDisplayLabel, cleanRawLabel } from "./normalize.js";

describe("normalizeLabel", () => {
  it("groups the spellings people actually type for one checkpoint", () => {
    const key = normalizeLabel("North");
    expect(normalizeLabel("north")).toBe(key);
    expect(normalizeLabel("  North  ")).toBe(key);
    expect(normalizeLabel("North Checkpoint")).toBe(key);
    expect(normalizeLabel("north checkpoint")).toBe(key);
    expect(normalizeLabel("N")).toBe(key);
  });

  it("groups terminal spellings", () => {
    const key = normalizeLabel("Terminal 4");
    expect(normalizeLabel("terminal 4")).toBe(key);
    expect(normalizeLabel("T4")).toBe(key);
    expect(normalizeLabel("T 4")).toBe(key);
    expect(normalizeLabel("Term 4")).toBe(key);
    expect(normalizeLabel("Terminal Four")).toBe(key);
  });

  it("keeps genuinely different checkpoints apart", () => {
    expect(normalizeLabel("North")).not.toBe(normalizeLabel("South"));
    expect(normalizeLabel("Terminal 1")).not.toBe(normalizeLabel("Terminal 2"));
    expect(normalizeLabel("Terminal A")).not.toBe(normalizeLabel("Terminal B"));
  });

  it("treats word order as insignificant", () => {
    expect(normalizeLabel("North 2")).toBe(normalizeLabel("2 North"));
  });

  it("returns null when nothing meaningful is left", () => {
    expect(normalizeLabel("")).toBeNull();
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
    expect(normalizeLabel(undefined)).toBeNull();
    // All noise words — must not become an empty-string bucket.
    expect(normalizeLabel("checkpoint")).toBeNull();
    expect(normalizeLabel("TSA security checkpoint")).toBeNull();
    expect(normalizeLabel("---")).toBeNull();
  });

  it("keeps a single letter that is a real name", () => {
    expect(normalizeLabel("C")).toBe("c");
    expect(normalizeLabel("Checkpoint C")).toBe("c");
  });

  it("ignores punctuation and casing differences", () => {
    expect(normalizeLabel("Terminal-4")).toBe(normalizeLabel("Terminal 4"));
    expect(normalizeLabel("TERMINAL 4!")).toBe(normalizeLabel("terminal 4"));
  });
});

describe("pickDisplayLabel", () => {
  it("picks the most commonly used spelling", () => {
    expect(pickDisplayLabel(["North", "north", "North", "N"])).toBe("North");
  });

  it("prefers the more descriptive spelling on a tie", () => {
    expect(pickDisplayLabel(["N", "North"])).toBe("North");
  });

  it("is deterministic when count and length both tie", () => {
    const once = pickDisplayLabel(["East", "West"]);
    const twice = pickDisplayLabel(["West", "East"]);
    expect(once).toBe(twice);
  });

  it("ignores blanks and returns null when there is nothing to show", () => {
    expect(pickDisplayLabel([null, "", "  "])).toBeNull();
    expect(pickDisplayLabel([])).toBeNull();
  });
});

describe("cleanRawLabel", () => {
  it("collapses whitespace but preserves what was meant", () => {
    expect(cleanRawLabel("  Terminal   4 ")).toBe("Terminal 4");
  });

  it("caps runaway input", () => {
    expect(cleanRawLabel("x".repeat(200))?.length).toBe(60);
  });

  it("returns null for empty input", () => {
    expect(cleanRawLabel("   ")).toBeNull();
    expect(cleanRawLabel(null)).toBeNull();
  });
});
