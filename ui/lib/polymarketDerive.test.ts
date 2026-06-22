import { describe, it, expect } from "vitest";
import { deriveCandidates, classifyProxy } from "./polymarketDerive";

// These vectors are Polymarket's own official test vectors plus a live MetaMask
// account verified end-to-end this session. They are the contract for the whole
// onboarding path: if a derivation constant regresses, account detection
// silently breaks for EVERY user. Treat a failure here as a release blocker.
describe("deriveCandidates — verified vectors", () => {
  it("Safe (POLY_GNOSIS_SAFE / type 2) — official vector", () => {
    const safe = deriveCandidates(
      "0x6e0c80c90ea6c15917308F820Eac91Ce2724B5b5",
    ).find((c) => c.type === "safe");
    expect(safe?.address.toLowerCase()).toBe(
      "0x6d8c4e9adf5748af82dabe2c6225207770d6b4fa",
    );
    expect(safe?.signatureType).toBe(2);
  });

  it("Safe — the live MetaMask account that proved the flow", () => {
    const safe = deriveCandidates(
      "0x8a03F8237fA235bf149613E5697A3273b0b8a3aC",
    ).find((c) => c.type === "safe");
    expect(safe?.address.toLowerCase()).toBe(
      "0x911c5cf682794367bc9fe885610ec78e9fd62c31",
    );
  });

  it("Magic proxy (POLY_PROXY / type 1) — official vector", () => {
    const proxy = deriveCandidates(
      "0x339a9731D4c1ea6861db006ad592b83E49C9398e",
    ).find((c) => c.type === "proxy");
    expect(proxy?.address.toLowerCase()).toBe(
      "0xba734a6a711c9f13b8f7366572a4f9817a0dac46",
    );
    expect(proxy?.signatureType).toBe(1);
  });

  it("UUPS deposit wallet (POLY_1271 / type 3) — official vector", () => {
    const hit = deriveCandidates(
      "0xA60601A4d903af91855C52BFB3814f6bA342f201",
    ).some(
      (c) =>
        c.type === "deposit" &&
        c.address.toLowerCase() ===
          "0x8b60bf0f650bf7a0d93f10d72375b37de18f8c40",
    );
    expect(hit).toBe(true);
  });

  it("Beacon deposit wallet (POLY_1271 / type 3) — official vector", () => {
    const hit = deriveCandidates(
      "0x0000000000000000000000000000000000000001",
    ).some(
      (c) =>
        c.type === "deposit" &&
        c.address.toLowerCase() ===
          "0x94bf330955a0b957662feaf878de77bf25f76cd9",
    );
    expect(hit).toBe(true);
  });

  it("returns candidates in Polymarket's classifyWalletType priority order", () => {
    const types = deriveCandidates(
      "0x8a03F8237fA235bf149613E5697A3273b0b8a3aC",
    ).map((c) => c.type);
    expect(types).toEqual(["deposit", "deposit", "safe", "proxy"]);
  });

  it("derivation is case-insensitive in the EOA", () => {
    const lower = deriveCandidates(
      "0x8a03f8237fa235bf149613e5697a3273b0b8a3ac",
    ).find((c) => c.type === "safe");
    expect(lower?.address.toLowerCase()).toBe(
      "0x911c5cf682794367bc9fe885610ec78e9fd62c31",
    );
  });
});

describe("classifyProxy — the SEC-1 ownership guard", () => {
  it("matches a derived account back to its owner EOA", () => {
    expect(
      classifyProxy(
        "0x8a03F8237fA235bf149613E5697A3273b0b8a3aC",
        "0x911C5Cf682794367BC9fE885610ec78E9Fd62c31",
      ),
    ).toBe("safe");
  });

  it("returns null for an address NOT derivable from the wallet (blocks phished funder)", () => {
    expect(
      classifyProxy(
        "0x8a03F8237fA235bf149613E5697A3273b0b8a3aC",
        "0x000000000000000000000000000000000000dEaD",
      ),
    ).toBeNull();
  });
});
