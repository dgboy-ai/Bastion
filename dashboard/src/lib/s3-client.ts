import { S3Client } from "@aws-sdk/client-s3";

/**
 * Shared S3 client for the dashboard.
 * Region from env (defaults to the bastion cluster's ap-south-1).
 * Credentials are resolved from the standard AWS env vars / IAM role.
 */
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
});
