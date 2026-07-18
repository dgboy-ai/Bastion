variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "hackathon"
}

variable "bastion_hmac_secret" {
  description = "HMAC secret for hash chain integrity"
  type        = string
  sensitive   = true
  default     = ""
}

variable "cockroach_plan" {
  description = "CockroachDB Cloud plan (BASIC, STANDARD, ADVANCED)"
  type        = string
  default     = "BASIC"
}
