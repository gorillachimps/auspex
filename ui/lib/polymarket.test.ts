import { describe, expect, it } from "vitest";
import { classifyFakFill } from "./polymarket";

describe("classifyFakFill", () => {
  it("treats a zero makingAmount as nofill, in any string form", () => {
    expect(classifyFakFill({ makingAmount: "0" })).toBe("nofill");
    expect(classifyFakFill({ makingAmount: "0.0" })).toBe("nofill");
    expect(classifyFakFill({ makingAmount: "0.000000" })).toBe("nofill");
    expect(classifyFakFill({ makingAmount: 0 })).toBe("nofill");
  });

  it("treats any nonzero match as placed — never asserts full closure", () => {
    // Unit-agnostic: whether decimal shares or 6-decimal base units, nonzero
    // means SOMETHING matched. Completeness is decided by the refreshed
    // portfolio, not here.
    expect(classifyFakFill({ makingAmount: "9901" })).toBe("placed");
    expect(classifyFakFill({ makingAmount: "0.01" })).toBe("placed");
    expect(classifyFakFill({ makingAmount: "9901000000" })).toBe("placed");
    expect(classifyFakFill({ makingAmount: 42 })).toBe("placed");
  });

  it("defaults to placed when the amount is missing or unreadable", () => {
    // We only downgrade to "nofill" on a provable zero; an absent/garbage field
    // must not be mistaken for a no-fill (that would suppress residual warnings).
    expect(classifyFakFill({})).toBe("placed");
    expect(classifyFakFill({ makingAmount: "abc" })).toBe("placed");
    expect(classifyFakFill({ makingAmount: null })).toBe("placed");
    expect(classifyFakFill(null)).toBe("placed");
    expect(classifyFakFill(undefined)).toBe("placed");
  });

  it("does NOT treat an empty/whitespace string as a zero fill", () => {
    // The CLOB success response can carry makingAmount as "" (documented), and
    // Number("") === 0 — so an empty value must NOT read as nofill, or a real
    // close would be mislabeled "nothing filled / position unchanged".
    expect(classifyFakFill({ makingAmount: "" })).toBe("placed");
    expect(classifyFakFill({ makingAmount: "   " })).toBe("placed");
    expect(classifyFakFill({ makingAmount: "\t\n" })).toBe("placed");
  });
});
