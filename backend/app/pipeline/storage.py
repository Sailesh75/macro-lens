"""Photo storage on S3. Not wired into routes/meals.py yet — waiting on an
IAM user + bucket (see backend/README.md for setup steps). Written now so
it's a small change to flip on once those exist, same pattern as vision.py/
usda.py before their keys existed.
"""

import uuid

import boto3

from app.config import get_settings


def _client():
    settings = get_settings()
    if not (settings.aws_access_key_id and settings.aws_secret_access_key and settings.s3_bucket_name):
        raise RuntimeError("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET_NAME not set — see backend/.env.example")
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region or None,
    )


def upload_photo(image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    """Uploads one meal photo, returns its S3 object URL for storing in
    meals.image_url.
    """
    settings = get_settings()
    key = f"meal-photos/{uuid.uuid4()}.jpg"
    _client().put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=image_bytes,
        ContentType=content_type,
    )
    region = settings.aws_region or "us-east-1"
    return f"https://{settings.s3_bucket_name}.s3.{region}.amazonaws.com/{key}"
