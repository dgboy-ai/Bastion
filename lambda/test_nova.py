import boto3
import json

client = boto3.client('bedrock-runtime', region_name='ap-south-1')

# Nova needs messages format
body = json.dumps({
    "messages": [{"role": "user", "content": [{"text": "Hello"}]}],
    "max_tokens": 50
})

for model_id in ['amazon.nova-pro-v1:0', 'amazon.nova-lite-v1:0', 'amazon.nova-micro-v1:0']:
    try:
        resp = client.invoke_model(
            modelId=model_id,
            body=body,
            contentType='application/json',
            accept='application/json',
        )
        result = json.loads(resp['body'].read())
        print(f"WORKS: {model_id}")
        print(f"  Response: {str(result)[:200]}")
        break
    except Exception as e:
        err = str(e)[:120]
        print(f"FAIL: {model_id} - {err}")
