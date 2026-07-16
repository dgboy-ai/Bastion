import boto3
br = boto3.client('bedrock', region_name='ap-south-1')
models = br.list_foundation_models()
nova = [m for m in models.get('modelSummaries', []) if 'nova' in m['modelId'].lower()]
print(f"Nova models: {len(nova)}")
for m in nova:
    print(f"  {m['modelId']}")
