import {
  getCreate2Address,
  keccak256,
  encodePacked,
  encodeAbiParameters,
  concat,
  pad,
  toHex,
  type Address,
  type Hex,
} from "viem";

/**
 * Deterministic derivation of a user's Polymarket account address from their
 * signer EOA, for every account kind Polymarket creates. A Polymarket account
 * is a CREATE2 function of the EOA — so we can compute it directly (no event
 * scan, no false positives) and classify a known account by matching it back.
 *
 * Ported verbatim from Polymarket's own SDK (Polymarket/ts-sdk
 * `packages/client/src/wallet.ts` and Polymarket/builder-relayer-client
 * `src/builder/derive.ts`, which agree). Every constant + formula here is
 * verified against Polymarket's official test vectors AND live accounts:
 *   - Safe   : 0x6e0c…B5b5 → 0x6d8c…B4fa, and 0x8a03…a3aC → 0x911C…2c31
 *   - Proxy  : 0x339a…398e → 0xBa73…aC46
 *   - UUPS   : 0xA606…f201 → 0x8b60…8c40
 *   - Beacon : 0x0000…0001 → 0x94bF…6cD9
 *
 * CLOB SignatureType: POLY_PROXY=1, POLY_GNOSIS_SAFE=2, POLY_1271=3.
 */
export type ProxyType = "proxy" | "safe" | "deposit";

export const SIGNATURE_TYPE: Record<ProxyType, 1 | 2 | 3> = {
  proxy: 1, // POLY_PROXY        — Magic / email-Google login
  safe: 2, // POLY_GNOSIS_SAFE   — MetaMask / browser wallet
  deposit: 3, // POLY_1271       — newer Deposit Wallet (default for new signups)
};

// Polygon (chainId 137) constants. DO NOT edit without re-verifying vectors.
const PROXY_FACTORY = "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052" as Address;
const PROXY_INIT_CODE_HASH =
  "0xd21df8dc65880a8606f09fe0ce3df9b8869287ab0b058be05aa9e8af6330a00b" as Hex;
const SAFE_FACTORY = "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b" as Address;
const SAFE_INIT_CODE_HASH =
  "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf" as Hex;
const DEPOSIT_FACTORY =
  "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07" as Address;
const DEPOSIT_BEACON = "0x7A18EDfe055488A3128f01F563e5B479D92ffc3a" as Address;
const DEPOSIT_IMPL = "0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB" as Address;

// Solady v0.1.26 LibClone ERC-1967 init-code byte constants. Verbatim from
// Polymarket's SDK — these encode the minimal ERC-1967 proxy runtime.
const ERC1967_CONST1 =
  "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3" as Hex;
const ERC1967_CONST2 =
  "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076" as Hex;
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;
const ERC1967_BEACON_CONST1 =
  "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3" as Hex;
const ERC1967_BEACON_CONST2 =
  "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c" as Hex;
const ERC1967_BEACON_CONST3 =
  "0x60195155f3363d3d373d3d363d602036600436635c60da" as Hex;
const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;

function depositArgs(owner: Address): Hex {
  const walletId = pad(owner, { dir: "left", size: 32 });
  return encodeAbiParameters(
    [{ type: "address" }, { type: "bytes32" }],
    [DEPOSIT_FACTORY, walletId],
  );
}

function initCodeHashERC1967(impl: Address, args: Hex): Hex {
  const n = BigInt((args.length - 2) / 2);
  return keccak256(
    concat([
      toHex(ERC1967_PREFIX + (n << 56n), { size: 10 }),
      impl,
      "0x6009" as Hex,
      ERC1967_CONST2,
      ERC1967_CONST1,
      args,
    ]),
  );
}

function initCodeHashERC1967Beacon(beacon: Address, args: Hex): Hex {
  const n = BigInt((args.length - 2) / 2);
  return keccak256(
    concat([
      toHex(ERC1967_BEACON_PREFIX + (n << 56n), { size: 10 }),
      beacon,
      ERC1967_BEACON_CONST3,
      ERC1967_BEACON_CONST2,
      ERC1967_BEACON_CONST1,
      args,
    ]),
  );
}

export type Candidate = {
  type: ProxyType;
  signatureType: 1 | 2 | 3;
  address: Address;
};

/** All deterministic Polymarket account addresses for a signer EOA, in the
 *  preference order Polymarket's own `classifyWalletType` uses:
 *  beacon-deposit → uups-deposit → safe → proxy. Pure CREATE2 — no network. */
export function deriveCandidates(eoa: Address): Candidate[] {
  const args = depositArgs(eoa);
  const salt = keccak256(args);
  const beacon = getCreate2Address({
    from: DEPOSIT_FACTORY,
    salt,
    bytecodeHash: initCodeHashERC1967Beacon(DEPOSIT_BEACON, args),
  });
  const uups = getCreate2Address({
    from: DEPOSIT_FACTORY,
    salt,
    bytecodeHash: initCodeHashERC1967(DEPOSIT_IMPL, args),
  });
  const safe = getCreate2Address({
    from: SAFE_FACTORY,
    salt: keccak256(
      encodeAbiParameters([{ name: "address", type: "address" }], [eoa]),
    ),
    bytecodeHash: SAFE_INIT_CODE_HASH,
  });
  const proxy = getCreate2Address({
    from: PROXY_FACTORY,
    salt: keccak256(encodePacked(["address"], [eoa])),
    bytecodeHash: PROXY_INIT_CODE_HASH,
  });
  return [
    { type: "deposit", signatureType: 3, address: beacon },
    { type: "deposit", signatureType: 3, address: uups },
    { type: "safe", signatureType: 2, address: safe },
    { type: "proxy", signatureType: 1, address: proxy },
  ];
}

/** Classify a known account address against a signer EOA. Returns the account
 *  kind if the address matches one of the EOA's deterministic derivations, else
 *  null (e.g. a pasted address not derivable from this wallet). */
export function classifyProxy(eoa: Address, wallet: Address): ProxyType | null {
  const w = wallet.toLowerCase();
  for (const c of deriveCandidates(eoa)) {
    if (c.address.toLowerCase() === w) return c.type;
  }
  return null;
}
