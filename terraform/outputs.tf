output "cluster_id" {
  description = "CockroachDB Cloud cluster ID"
  value       = cockroachlabs_cockroachcloud_cluster.bastion.id
}

output "cluster_region" {
  description = "Primary cluster region"
  value       = var.aws_region
}

output "lambda_function_names" {
  description = "Deployed Lambda function names"
  value = {
    cdc_handler = aws_lambda_function.cdc_handler.function_name
  }
}

output "s3_bucket_name" {
  description = "S3 bucket for memory archives"
  value       = aws_s3_bucket.bastion_artifacts.bucket
}

output "kms_signing_key_arn" {
  description = "KMS asymmetric signing key ARN (for BASTION_KMS_KEY_ALIAS)"
  value       = aws_kms_key.bastion_signing.arn
}

output "kms_signing_key_alias" {
  description = "KMS key alias (for BASTION_KMS_KEY_ALIAS env var)"
  value       = "alias/bastion-hash-chain"
}

output "kms_signing_public_key" {
  description = "KMS public key for local verification (DER format, base64)"
  value       = base64encode(aws_kms_key.bastion_signing.public_key)
  sensitive   = false
}

output "deployment_instructions" {
  description = "Next steps after apply"
  value       = <<-EOT
    1. CockroachDB cluster is ready
    2. Apply schema: cockroach sql --connection-string="..." < schema/*.sql
    3. Enable multi-region: cockroach sql --execute "ALTER TABLE agent_memory SET LOCALITY REGIONAL BY ROW AS crdb_region"
    4. MCP server: deploy dashboard to Vercel, run MCP server locally or via ECS
    5. Set env vars: BASTION_SIGNING_MODE=kms BASTION_KMS_KEY_ALIAS=alias/bastion-hash-chain
    6. Dashboard: Deploy to Vercel or run locally
  EOT
}
