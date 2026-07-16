import boto3
import json

client = boto3.client('bedrock-runtime', region_name='us-west-2')
try:
    resp = client.invoke_model(
        modelId='amazon.titan-embed-text-v2:0',
        body=json.dumps({"inputText": "hello world", "dimensions": 1024, "normalize": True}),
        contentType='application/json',
        accept='application/json',
    )
    result = json.loads(resp['body'].read())
    print(f"Bedrock WORKS! Embedding dims: {len(result['embedding'])}")
    print(f"First 5 values: {result['embedding'][:5]}")
except Exception as e:
    print(f"Bedrock FAILED: {e}")
