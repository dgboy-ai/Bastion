import boto3

region = 'ap-south-1'

# Check S3
s3 = boto3.client('s3', region_name=region)
try:
    buckets = s3.list_buckets()['Buckets']
    print(f"S3: {len(buckets)} buckets")
    for b in buckets:
        print(f"  {b['Name']}")
except Exception as e:
    print(f"S3: {e}")

# Check Lambda
lam = boto3.client('lambda', region_name=region)
try:
    funcs = lam.list_functions()['Functions']
    print(f"Lambda: {len(funcs)} functions")
except Exception as e:
    print(f"Lambda: {e}")

# Check IAM for Lambda-compatible roles
iam = boto3.client('iam', region_name=region)
try:
    roles = iam.list_roles()['Roles']
    lambda_roles = [r for r in roles if 'lambda' in r['RoleName'].lower() or 'execution' in r['RoleName'].lower()]
    print(f"IAM Roles: {len(roles)} total, {len(lambda_roles)} Lambda-compatible")
    for r in lambda_roles:
        print(f"  {r['RoleName']}: {r['Arn']}")
except Exception as e:
    print(f"IAM: {e}")
