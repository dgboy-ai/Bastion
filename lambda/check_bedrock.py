import boto3
import json

# Check model access in ap-south-1 (Mumbai)
print("=== ap-south-1 (Mumbai) ===")
br = boto3.client('bedrock', region_name='ap-south-1')
try:
    models = br.list_foundation_models()
    embed_models = [m for m in models.get('modelSummaries', []) if 'embed' in m['modelId'].lower()]
    for m in embed_models:
        status = m.get('modelLifecycle', {}).get('status', 'unknown')
        print(f"  {m['modelId']}: {status}")
except Exception as e:
    print(f"  Error: {e}")

# Check us-west-2
print("\n=== us-west-2 ===")
br2 = boto3.client('bedrock', region_name='us-west-2')
try:
    models2 = br2.list_foundation_models()
    embed_models2 = [m for m in models2.get('modelSummaries', []) if 'embed' in m['modelId'].lower()]
    for m in embed_models2:
        status = m.get('modelLifecycle', {}).get('status', 'unknown')
        print(f"  {m['modelId']}: {status}")
except Exception as e:
    print(f"  Error: {e}")

# Check cross-region inference
print("\n=== Cross-region inference profiles ===")
try:
    profiles = br.list_inference_profiles()
    for p in profiles.get('inferenceProfileSummaries', []):
        if 'embed' in p.get('inferenceProfileName', '').lower() or 'embed' in p.get('inferenceProfileId', '').lower():
            print(f"  {p['inferenceProfileId']}: {p.get('status', 'unknown')}")
except Exception as e:
    print(f"  Error: {e}")
