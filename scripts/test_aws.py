"""Test all AWS services used by Bastion."""
import os
import json

os.environ['AWS_ACCESS_KEY_ID'] = 'AKIAYX2RXYZ56HJMWZOC'
os.environ['AWS_SECRET_ACCESS_KEY'] = '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'
os.environ['AWS_REGION'] = 'ap-south-1'

import boto3

results = {}

# Test 1: Bedrock
print("=== Testing Bedrock ===")
try:
    client = boto3.client('bedrock-runtime', region_name='ap-south-1')
    body = json.dumps({"inputText": "test", "dimensions": 1024, "normalize": True})
    response = client.invoke_model(
        modelId='amazon.titan-embed-text-v2:0',
        body=body,
        contentType='application/json',
        accept='application/json'
    )
    result = json.loads(response['body'].read())
    print(f"Bedrock: WORKS - embedding dimensions: {len(result.get('embedding', []))}")
    results['bedrock'] = True
except Exception as e:
    print(f"Bedrock: FAILED - {type(e).__name__}: {e}")
    results['bedrock'] = False

# Test 2: S3
print("\n=== Testing S3 ===")
try:
    s3 = boto3.client('s3', region_name='ap-south-1')
    buckets = s3.list_buckets()['Buckets']
    print(f"S3: WORKS - {len(buckets)} buckets")
    for b in buckets[:5]:
        print(f"  - {b['Name']}")
    results['s3'] = True
except Exception as e:
    print(f"S3: FAILED - {type(e).__name__}: {e}")
    results['s3'] = False

# Test 3: KMS
print("\n=== Testing KMS ===")
try:
    kms = boto3.client('kms', region_name='ap-south-1')
    keys = kms.list_keys()['Keys']
    print(f"KMS: WORKS - {len(keys)} keys")
    results['kms'] = True
except Exception as e:
    print(f"KMS: FAILED - {type(e).__name__}: {e}")
    results['kms'] = False

# Test 4: SNS
print("\n=== Testing SNS ===")
try:
    sns = boto3.client('sns', region_name='ap-south-1')
    topics = sns.list_topics()['Topics']
    print(f"SNS: WORKS - {len(topics)} topics")
    for t in topics[:3]:
        print(f"  - {t['TopicArn'].split(':')[-1]}")
    results['sns'] = True
except Exception as e:
    print(f"SNS: FAILED - {type(e).__name__}: {e}")
    results['sns'] = False

# Test 5: SQS
print("\n=== Testing SQS ===")
try:
    sqs = boto3.client('sqs', region_name='ap-south-1')
    queues = sqs.list_queues().get('QueueUrls', [])
    print(f"SQS: WORKS - {len(queues)} queues")
    for q in queues[:3]:
        print(f"  - {q.split('/')[-1]}")
    results['sqs'] = True
except Exception as e:
    print(f"SQS: FAILED - {type(e).__name__}: {e}")
    results['sqs'] = False

# Test 6: Lambda
print("\n=== Testing Lambda ===")
try:
    lam = boto3.client('lambda', region_name='ap-south-1')
    functions = lam.list_functions()['Functions']
    print(f"Lambda: WORKS - {len(functions)} functions")
    for f in functions[:5]:
        print(f"  - {f['FunctionName']}")
    results['lambda'] = True
except Exception as e:
    print(f"Lambda: FAILED - {type(e).__name__}: {e}")
    results['lambda'] = False

# Test 7: EventBridge
print("\n=== Testing EventBridge ===")
try:
    eb = boto3.client('events', region_name='ap-south-1')
    rules = eb.list_rules()['Rules']
    print(f"EventBridge: WORKS - {len(rules)} rules")
    for r in rules[:3]:
        print(f"  - {r['Name']}")
    results['eventbridge'] = True
except Exception as e:
    print(f"EventBridge: FAILED - {type(e).__name__}: {e}")
    results['eventbridge'] = False

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
