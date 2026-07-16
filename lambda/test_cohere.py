import boto3
import json

# Try cross-region inference profile for Cohere
client = boto3.client('bedrock-runtime', region_name='ap-south-1')
try:
    resp = client.invoke_model(
        modelId='global.cohere.embed-v4:0',
        body=json.dumps({'texts': ['hello world'], 'input_type': 'search_document'}),
        contentType='application/json',
        accept='application/json',
    )
    result = json.loads(resp['body'].read())
    print(f"Cohere cross-region WORKS! Dims: {len(result['embeddings'][0])}")
except Exception as e:
    print(f"Cohere cross-region: {str(e)[:150]}")
