import boto3
iam = boto3.client('iam', region_name='ap-south-1')
roles = iam.list_roles()['Roles']
print(f"Total roles: {len(roles)}")
for r in roles[:20]:
    print(f"  {r['RoleName']}: {r['Arn']}")
