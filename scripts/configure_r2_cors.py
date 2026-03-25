"""
Configure R2 bucket CORS rules for HLS streaming.

Allows cross-origin GET and HEAD requests with Range header support
from the application domain. Required for HLS segment fetching.

Usage:
    uv run python scripts/configure_r2_cors.py
    uv run python scripts/configure_r2_cors.py --dry-run
"""

import os
import sys
from pathlib import Path

# ─── Project Setup ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"


def load_env():
    """Load .env file into os.environ (simple parser, no dependency needed)."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def main():
    load_env()

    dry_run = "--dry-run" in sys.argv

    # Validate required env vars
    required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]
    missing = [var for var in required if not os.environ.get(var)]
    if missing:
        print(f"Error: Missing required environment variable(s): {', '.join(missing)}")
        sys.exit(2)

    cors_rules = [
        {
            "AllowedOrigins": ["http://localhost:3000"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedHeaders": ["Range", "Content-Type"],
            "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
            "MaxAgeSeconds": 86400,
        }
    ]

    bucket = os.environ["R2_BUCKET_NAME"]

    if dry_run:
        import json
        print(f"DRY RUN: Would apply CORS to bucket '{bucket}':")
        print(json.dumps(cors_rules, indent=2))
        return

    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    client.put_bucket_cors(
        Bucket=bucket,
        CORSConfiguration={"CORSRules": cors_rules},
    )

    print(f"CORS configured on bucket '{bucket}':")
    print(f"  AllowedOrigins: https://pradotube.com, http://localhost:3000")
    print(f"  AllowedMethods: GET, HEAD")
    print(f"  AllowedHeaders: Range, Content-Type")
    print(f"  ExposeHeaders: Content-Length, Content-Range, Accept-Ranges")
    print(f"  MaxAgeSeconds: 86400")


if __name__ == "__main__":
    main()
