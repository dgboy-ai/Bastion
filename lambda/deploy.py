"""Deploy Lambda functions to AWS.

Usage:
    python lambda/deploy.py --conn "postgresql://..." --stack bastion-lambda

Requires: aws-cli configured, SAM CLI installed.
"""

import argparse
import os
import subprocess
import sys
import zipfile
import tempfile


def package_lambda():
    """Create deployment package with shared dependencies."""
    print("Packaging Lambda functions...")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        pkg_dir = os.path.join(tmpdir, "package")
        os.makedirs(pkg_dir)
        
        # Copy shared code
        shared_dir = os.path.join(os.path.dirname(__file__), "shared")
        os.makedirs(os.path.join(pkg_dir, "shared"), exist_ok=True)
        for f in os.listdir(shared_dir):
            if f.endswith(".py"):
                src = os.path.join(shared_dir, f)
                dst = os.path.join(pkg_dir, "shared", f)
                with open(src, "rb") as fin, open(dst, "wb") as fout:
                    fout.write(fin.read())
        
        # Copy handler code
        for func_dir in ["cdc_handler", "webhook_dispatcher"]:
            src = os.path.join(os.path.dirname(__file__), func_dir, "handler.py")
            dst = os.path.join(pkg_dir, f"{func_dir}_handler.py")
            with open(src, "rb") as fin, open(dst, "wb") as fout:
                fout.write(fin.read())
        
        # Install dependencies
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            "psycopg[binary]", "-t", pkg_dir, "--quiet"
        ], check=True)
        
        # Create zip
        zip_path = os.path.join(os.path.dirname(__file__), "bastion_lambda.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(pkg_dir):
                for f in files:
                    full = os.path.join(root, f)
                    arcname = os.path.relpath(full, pkg_dir)
                    zf.write(full, arcname)
        
        print(f"Packaged: {zip_path}")
        return zip_path


def deploy_sam(conn_string, stack_name, region="us-east-1"):
    """Deploy using SAM CLI."""
    template = os.path.join(os.path.dirname(__file__), "template.yaml")
    
    cmd = [
        "sam", "deploy",
        "--template-file", template,
        "--stack-name", stack_name,
        "--region", region,
        "--capabilities", "CAPABILITY_IAM",
        "--no-confirm-changeset",
        "--parameter-overrides",
        f"BastionConn={conn_string}",
    ]
    
    print(f"Deploying to AWS: {stack_name}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Deploy failed:\n{result.stderr}")
        sys.exit(1)
    
    print(f"Deployed successfully:\n{result.stdout}")


def main():
    parser = argparse.ArgumentParser(description="Deploy Bastion Lambda functions")
    parser.add_argument("--conn", required=True, help="CockroachDB connection string")
    parser.add_argument("--stack", default="bastion-lambda", help="CloudFormation stack name")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--package-only", action="store_true", help="Only create zip, don't deploy")
    args = parser.parse_args()
    
    zip_path = package_lambda()
    
    if not args.package_only:
        deploy_sam(args.conn, args.stack, args.region)


if __name__ == "__main__":
    main()
