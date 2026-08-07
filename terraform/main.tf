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
        Sid    = "AllowAppSignVerify"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
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
# Outputs (see outputs.tf for complete output definitions)
# ──────────────────────────────────────────────────────────────
output "cockroach_connection_string" {
  description = "CockroachDB connection string (sensitive)"
  value       = cockroachlabs_cockroachcloud_cluster.bastion.connection_string
  sensitive   = true
}
