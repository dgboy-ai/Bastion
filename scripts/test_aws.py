"""Test AWS services used by Bastion.

Requires environment variables:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
"""
import os
import json
import boto3

region = os.environ.get("AWS_REGION", "ap-south-1")
results = {}

# Test 1: KMS
print("=== Testing KMS ===")
try:
    kms = boto3.client("kms", region_name=region)
    keys = kms.list_keys()["Keys"]
    print(f"KMS: WORKS - {len(keys)} keys")
    results["kms"] = True
except Exception as e:
    print(f"KMS: FAILED - {type(e).__name__}: {e}")
    results["kms"] = False

# Test 2: S3
print("\n=== Testing S3 ===")
try:
    s3 = boto3.client("s3", region_name=region)
    buckets = s3.list_buckets()["Buckets"]
    print(f"S3: WORKS - {len(buckets)} buckets")
    for b in buckets[:5]:
        print(f"  - {b['Name']}")
    results["s3"] = True
except Exception as e:
    print(f"S3: FAILED - {type(e).__name__}: {e}")
    results["s3"] = False

# Test 3: Bedrock
print("\n=== Testing Bedrock ===")
try:
    client = boto3.client("bedrock-runtime", region_name=region)
    body = json.dumps({"inputText": "test", "dimensions": 1024, "normalize": True})
    response = client.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    print(f"Bedrock: WORKS - embedding dimensions: {len(result.get('embedding', []))}")
    results["bedrock"] = True
except Exception as e:
    print(f"Bedrock: FAILED - {type(e).__name__}: {e}")
    results["bedrock"] = False

# Summary
print("\n" + "=" * 60)
print("  AWS SERVICES SUMMARY")
print("=" * 60)
for service, status in results.items():
    icon = "✅" if status else "❌"
    print(f"  {icon} {service}")

passed = sum(1 for v in results.values() if v)
total = len(results)
print(f"\n  Score: {passed}/{total} services working")
