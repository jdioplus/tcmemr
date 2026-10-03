"""Download a pinned public MLX model as data only, with size/hash verification."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = "mlx-community/Qwen2.5-0.5B-Instruct-4bit"
REVISION = "a5339a4131f135d0fdc6a5c8b5bbed2753bbe0f3"
TRANSPORT = "https://hf-mirror.com"
FILES = {"README.md", "added_tokens.json", "config.json", "merges.txt",
         "model.safetensors", "model.safetensors.index.json",
         "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json", "vocab.json"}

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def git_blob(path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def main():
    metadata = json.loads((ROOT / "model-metadata-mirror.json").read_text())
    if metadata["sha"] != REVISION or metadata["id"] != REPO:
        raise ValueError("Unexpected model revision/repository")
    dest = ROOT / "base-model"
    dest.mkdir(exist_ok=True)
    entries = [e for e in metadata["siblings"] if e["rfilename"] in FILES]
    if len(entries) != len(FILES) or sum(e["size"] for e in entries) > 400_000_000:
        raise ValueError("Unexpected model files/size")

    def fetch(entry):
        name = entry["rfilename"]
        p = dest / name
        def valid():
            return p.is_file() and p.stat().st_size == entry["size"] and (
                sha256(p) == entry["lfs"]["sha256"] if "lfs" in entry else git_blob(p) == entry["blobId"])
        if not valid():
            part = p.with_name(p.name + ".part")
            subprocess.run(["/usr/bin/curl", "-fL", "--retry", "2", "--retry-delay", "2",
                            "--connect-timeout", "15", "--max-time", "600",
                            "--max-filesize", str(entry["size"]), "--proto", "=https",
                            "--proto-redir", "=https", "-o", str(part),
                            f"{TRANSPORT}/{REPO}/resolve/{REVISION}/{name}"], check=True)
            if part.stat().st_size != entry["size"]:
                raise ValueError(f"Size mismatch: {name}")
            part.replace(p)
            if not valid():
                p.unlink()
                raise ValueError(f"Hash mismatch: {name}")
        print(f"VERIFIED {name}: {p.stat().st_size} bytes", flush=True)
        return {"name": name, "bytes": p.stat().st_size, "sha256": sha256(p)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        files = list(pool.map(fetch, entries))
    config = json.loads((dest / "config.json").read_text())
    if config.get("model_type") != "qwen2" or config.get("auto_map"):
        raise ValueError("Remote/custom model code is forbidden")
    token_config = json.loads((dest / "tokenizer_config.json").read_text())
    if token_config.get("auto_map"):
        raise ValueError("Remote tokenizer code is forbidden")
    manifest = {"repository": REPO, "revision": REVISION,
                "originalSource": f"https://huggingface.co/{REPO}/tree/{REVISION}",
                "transport": TRANSPORT, "metadataProvenance": "mirror metadata, official commit independently checked on HF web page",
                "upstreamBase": "Qwen/Qwen2.5-0.5B-Instruct", "license": "Apache-2.0",
                "trustRemoteCode": False, "files": files, "totalBytes": sum(f["bytes"] for f in files)}
    (ROOT / "base-model-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"model": str(dest), "totalBytes": manifest["totalBytes"], "revision": REVISION}), flush=True)

if __name__ == "__main__":
    main()
