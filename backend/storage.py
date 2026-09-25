"""Optional S3-compatible object storage for VOD / recordings (boto3)."""
import mimetypes
from pathlib import Path

import boto3
from botocore.client import Config

_DEFAULT = {"enabled": False, "endpoint_url": "", "region": "us-east-1",
            "bucket": "", "access_key": "", "secret_key": "", "public_base": ""}


def merged(cfg: dict | None) -> dict:
    c = dict(_DEFAULT)
    if cfg:
        for k in _DEFAULT:
            if k in cfg and cfg[k] is not None:
                c[k] = cfg[k]
    return c


def masked(cfg: dict | None) -> dict:
    c = merged(cfg)
    return {**c, "access_key": (c["access_key"][:4] + "…") if c["access_key"] else "",
            "secret_key": "••••••" if c["secret_key"] else "",
            "has_credentials": bool(c["access_key"] and c["secret_key"])}


def _client(cfg: dict):
    c = merged(cfg)
    kwargs = {"region_name": c["region"] or "us-east-1",
              "aws_access_key_id": c["access_key"],
              "aws_secret_access_key": c["secret_key"],
              "config": Config(signature_version="s3v4")}
    if c["endpoint_url"]:
        kwargs["endpoint_url"] = c["endpoint_url"]
    return boto3.client("s3", **kwargs)


def test_connection(cfg: dict) -> dict:
    c = merged(cfg)
    if not (c["bucket"] and c["access_key"] and c["secret_key"]):
        return {"ok": False, "error": "Bucket and credentials are required."}
    try:
        _client(cfg).head_bucket(Bucket=c["bucket"])
        return {"ok": True, "message": f"Connected to bucket '{c['bucket']}'."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def public_url(cfg: dict, key: str) -> str:
    c = merged(cfg)
    if c["public_base"]:
        return f"{c['public_base'].rstrip('/')}/{key}"
    if c["endpoint_url"]:
        return f"{c['endpoint_url'].rstrip('/')}/{c['bucket']}/{key}"
    return f"https://{c['bucket']}.s3.{c['region']}.amazonaws.com/{key}"


def upload_dir(cfg: dict, local_dir: str, key_prefix: str) -> str:
    """Upload every file in local_dir to bucket under key_prefix. Return master.m3u8 URL."""
    c = merged(cfg)
    client = _client(cfg)
    base = Path(local_dir)
    for f in base.iterdir():
        if not f.is_file():
            continue
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if f.suffix == ".m3u8":
            ctype = "application/vnd.apple.mpegurl"
        elif f.suffix == ".ts":
            ctype = "video/mp2t"
        client.upload_file(str(f), c["bucket"], f"{key_prefix}/{f.name}",
                           ExtraArgs={"ContentType": ctype})
    return public_url(cfg, f"{key_prefix}/master.m3u8")
