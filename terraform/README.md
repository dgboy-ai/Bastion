# Bastion Terraform Configuration

One-click deployment of Bastion on AWS with CockroachDB Cloud.

## Quick Start

```bash
# Initialize Terraform
cd terraform
terraform init

# Plan deployment
terraform plan -var="bastion_hmac_secret=your-secret-here"

# Apply deployment
terraform apply -var="bastion_hmac_secret=your-secret-here"

# Get connection string
terraform output -raw cockroach_connection_string
```

## What This Provisions

| Resource | Description |
|----------|-------------|
| CockroachDB Cloud | Serverless cluster in your region |
| Bastion Servers | MCP + A2A servers (EC2) |
| S3 Bucket | CDC changefeed tailer (`cdc-live/`) + memory archives with Glacier lifecycle |
| KMS Key | Encryption for memory archives at rest |
| CloudWatch | Error monitoring + alerts |

## Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `bastion_hmac_secret` | Secret for hash chains | (required) |
| `environment` | Environment name | `hackathon` |

## After Deployment

1. Apply CockroachDB schema:
   ```bash
   cockroach sql --connection-string="$(terraform output -raw cockroach_connection_string)" < ../schema/*.sql
   ```

2. Configure MCP server in Claude Desktop:
   ```json
   {
     "mcpServers": {
       "bastion": {
         "command": "python",
         "args": ["-m", "bastion.mcp_server"]
       }
     }
   }
   ```

3. Deploy dashboard to Vercel:
   ```bash
   cd ../dashboard && vercel deploy
   ```
