import boto3
import json
import time

# Try different regions and models
regions = ["ap-south-1", "us-east-1", "us-west-2"]
models = [
    "amazon.titan-embed-text-v2:0",
    "amazon.titan-embed-text-v1",
    "cohere.embed-english-v3",
    "cohere.embed-multilingual-v3",
]

for region in regions:
    for model in models:
        try:
            client = boto3.client('bedrock-runtime', region_name=region)
            resp = client.invoke_model(
                modelId=model,
                body=json.dumps({"inputText": "test", "dimensions": 1024, "normalize": True}),
                contentType='application/json',
                accept='application/json',
            )
            result = json.loads(resp['body'].read())
            print(f"WORKS: {region} / {model} (dims: {len(result.get('embedding', []))})")
            break
        except Exception as e:
            err = str(e)[:80]
            print(f"FAIL: {region} / {model} - {err}")
        time.sleep(1)
    else:
        continue
    break
