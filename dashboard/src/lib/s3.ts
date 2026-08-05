import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const BUCKET = process.env.BASTION_S3_BUCKET || "bastion-memory-archives";
const REGION = process.env.AWS_REGION || "ap-south-1";

const s3 = new S3Client({ region: REGION });

export interface ExportResult {
  bucket: string;
  key: string;
  region: string;
  bytes: number;
  count: number;
  url: string;
  arn: string;
}

/**
 * Upload an agent memory snapshot to S3 (cold archive tier).
 * Bucket/region come from env; body is a JSON-serializable payload.
 * Throws on S3 failure so the caller can return a clean apiError.
 */
export async function exportAgentMemory(
  agentId: string,
  payload: unknown,
): Promise<ExportResult> {
  const key = `memory-exports/${agentId}/${Date.now()}-${randomUUID()}.json`;
  const body = JSON.stringify(payload, null, 2);
  const bytes = Buffer.byteLength(body, "utf8");

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: process.env.BASTION_KMS_KEY_ARN || undefined,
      BucketKeyEnabled: true,
      Metadata: {
        "agent-id": agentId,
        "created-at": new Date().toISOString(),
      },
    }),
  );

  const count = Array.isArray(payload)
    ? payload.length
    : (payload as Record<string, unknown>)?.memories && Array.isArray((payload as Record<string, unknown>).memories)
      ? ((payload as Record<string, unknown>).memories as unknown[]).length
      : 1;
  return {
    bucket: BUCKET,
    key,
    region: REGION,
    bytes,
    count,
    url: `https://s3.console.aws.amazon.com/s3/object/${BUCKET}/${key}?region=${REGION}`,
    arn: `arn:aws:s3:::${BUCKET}/${key}`,
  };
}