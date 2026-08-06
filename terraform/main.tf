terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cockroachlabs = {
      source  = "cockroachlabs/cockroachcloud"
      version = "~> 1.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# ──────────────────────────────────────────────────────────────
# AWS KMS Key for Bastion Hash Chain Signing (Asymmetric ECDSA-P256)
# ──────────────────────────────────────────────────────────────
# Production-grade signing: private key NEVER leaves AWS KMS.
# Cannot be stolen even if app server is compromised.
# Supports automatic key rotation for compliance.
# ──────────────────────────────────────────────────────────────
resource "aws_kms_key" "bastion_signing" {
  description             = "Bastion hash chain asymmetric signing key (ECDSA-P256)"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  key_spec                = "ECC_NIST_P256"
  key_usage               = "SIGN_VERIFY"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowRootFullAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowLambdaSignVerify"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_role.arn
        }
        Action = [
          "kms:Sign",
          "kms:Verify",
          "kms:GetPublicKey",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_kms_alias" "bastion_signing" {
  name          = "alias/bastion-hash-chain"
  target_key_id = aws_kms_key.bastion_signing.key_id
}

# ──────────────────────────────────────────────────────────────
# CockroachDB Cloud Cluster
# ──────────────────────────────────────────────────────────────
# CRITICAL: For multi-region REGIONAL BY ROW support, you MUST use
# a Dedicated (STANDARD/ADVANCED) cluster with multi-region config.
# The BASIC (Serverless) plan does NOT support geo-partitioning.
# ──────────────────────────────────────────────────────────────
resource "cockroachlabs_cockroachcloud_cluster" "bastion" {
  name           = "bastion-hackathon"
  cloud_provider = "AWS"
  plan           = var.cockroach_plan

  # Use dedicated config only for STANDARD/ADVANCED plans
  dynamic "dedicated_config" {
    for_each = var.cockroach_plan != "BASIC" ? [1] : []
    content {
      region_nodes = {
        "${var.aws_region}" = {
          node_count = 3
        }
      }
    }
  }
}

# ──────────────────────────────────────────────────────────────
# VPC for Lambda functions
# ──────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "bastion-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# ──────────────────────────────────────────────────────────────
# IAM Role for Lambda
# ──────────────────────────────────────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "bastion-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "bastion-lambda-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
          "kms:Sign",
          "kms:Verify",
          "kms:GetPublicKey",
          "kms:DescribeKey"
        ]
        Resource = [
          aws_kms_key.bastion_signing.arn,
          "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.bastion_artifacts.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "*"
      }
    ]
  })
}

# ──────────────────────────────────────────────────────────────
# S3 Bucket for Memory Archives
# ──────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "bastion_artifacts" {
  bucket = "bastion-artifacts-${var.environment}-${random_id.suffix.hex}"
}

resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_server_side_encryption_configuration" "bastion_artifacts" {
  bucket = aws_s3_bucket.bastion_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "bastion_artifacts" {
  bucket = aws_s3_bucket.bastion_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "bastion_artifacts" {
  bucket = aws_s3_bucket.bastion_artifacts.id

  rule {
    id     = "archive-to-glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# ──────────────────────────────────────────────────────────────
# Lambda: CDC Handler (Hash verification + self-healing)
# ──────────────────────────────────────────────────────────────
data "archive_file" "cdc_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/cdc_lambda.zip"
}

resource "aws_lambda_function" "cdc_handler" {
  function_name = "bastion-cdc-handler"
  role          = aws_iam_role.lambda_role.arn
  handler       = "cdc_handler.handler"
  runtime       = "python3.12"
  timeout       = 300
  memory_size   = 256

  filename         = data.archive_file.cdc_lambda.output_path
  source_code_hash = data.archive_file.cdc_lambda.output_base64sha256

  environment {
    variables = {
      BASTION_CONN          = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
      BASTION_HMAC_SECRET   = var.bastion_hmac_secret
      BASTION_S3_BUCKET     = aws_s3_bucket.bastion_artifacts.id
      AWS_REGION            = var.aws_region
      BASTION_KMS_KEY_ALIAS = "alias/bastion-hash-chain"
      BASTION_SIGNING_MODE  = "kms"
    }
  }
}

# ──────────────────────────────────────────────────────────────
# Lambda: MCP Server (Streamable HTTP via Mangum adapter)
# NOTE: MCP server uses uvicorn/starlette. Deploy via ECS/EKS
#       or use Mangum to adapt for Lambda. For hackathon demo,
#       run as a standalone container instead.
# ──────────────────────────────────────────────────────────────
# Uncomment below if using Mangum adapter for Lambda deployment:
#
# resource "aws_lambda_function" "mcp_server" {
#   function_name = "bastion-mcp-server"
#   role          = aws_iam_role.lambda_role.arn
#   handler       = "mangum_mcp.handler"  # Requires Mangum adapter
#   runtime       = "python3.12"
#   timeout       = 30
#   memory_size   = 512
#
#   filename         = data.archive_file.cdc_lambda.output_path
#   source_code_hash = data.archive_file.cdc_lambda.output_base64sha256
#
#   environment {
#     variables = {
#       BASTION_CONN = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
#       BASTION_MOCK = "false"
#     }
#   }
# }

}
}

