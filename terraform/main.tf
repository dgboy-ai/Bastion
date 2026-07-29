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

# ──────────────────────────────────────────────────────────────
# CockroachDB Cloud Cluster
# NOTE: BASIC plan does NOT support vector indexes (C-SPANN).
#       Use STANDARD or ADVANCED for vector index support.
# ──────────────────────────────────────────────────────────────
resource "cockroachlabs_cockroachcloud_cluster" "bastion" {
  name           = "bastion-hackathon"
  cloud_provider = "AWS"
  plan           = var.cockroach_plan

  # Use STANDARD plan for C-SPANN vector index support
  dedicated_config {
    region_nodes = {
      "${var.aws_region}" = {
        node_count = 3
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
          "kms:GenerateDataKey"
        ]
        Resource = "*"
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
      BASTION_CONN       = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
      BASTION_HMAC_SECRET = var.bastion_hmac_secret
      BASTION_S3_BUCKET  = aws_s3_bucket.bastion_artifacts.id
      AWS_REGION         = var.aws_region
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
