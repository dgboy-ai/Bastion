"""Create S3 bucket for Bastion memory archives."""
import boto3
import json
from datetime import datetime, timezone

region = 'ap-south-1'
bucket_name = 'bastion-memory-archives'

s3 = boto3.client('s3', region_name=region)

try:
    if region == 'us-east-1':
        s3.create_bucket(Bucket=bucket_name)
    else:
        s3.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={'LocationConstraint': region}
        )
    print(f"Created bucket: {bucket_name}")
except s3.exceptions.BucketAlreadyOwnedByYou:
    print(f"Bucket already exists: {bucket_name}")
except Exception as e:
    if 'BucketAlreadyExists' in str(e):
        print(f"Bucket already exists (global): {bucket_name}")
    else:
        print(f"Error: {e}")
        exit(1)

# Enable versioning
s3.put_bucket_versioning(
    Bucket=bucket_name,
    VersioningConfiguration={'Status': 'Enabled'}
)
print("Enabled versioning")

# Add lifecycle rule for Glacier transition
s3.put_bucket_lifecycle_configuration(
    Bucket=bucket_name,
    LifecycleConfiguration={
        'Rules': [
            {
                'ID': 'ArchiveToGlacier',
                'Status': 'Enabled',
                'Filter': {'Prefix': 'memories/'},
                'Transitions': [
                    {
                        'Days': 90,
                        'StorageClass': 'GLACIER'
                    }
                ],
                'Expiration': {'Days': 365}
            }
        ]
    }
)
print("Added lifecycle rule: 90-day Glacier transition, 365-day expiration")

# Upload sample archive
sample_data = {
    'agent_id': 'demo-agent',
    'memory_count': 25,
    'hash_chain_intact': True,
    'created_at': datetime.now(timezone.utc).isoformat(),
    'description': 'Bastion memory archive - initial backup'
}
s3.put_object(
    Bucket=bucket_name,
    Key='memories/demo-agent/archive-001.json',
    Body=json.dumps(sample_data, indent=2),
    ContentType='application/json',
    Metadata={
        'agent_id': 'demo-agent',
        'type': 'memory_archive'
    }
)
print(f"Uploaded sample archive to s3://{bucket_name}/memories/demo-agent/archive-001.json")

# Get bucket info
location = s3.get_bucket_location(Bucket=bucket_name)['LocationConstraint']
print(f"\nBucket ARN: arn:aws:s3:::{bucket_name}")
print(f"Region: {location}")
print(f"Versioning: Enabled")
print(f"Lifecycle: 90-day Glacier, 365-day expiration")
