import { createHmac } from "crypto";

// Match Python's json.dumps default ensure_ascii=True: every code unit > 0x7F
// becomes a \uXXXX escape. JSON.stringify alone keeps non-ASCII literal, which
// would produce a different byte stream than Python for e.g. "→" or emoji.
function pyEscape(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0x7f) {
      out += "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
    } else {
      out += s[i];
    }
  }
  return out;
}

function pyString(s: string): string {
  return pyEscape(JSON.stringify(s));
}

// Replicate Python's json.dumps(metadata, sort_keys=True) byte-for-byte:
// sorted keys (recursively), ", "/": " separators, and "{}" for an empty dict.
// A byte-for-byte identical serialization is required for the hash chain to
// verify across the dashboard and the Python MCP server.
function pythonSerialize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((v) => pythonSerialize(v)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${pyString(k)}: ${pythonSerialize(obj[k])}`).join(", ")}}`;
  }
  return pyString(value as string);
}

// Match Python's bastion.crypto.compute_hash: metadata None -> "" (empty string),
// empty dict {} -> "{}" (json.dumps({})), and non-empty dict -> sorted json.
// Pass null when the DB column stores NULL (recomputed as None -> ""), or an
// empty object when the column stores the string '{}' (recomputed as {} -> "{}").
function pythonJsonDumps(metadata: Record<string, unknown> | null): string {
  if (metadata === null || metadata === undefined) return "";
  return pythonSerialize(metadata);
}

// Resolve the HMAC secret the same way Python's crypto._get_hmac_secret does:
// prefer BASTION_HMAC_SECRET (used as its literal UTF-8 bytes) falling back to
// the ~/.bastion/hmac.key file bytes. If BASTION_HMAC_SECRET is a 64-char hex
// string, decode it to the same 32 raw bytes the keystore file holds, so the
// dashboard and the Python MCP server always derive the SAME key.
function resolveHmacSecret(): Buffer {
  const fromEnv = process.env.BASTION_HMAC_SECRET || "";
  if (fromEnv) {
    if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      return Buffer.from(fromEnv, "hex");
    }
    return Buffer.from(fromEnv, "utf8");
  }
  // Fallback: read ~/.bastion/hmac.key (raw secret bytes)
  try {
    const fs = require("fs") as typeof import("fs");
    const os = require("os") as typeof import("os");
    const p = require("path") as typeof import("path");
    const file = fs.readFileSync(p.join(os.homedir(), ".bastion", "hmac.key"));
    return Buffer.from(file);
  } catch {
    return Buffer.from("");
  }
}

// Length-prefixed HMAC-SHA256 over content + metadata + previous hash,
// matching Python's bastion.crypto.compute_hash (to_bytes(4, 'big')).
export function computeHmacHash(
  content: string,
  metadata: Record<string, unknown> | null,
  previousHash: string | null
): string {
  const secret = resolveHmacSecret();
  // Match Python: json.dumps(metadata, sort_keys=True)
  const metaStr = pythonJsonDumps(metadata);
  const prev = previousHash || "";

  const contentBytes = Buffer.from(content, "utf8");
  const metaBytes = Buffer.from(metaStr, "utf8");
  const prevBytes = Buffer.from(prev, "utf8");

  const buf = Buffer.alloc(
    4 + contentBytes.length + 4 + metaBytes.length + 4 + prevBytes.length
  );

  let offset = 0;
  buf.writeUInt32BE(contentBytes.length, offset);
  offset += 4;
  contentBytes.copy(buf, offset);
  offset += contentBytes.length;
  buf.writeUInt32BE(metaBytes.length, offset);
  offset += 4;
  metaBytes.copy(buf, offset);
  offset += metaBytes.length;
  buf.writeUInt32BE(prevBytes.length, offset);
  offset += 4;
  prevBytes.copy(buf, offset);

  return createHmac("sha256", secret).update(buf).digest("hex");
}
