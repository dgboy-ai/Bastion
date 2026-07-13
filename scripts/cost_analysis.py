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
        "reason": "Core: generates embeddings for vector search"
    },
    "s3": {
        "description": "Amazon S3 Storage",
        "free_tier": "5GB storage, 20K GET, 2K PUT requests/month",
        "cost_per_gb": "$0.023",
        "our_usage": "~100MB memory archives/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": False,
        "reason": "Nice-to-have: memory archives, not required for demo"
    },
    "kms": {
        "description": "AWS KMS Encryption",
        "free_tier": "20,000 free requests/month",
        "cost_per_1k_requests": "$0.03",
        "our_usage": "~100 encrypt/decrypt/day = 3K/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": False,
        "reason": "Nice-to-have: encryption, not required for demo"
    },
    "sns": {
        "description": "Amazon SNS Alerts",
        "free_tier": "1M publishes, 100K HTTP deliveries/month",
        "cost_per_1k_requests": "$0.50",
        "our_usage": "~10 alerts/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": False,
        "reason": "Nice-to-have: alerts, not required for demo"
    },
    "sqs": {
        "description": "Amazon SQS Queue",
        "free_tier": "1M free requests/month",
        "cost_per_1k_requests": "$0.40",
        "our_usage": "~100 messages/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": False,
        "reason": "Nice-to-have: retries, not required for demo"
    },
    "lambda": {
        "description": "AWS Lambda Functions",
        "free_tier": "1M requests, 400K GB-seconds/month",
        "cost_per_1k_requests": "$0.20",
        "our_usage": "~100 invocations/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": True,
        "reason": "Core: CDC handler for self-healing"
    },
    "eventbridge": {
        "description": "Amazon EventBridge",
        "free_tier": "14M events/month",
        "cost_per_1M_events": "$1.00",
        "our_usage": "~100 events/month",
        "monthly_cost": "$0.00 (within free tier)",
        "needed": False,
        "reason": "Nice-to-have: keep-alive, not required for demo"
    }
}

# What the hackathon requires
HACKATHON_REQUIREMENTS = {
    "min_aws_services": 1,
    "recommended_aws_services": 2,
    "cost_limit": "$0 (free tier)"
}

# What we should use
RECOMMENDED_SERVICES = {
    "bedrock": {
        "why": "Generates embeddings for vector search - CORE FEATURE",
        "cost": "$0 (free tier)",
        "risk": "Throttling if too many requests"
    },
    "lambda": {
        "why": "CDC handler for self-healing - CORE FEATURE",
        "cost": "$0 (free tier)",
        "risk": "None"
    },
    "s3": {
        "why": "Memory archives for audit trail - NICE TO HAVE",
        "cost": "$0 (free tier)",
        "risk": "None"
    }
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
    total = 0
    for service, info in FREE_TIER.items():
        print(f"  {service.upper()}: $0.00 (within free tier)")
    print()
    print("  TOTAL: $0.00/month")
    print()
    
    # Recommendation
    print("=" * 70)
    print("  RECOMMENDATION")
    print("=" * 70)
    print()
    print("  Use ONLY these 2-3 services:")
    print("    1. Bedrock - Core (embeddings)")
    print("    2. Lambda - Core (CDC handler)")
    print("    3. S3 - Optional (archives)")
    print()
    print("  Why NOT use all 7:")
    print("    - More IAM permissions needed")
    print("    - More complexity for judges to understand")
    print("    - No additional value for demo")
    print("    - All within free tier anyway")
    print()
    print("  Cost with 2-3 services: $0.00/month")
    print("  Cost with all 7 services: $0.00/month")
    print()

if __name__ == "__main__":
    print_cost_analysis()
