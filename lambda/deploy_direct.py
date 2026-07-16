"""Deploy Lambda functions directly via boto3 (no SAM CLI required).

Usage:
    python lambda/deploy_direct.py
"""

import os
import sys
import json
import zipfile
import tempfile
import time

import boto3


def create_deployment_package():
    """Create zip package with Lambda code and dependencies."""
    print("Creating deployment package...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        pkg_dir = os.path.join(tmpdir, "package")
        os.makedirs(pkg_dir)
        
        # Copy shared code
        base = os.path.dirname(__file__)
        shared_src = os.path.join(base, "shared")
        os.makedirs(os.path.join(pkg_dir, "shared"), exist_ok=True)
        for f in os.listdir(shared_src):
            if f.endswith(".py"):
                with open(os.path.join(shared_src, f), "rb") as fin:
                    with open(os.path.join(pkg_dir, "shared", f), "wb") as fout:
                        fout.write(fin.read())
        
        # Write __init__.py for shared module
        with open(os.path.join(pkg_dir, "shared", "__init__.py"), "w") as f:
            f.write("")
        
        # Copy handler code
        for func_dir, func_name in [("cdc_handler", "cdc_handler"), ("webhook_dispatcher", "webhook_dispatcher")]:
            src = os.path.join(base, func_dir, "handler.py")
            dst = os.path.join(pkg_dir, f"{func_name}.py")
            with open(src, "rb") as fin:
                with open(dst, "wb") as fout:
                    fout.write(fin.read())
        
        # Install psycopg
        print("Installing psycopg...")
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "psycopg[binary]", "-t", pkg_dir, "--quiet"
        ], check=True)
        
        # Create zip
        zip_path = os.path.join(base, "bastion_lambda.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(pkg_dir):
                for f in files:
                    full = os.path.join(root, f)
                    arcname = os.path.relpath(full, pkg_dir)
                    zf.write(full, arcname)
        
        print(f"Package created: {zip_path} ({os.path.getsize(zip_path)} bytes)")
        return zip_path


def deploy_lambda(function_name, handler_module, description, zip_path, conn_string):
    """Deploy or update a Lambda function."""
    region = os.environ.get("AWS_REGION", "ap-south-1")
    lambda_client = boto3.client("lambda", region_name=region)
    
    # Read zip content
    with open(zip_path, "rb") as f:
        zip_content = f.read()
    
    role_arn = os.environ.get("BASTION_LAMBDA_ROLE_ARN", "")
    if not role_arn:
        # Try to find an existing Lambda execution role
        iam = boto3.client("iam", region_name=region)
        for role_name in ["lambda-execution-role", "LambdaRole", "lambda-role"]:
            try:
                role = iam.get_role(RoleName=role_name)
                role_arn = role["Role"]["Arn"]
                break
            except iam.exceptions.NoSuchEntityException:
                continue
    
    if not role_arn:
        print("ERROR: No IAM role found. Set BASTION_LAMBDA_ROLE_ARN environment variable.")
        print("  Example: export BASTION_LAMBDA_ROLE_ARN='arn:aws:iam::ACCOUNT:role/ROLE_NAME'")
        print("  The role needs: AWSLambdaBasicExecutionRole policy")
        sys.exit(1)
    
    try:
        # Try to update existing function
        lambda_client.update_function_code(
            FunctionName=function_name,
            ZipFile=zip_content,
        )
        print(f"Updated: {function_name}")
    except lambda_client.exceptions.ResourceNotFoundException:
        # Create new function
        lambda_client.create_function(
            FunctionName=function_name,
            Runtime="python3.11",
            Role=role_arn,
            Handler=f"{handler_module}.handler",
            Code={"ZipFile": zip_content},
            Description=description,
            Timeout=60,
            MemorySize=256,
            Environment={
                "Variables": {
                    "BASTION_CONN": conn_string,
                }
            },
        )
        print(f"Created: {function_name}")
    
    # Wait for function to be active
    while True:
        config = lambda_client.get_function_configuration(FunctionName=function_name)
        if config["State"] == "Active":
            break
        print(f"  Waiting for {function_name} to become active...")
        time.sleep(2)
    
    return config["FunctionArn"]


def create_cloudwatch_rules(function_arns):
    """Create CloudWatch Events rules to trigger Lambda functions."""
    region = os.environ.get("AWS_REGION", "ap-south-1")
    events = boto3.client("events", region_name=region)
    lambda_client = boto3.client("lambda", region_name=region)
    
    # CDC Handler: every 5 minutes
    rule_name = "bastion-cdc-poll"
    events.put_rule(
        Name=rule_name,
        ScheduleExpression="rate(5 minutes)",
        State="ENABLED",
        Description="Bastion CDC anomaly polling",
    )
    events.put_targets(
        Rule=rule_name,
        Targets=[{
            "Id": "bastion-cdc",
            "Arn": function_arns["cdc"],
            "Input": json.dumps({"mode": "poll"}),
        }]
    )
    lambda_client.add_permission(
        FunctionName="bastion-cdc-handler",
        StatementId="cloudwatch-invoke",
        Action="lambda:InvokeFunction",
        Principal="events.amazonaws.com",
        SourceArn=events.describe_rule(Name=rule_name)["RuleArn"],
    )
    print(f"Created CloudWatch rule: {rule_name} (every 5 min)")
    
    # Webhook Dispatcher: every 1 minute
    rule_name = "bastion-webhook-dispatch"
    events.put_rule(
        Name=rule_name,
        ScheduleExpression="rate(1 minute)",
        State="ENABLED",
        Description="Bastion webhook notification dispatch",
    )
    events.put_targets(
        Rule=rule_name,
        Targets=[{
            "Id": "bastion-webhook",
            "Arn": function_arns["webhook"],
            "Input": json.dumps({"mode": "dispatch"}),
        }]
    )
    lambda_client.add_permission(
        FunctionName="bastion-webhook-dispatcher",
        StatementId="cloudwatch-invoke",
        Action="lambda:InvokeFunction",
        Principal="events.amazonaws.com",
        SourceArn=events.describe_rule(Name=rule_name)["RuleArn"],
    )
    print(f"Created CloudWatch rule: {rule_name} (every 1 min)")


def main():
    conn_string = os.environ.get("BASTION_CONN", "")
    if not conn_string:
        print("ERROR: BASTION_CONN environment variable not set")
        sys.exit(1)
    
    # Create deployment package
    zip_path = create_deployment_package()
    
    # Deploy functions
    cdc_arn = deploy_lambda(
        "bastion-cdc-handler",
        "cdc_handler",
        "Bastion CDC anomaly detector and self-healer",
        zip_path,
        conn_string,
    )
    
    webhook_arn = deploy_lambda(
        "bastion-webhook-dispatcher",
        "webhook_dispatcher",
        "Bastion A2A push notification dispatcher",
        zip_path,
        conn_string,
    )
    
    # Create CloudWatch rules
    create_cloudwatch_rules({"cdc": cdc_arn, "webhook": webhook_arn})
    
    print("\nDeployment complete!")
    print(f"  CDC Handler: {cdc_arn}")
    print(f"  Webhook Dispatcher: {webhook_arn}")


if __name__ == "__main__":
    import subprocess
    main()
