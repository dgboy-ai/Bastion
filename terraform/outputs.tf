output "cluster_id" {
  description = "CockroachDB Cloud cluster ID"
  value       = cockroachcloud_cluster.bastion.id
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

output "deployment_instructions" {
  description = "Next steps after apply"
  value       = <<-EOT
    1. CockroachDB cluster is ready
    2. Apply schema: cockroach sql --connection-string="..." < schema/*.sql
    3. MCP server: aws lambda invoke --function-name bastion-mcp-server
    4. Dashboard: Deploy to Vercel or run locally
  EOT
}