# ──────────────────────────────────────────────────────────────
# SQS Queues for Real-Time CDC Changefeed (NEW - Real-time)
# ──────────────────────────────────────────────────────────────
# FIFO queue ensures ordering per agent_id (message group = agent_id)
# Dead letter queue for poison pills after 3 retries
# ──────────────────────────────────────────────────────────────

resource "aws_sqs_queue" "bastion_cdc" {
  name                      = "bastion-cdc-changefeed.fifo"
  fifo_queue                = true
  content_based_deduplication = true
  message_retention_seconds = 1209600  # 14 days
  visibility_timeout_seconds = 30
  receive_wait_time_seconds = 20
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.bastion_cdc_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue" "bastion_cdc_dlq" {
  name = "bastion-cdc-changefeed-dlq.fifo"
  fifo_queue = true
}

# ──────────────────────────────────────────────────────────────
# Lambda: Real-Time CDC SQS Processor (NEW)
# ──────────────────────────────────────────────────────────────
data "archive_file" "cdc_sqs_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/cdc_sqs_lambda.zip"
}

resource "aws_lambda_function" "cdc_sqs_processor" {
  function_name = "bastion-cdc-sqs-processor"
  role          = aws_iam_role.lambda_role.arn
  handler       = "cdc_sqs_processor.handler"
  runtime       = "python3.12"
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.cdc_sqs_lambda.output_path
  source_code_hash = data.archive_file.cdc_sqs_lambda.output_base64sha256

  environment {
    variables = {
      BASTION_CONN           = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
      BASTION_HMAC_SECRET    = var.bastion_hmac_secret
      BASTION_S3_BUCKET      = aws_s3_bucket.bastion_artifacts.id
      AWS_REGION             = var.aws_region
      BASTION_KMS_KEY_ALIAS  = "alias/bastion-hash-chain"
      BASTION_SIGNING_MODE   = "kms"
      BASTION_CDC_QUEUE_URL  = aws_sqs_queue.bastion_cdc.url
      BASTION_DLQ_URL        = aws_sqs_queue.bastion_cdc_dlq.url
      BASTION_CDC_BATCH_SIZE = "10"
      BASTION_CDC_VISIBILITY_TIMEOUT = "30"
      BASTION_CDC_POLL_WAIT  = "20"
      BASTION_CDC_MAX_CONCURRENCY = "10"
    }
  }
}

# Lambda event source mapping (SQS -> Lambda)
resource "aws_lambda_event_source_mapping" "cdc_sqs" {
  event_source_arn = aws_sqs_queue.bastion_cdc.arn
  function_name    = aws_lambda_function.cdc_sqs_processor.function_name
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
  maximum_retry_attempts = 3
}

# ──────────────────────────────────────────────────────────────
# CockroachDB Changefeed Setup Instructions (Real-time SQS)
# ──────────────────────────────────────────────────────────────
# 
# Run this SQL against your Dedicated CockroachDB cluster to create
# the real-time changefeed streaming to SQS:
#
# CREATE CHANGEFEED INTO 'sqs://${aws_sqs_queue.bastion_cdc.arn}'
#   WITH updated, resolved='10s', format='json', envelope='row'
#   FROM TABLE agent_memory;
#
# Note: Requires Dedicated (STANDARD/ADVANCED) cluster.
# Serverless (BASIC) does not support changefeeds to external sinks.
#
# The message group ID will be set to agent_id for per-agent ordering.
# Format: {"Records": [{"value": {...}, "topic": "agent_memory"}]}
# ──────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────
# CloudWatch Alarms
# ──────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "cdc_handler_errors" {
  alarm_name          = "bastion-cdc-handler-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Bastion CDC handler errors"

  dimensions = {
    FunctionName = aws_lambda_function.cdc_handler.function_name
  }
}

# ──────────────────────────────────────────────────────────────
# Outputs (see outputs.tf for complete output definitions)
# ──────────────────────────────────────────────────────────────
output "cockroach_connection_string" {
  description = "CockroachDB connection string (sensitive)"
  value       = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
  sensitive   = true
}
