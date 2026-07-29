"""AWS Cost Analysis for Bastion - What's Actually Needed."""

# AWS Free Tier Limits (as of 2026)
FREE_TIER = {
    "bedrock": {
        "description": "Amazon Bedrock Titan V2 Embeddings",
        "free_tier": "50M tokens/month",
        "cost_per_1k_tokens": "$0.0001",
        "our_usage": "~100 queries/day = ~10K tokens/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": True,
        "reason": "Core: generates embeddings for vector search",
    },
    "s3": {
        "description": "Amazon S3 Storage",
        "free_tier": "5GB storage, 20K GET, 2K PUT requests/month",
        "cost_per_gb": "$0.023",
        "our_usage": "~100MB memory archives/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": True,
        "reason": "Memory archives with Glacier lifecycle",
    },
    "kms": {
        "description": "AWS KMS Encryption",
        "free_tier": "20,000 free requests/month",
        "cost_per_1k_requests": "$0.03",
        "our_usage": "~100 encrypt/decrypt/day = 3K/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": True,
        "reason": "AES-256-GCM envelope encryption for memory content",
    },
    "lambda": {
        "description": "AWS Lambda Functions",
        "free_tier": "1M requests, 400K GB-seconds/month",
        "cost_per_1k_requests": "$0.20",
        "our_usage": "~100 invocations/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": True,
        "reason": "CDC handler for self-healing + webhook dispatcher",
    },
}

# What the hackathon requires
HACKATHON_REQUIREMENTS = {"min_aws_services": 1, "recommended_aws_services": 2, "cost_limit": "$0 (free tier)"}

# What we should use
RECOMMENDED_SERVICES = {
    "bedrock": {
        "why": "Generates embeddings for vector search - CORE FEATURE",
        "cost": "$0 (free tier)",
        "risk": "Throttling if too many requests",
    },
    "lambda": {"why": "CDC handler for self-healing - CORE FEATURE", "cost": "$0 (free tier)", "risk": "None"},
    "s3": {"why": "Memory archives for audit trail - NICE TO HAVE", "cost": "$0 (free tier)", "risk": "None"},
}


def print_cost_analysis():
    print("=" * 70)
    print("  AWS COST ANALYSIS FOR BASTION")
    print("=" * 70)
    print()

    # Required services
    print("REQUIRED FOR HACKATHON:")
    print("-" * 70)
    for service, info in FREE_TIER.items():
        if info["needed"]:
            print(f"  {service.upper()}")
            print(f"    What: {info['description']}")
            print(f"    Free tier: {info['free_tier']}")
            print(f"    Our usage: {info['our_usage']}")
            print(f"    Monthly cost: {info['monthly_cost']}")
            print()

    # Optional services
    print("OPTIONAL (NICE TO HAVE):")
    print("-" * 70)
    for service, info in FREE_TIER.items():
        if not info["needed"]:
            print(f"  {service.upper()}")
            print(f"    What: {info['description']}")
            print(f"    Free tier: {info['free_tier']}")
            print(f"    Our usage: {info['our_usage']}")
            print(f"    Monthly cost: {info['monthly_cost']}")
            print()

    # Total cost
    print("=" * 70)
    print("  TOTAL MONTHLY COST IF USING ALL SERVICES:")
    print("=" * 70)
    print()
    for service, _info in FREE_TIER.items():
        print(f"  {service.upper()}: $0.00 (within free tier)")
    print()
    print("  TOTAL: $0.00/month")
    print()

    # Recommendation
    print("=" * 70)
    print("  RECOMMENDATION")
    print("=" * 70)
    print()
    print("  All 4 services are within free tier:")
    print("    1. Bedrock - Core (embeddings)")
    print("    2. Lambda - Core (CDC handler + webhook dispatcher)")
    print("    3. S3 - Memory archives with Glacier lifecycle")
    print("    4. KMS - AES-256-GCM envelope encryption")
    print()
    print("  Total monthly cost: $0.00 (all within free tier)")
    print()


if __name__ == "__main__":
    print_cost_analysis()
