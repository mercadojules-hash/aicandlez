import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import * as secp from "@noble/secp256k1";
import { encode as msgpackEncode } from "@msgpack/msgpack";

// ── Hyperliquid signing helpers ──────────────────────────────────────────────
//
// Hyperliquid authenticates `/exchange` writes with an EIP-712 signature
// over a "phantom Agent" whose `connectionId` is the keccak256 of the
// msgpack-encoded action + 8-byte big-endian nonce + (0x00 | 0x01 + vault).
// All write actions (order / cancel) use this same envelope; the domain is
// pinned at chainId 1337 regardless of testnet vs mainnet — the network is
// distinguished only by the phantom agent's `source` field ("a" mainnet,
// "b" testnet).
//
// See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
// and the official python sdk (`hyperliquid-python-sdk`) `signing.py`.

// Wire the synchronous hash impls expected by secp256k1's sync sign API.
// Cast around noble's strict `Uint8Array<ArrayBuffer>` typing — every
// allocation we make here lives on a plain ArrayBuffer at runtime.
const hashesAny = secp.hashes as unknown as {
  sha256:     (msg: Uint8Array) => Uint8Array;
  hmacSha256: (key: Uint8Array, msg: Uint8Array) => Uint8Array;
};
hashesAny.sha256     = (msg: Uint8Array) => sha256(msg);
hashesAny.hmacSha256 = (key: Uint8Array, msg: Uint8Array) => hmac(sha256, key, msg);

export interface HyperliquidSignature {
  r: string; // 0x-prefixed 32-byte hex
  s: string; // 0x-prefixed 32-byte hex
  v: number; // 27 | 28
}

const DOMAIN_TYPE_HASH = keccak_256(
  new TextEncoder().encode(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  ),
);
const AGENT_TYPE_HASH = keccak_256(
  new TextEncoder().encode("Agent(string source,bytes32 connectionId)"),
);

const ZERO_ADDRESS_32 = new Uint8Array(32);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function uint64BE(n: number | bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(n), false);
  return buf;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encodeAddress(addr: string): Uint8Array {
  const raw = hexToBytes(addr);
  if (raw.length !== 20) throw new Error("address must be 20 bytes");
  const padded = new Uint8Array(32);
  padded.set(raw, 12);
  return padded;
}

function actionHash(
  action: unknown,
  vaultAddress: string | null,
  nonce: number | bigint,
): Uint8Array {
  const packed = msgpackEncode(action);
  const nonceBytes = uint64BE(nonce);
  const tail = vaultAddress
    ? concatBytes(new Uint8Array([0x01]), hexToBytes(vaultAddress))
    : new Uint8Array([0x00]);
  return keccak_256(concatBytes(packed, nonceBytes, tail));
}

function eip712Digest(connectionId: Uint8Array, isMainnet: boolean): Uint8Array {
  // Domain: { name: "Exchange", version: "1", chainId: 1337, verifyingContract: 0x0 }
  const chainIdBytes = new Uint8Array(32);
  new DataView(chainIdBytes.buffer).setBigUint64(24, 1337n, false);
  const domainHash = keccak_256(
    concatBytes(
      DOMAIN_TYPE_HASH,
      keccak_256(new TextEncoder().encode("Exchange")),
      keccak_256(new TextEncoder().encode("1")),
      chainIdBytes,
      ZERO_ADDRESS_32,
    ),
  );

  const source = isMainnet ? "a" : "b";
  const structHash = keccak_256(
    concatBytes(
      AGENT_TYPE_HASH,
      keccak_256(new TextEncoder().encode(source)),
      connectionId,
    ),
  );

  return keccak_256(
    concatBytes(new Uint8Array([0x19, 0x01]), domainHash, structHash),
  );
}

export function signL1Action(
  privateKeyHex: string,
  action: unknown,
  nonce: number | bigint,
  isMainnet: boolean,
  vaultAddress: string | null = null,
): HyperliquidSignature {
  const connectionId = actionHash(action, vaultAddress, nonce);
  const digest = eip712Digest(connectionId, isMainnet);
  const privKey = hexToBytes(privateKeyHex);
  if (privKey.length !== 32) throw new Error("Hyperliquid: private key must be 32 bytes");

  // 65-byte recovered signature: r(32) || s(32) || recovery(1)
  const sig = secp.sign(digest, privKey, { prehash: false, format: "recovered" });
  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);
  const recovery = sig[64] ?? 0;

  return {
    r: "0x" + bytesToHex(r),
    s: "0x" + bytesToHex(s),
    v: 27 + recovery,
  };
}

/**
 * Derive the wallet address (lowercase 0x-prefixed) from a 32-byte private
 * key. Used when the operator only supplies the secret half of the pair.
 */
export function walletAddressFromPrivateKey(privateKeyHex: string): string {
  const privKey = hexToBytes(privateKeyHex);
  const pubUncompressed = secp.getPublicKey(privKey, false); // 65 bytes, leading 0x04
  const pubXY = pubUncompressed.slice(1);
  const hash = keccak_256(pubXY);
  return "0x" + bytesToHex(hash.slice(12));
}
