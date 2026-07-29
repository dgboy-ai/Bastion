"""Check IAM user permissions."""

import os

os.environ["AWS_ACCESS_KEY_ID"] = "AWS_ACCESS_KEY_REMOVED"
os.environ["AWS_SECRET_ACCESS_KEY"] = "AWS_SECRET_KEY_REMOVED"
os.environ["AWS_REGION"] = "ap-south-1"

import boto3

iam = boto3.client("iam", region_name="ap-south-1")

try:
    user = iam.get_user(UserName="swasthai-app-user")
    print(f"User: {user['User']['UserName']}")
    print(f"ARN: {user['User']['Arn']}")
    print(f"Created: {user['User']['CreateDate']}")

    # Get attached policies
    policies = iam.list_attached_user_policies(UserName="swasthai-app-user")
    print(f"\nAttached policies: {len(policies['Policies'])}")
    for p in policies["Policies"]:
        print(f"  - {p['PolicyName']}")

except Exception as e:
    print(f"Error: {e}")
