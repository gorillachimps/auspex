import { describe, expect, it } from "vitest";
import { safeNotificationUrl } from "./useNotifications";

describe("safeNotificationUrl", () => {
  it("accepts legitimate root-relative deep links", () => {
    expect(safeNotificationUrl("/portfolio")).toBe("/portfolio");
    expect(safeNotificationUrl("/markets/btc-above-68k?copy=yes#top")).toBe(
      "/markets/btc-above-68k?copy=yes#top",
    );
  });

  it("rejects non-strings and non-rooted paths", () => {
    expect(safeNotificationUrl(undefined)).toBeUndefined();
    expect(safeNotificationUrl(42)).toBeUndefined();
    expect(safeNotificationUrl("portfolio")).toBeUndefined();
    expect(safeNotificationUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeNotificationUrl("https://evil.com/x")).toBeUndefined();
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNotificationUrl("//evil.com")).toBeUndefined();
    expect(safeNotificationUrl("//evil.com/path")).toBeUndefined();
  });

  it("rejects the backslash bypass — browsers treat \\ as / in URLs", () => {
    expect(safeNotificationUrl("/\\evil.com")).toBeUndefined();
    expect(safeNotificationUrl("/\\/evil.com")).toBeUndefined();
    expect(safeNotificationUrl("/\\\\evil.com")).toBeUndefined();
  });

  it("rejects anything whose URL resolution escapes the origin", () => {
    // Belt-and-braces: even if a prefix check missed a form, the parse must
    // catch an origin escape. (E.g. exotic whitespace/control-char tricks.)
    expect(safeNotificationUrl("/\t\\evil.com")).toBeUndefined();
  });

  it("keeps same-origin lookalikes that are genuinely just paths", () => {
    expect(safeNotificationUrl("/%5C%5Cevil.com")).toBe("/%5C%5Cevil.com");
    expect(safeNotificationUrl("/https://evil.com")).toBe("/https://evil.com");
  });
});
