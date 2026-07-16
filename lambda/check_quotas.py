import boto3

br = boto3.client('bedrock', region_name='ap-south-1')
try:
    profiles = br.list_provisioned_model_throughput()
    print(f"Provisioned throughput: {profiles.get('provisionedModelSummaries', [])}")
except Exception as e:
    print(f"No provisioned throughput: {e}")

models = br.list_foundation_models()
embed = [m for m in models.get('modelSummaries', []) if 'embed' in m['modelId'].lower()]
print(f"\nEmbedding models: {len(embed)}")
for m in embed:
    print(f"  {m['modelId']}")
