import boto3
import json
import time

print("Waiting 30s for rate limit reset...")
time.sleep(30)

client = boto3.client('bedrock-runtime', region_name='us-west-2')
try:
    resp = client.invoke_model(
        modelId='amazon.titan-embed-text-v2:0',
        body=json.dumps({"inputText": "test", "dimensions": 1024, "normalize": True}),
        contentType='application/json',
        accept='application/json',
    )
    result = json.loads(resp['body'].read())
    print(f"SUCCESS! Dims: {len(result['embedding'])}")
except Exception as e:
    print(f"FAILED: {e}")
