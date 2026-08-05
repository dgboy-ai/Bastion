import { createHmac } from "crypto";

// Length-prefixed HMAC-SHA256 over content + metadata + previous hash,
// matching Python's bastion.crypto.compute_hash (to_bytes(4, 'big')).
export function computeHmacHash(
  content: string,
  metadata: Record<string, unknown>,
  previousHash: string | null
): string {
  const secret = process.env.BASTION_HMAC_SECRET || "";
  // Match Python: json.dumps(metadata, sort_keys=True)
  const metaStr =
    Object.keys(metadata).length > 0
      ? JSON.stringify(metadata, Object.keys(metadata).sort())
      : "";
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
