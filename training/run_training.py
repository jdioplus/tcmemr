"""Local QLoRA run and validation-only checkpoint selection. Never reads holdout test."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / ".venv/bin/python"
BIN = ROOT / ".venv/bin"
BASE = ROOT / "base-model"
RUN = ROOT / "experiment-v1"
DATA = ROOT / "data"
MAX_SEQ_LENGTH = 1024
LEARNING_RATE = 0.0001

def digest(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def environment():
    env = os.environ.copy()
    env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1",
               HF_HUB_DISABLE_TELEMETRY="1", DO_NOT_TRACK="1", WANDB_MODE="disabled",
               HF_HOME=str(ROOT / "hf-cache"))
    return env

def execute(args, log):
    print("RUN", " ".join(map(str, args)), flush=True)
    with log.open("w") as f:
        subprocess.run(list(map(str, args)), env=environment(), stdout=f, stderr=subprocess.STDOUT, check=True)
    print("DONE", log, flush=True)

def dataset(name):
    p = DATA / (name + ".jsonl")
    rows = [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
    if not rows or any(not r.get("messages") or r["messages"][-1]["role"] != "assistant" for r in rows):
        raise ValueError("Invalid chat dataset " + name)
    return p, {"name": name, "rows": len(rows), "sha256": digest(p)}

def train(steps):
    if (RUN / "train-result.json").exists():
        raise ValueError("Completed experiment exists; preserve it and use a new run directory")
    RUN.mkdir(exist_ok=True)
    data = RUN / "train-input"
    data.mkdir(exist_ok=True)
    datasets = []
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(str(BASE), local_files_only=True, trust_remote_code=False)
    for name in ("train", "valid"):
        p, metadata = dataset(name)
        rows = [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
        lengths = []
        for row in rows:
            encoded = tokenizer.apply_chat_template(row["messages"], tokenize=True,
                                                    add_generation_prompt=False)
            token_ids = encoded["input_ids"] if hasattr(encoded, "keys") else encoded
            if token_ids and isinstance(token_ids[0], list):
                token_ids = token_ids[0]
            lengths.append(len(token_ids))
        if max(lengths) > MAX_SEQ_LENGTH:
            raise ValueError(f"{name} contains a {max(lengths)}-token row; increase sequence length to avoid truncation")
        metadata["maximumChatTokens"] = max(lengths)
        shutil.copyfile(p, data / p.name)
        datasets.append(metadata)
    if (data / "test.jsonl").exists():
        raise ValueError("Holdout test must be absent from training input")
    params = {"steps": steps, "layers": 4, "rank": 8, "batchSize": 1,
              "learningRate": LEARNING_RATE, "maxSeqLength": MAX_SEQ_LENGTH, "maskPrompt": True,
              "checkpointEvery": 24, "seed": 20261004}
    start = time.time()
    args = [BIN / "mlx_lm.lora", "--model", BASE, "--train", "--data", data,
            "--adapter-path", RUN / "adapters", "--num-layers", "4", "--batch-size", "1",
            "--iters", str(steps), "--learning-rate", str(LEARNING_RATE), "--mask-prompt",
            "--max-seq-length", str(MAX_SEQ_LENGTH), "--steps-per-report", "8", "--steps-per-eval", "24",
            "--val-batches", "-1", "--save-every", "24", "--seed", "20261004"]
    execute(args, RUN / "train.log")
    result = {"status": "training_completed", "parameters": params, "datasets": datasets,
              "elapsedSeconds": round(time.time() - start, 3),
              "baseManifest": json.loads((ROOT / "base-model-manifest.json").read_text()),
              "holdoutTestUsed": False, "clinicalQualification": False,
              "adapters": [{"name": p.name, "bytes": p.stat().st_size, "sha256": digest(p)}
                           for p in sorted((RUN / "adapters").glob("*.safetensors"))]}
    (RUN / "train-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"status": result["status"], "elapsedSeconds": result["elapsedSeconds"]}), flush=True)

def select():
    if (RUN / "validation-selection.json").exists():
        raise ValueError("Checkpoint already selected; preserve the recorded selection")
    # Use the same source, lengths, and validation hashes recorded for this run.
    train_result = json.loads((RUN / "train-result.json").read_text())
    sequence_length = train_result["parameters"]["maxSeqLength"]
    # MLX's test-only command is used on a copy of VALIDATION, never on holdout.
    data = RUN / "validation-only"
    data.mkdir(exist_ok=True)
    source, metadata = dataset("valid")
    recorded_validation = next(r for r in train_result["datasets"] if r["name"] == "valid")
    if any(metadata[key] != recorded_validation[key] for key in ("name", "rows", "sha256")):
        raise ValueError("Validation dataset changed since training")
    shutil.copyfile(source, data / "test.jsonl")
    candidates = sorted((RUN / "adapters").glob("[0-9]*_adapters.safetensors"))
    final = RUN / "adapters/adapters.safetensors"
    if all(digest(p) != digest(final) for p in candidates):
        candidates.append(final)
    rows = []
    for candidate in [None] + candidates:
        name = "baseline" if candidate is None else candidate.stem
        dest = RUN / "validation-candidates" / name
        if candidate:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(RUN / "adapters/adapter_config.json", dest / "adapter_config.json")
            shutil.copyfile(candidate, dest / "adapters.safetensors")
        log = RUN / ("validation-" + name + ".log")
        execute([BIN / "mlx_lm.lora", "--model", BASE, "--test", "--data", data,
                 "--adapter-path", str(dest) if candidate else "", "--batch-size", "1",
                 "--test-batches", "-1", "--max-seq-length", str(sequence_length), "--mask-prompt", "--seed", "20261004"], log)
        clean = re.sub(r"\x1b\[[0-9;]*m", "", log.read_text())
        match = re.search(r"Test loss (\d+(?:\.\d+)?), Test ppl (\d+(?:\.\d+)?)", clean)
        if not match:
            raise ValueError("Validation loss was not reported")
        rows.append({"name": name, "validationLoss": float(match[1]), "perplexity": float(match[2]),
                     "adapter": str(candidate) if candidate else None, "log": str(log)})
    chosen = min((r for r in rows if r["adapter"]), key=lambda r: r["validationLoss"])
    dest = RUN / "selected-adapter"
    dest.mkdir(exist_ok=True)
    shutil.copyfile(RUN / "adapters/adapter_config.json", dest / "adapter_config.json")
    shutil.copyfile(chosen["adapter"], dest / "adapters.safetensors")
    result = {"selectionDataset": metadata, "holdoutTestUsed": False, "candidates": rows,
              "selected": chosen, "baselineValidationLoss": rows[0]["validationLoss"],
              "validationLossImproved": chosen["validationLoss"] < rows[0]["validationLoss"],
              "rule": "lowest validation completion loss among saved trained checkpoints; baseline retained as comparator",
              "clinicalQualification": False}
    (RUN / "validation-selection.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"selected": chosen["name"], "loss": chosen["validationLoss"],
                      "baselineLoss": rows[0]["validationLoss"]}), flush=True)

def fuse():
    selection = json.loads((RUN / "validation-selection.json").read_text())
    if (RUN / "fused-hf/model.safetensors").exists():
        raise ValueError("Fused model exists; preserve it")
    # MLX cannot export Qwen directly to GGUF; produce ordinary HF float weights.
    execute([BIN / "mlx_lm.fuse", "--model", BASE, "--adapter-path", RUN / "selected-adapter",
             "--save-path", RUN / "fused-hf", "--dequantize"], RUN / "fuse.log")
    p = RUN / "fused-hf"
    result = {"status": "fused_hf_created", "selectedCheckpoint": selection["selected"]["name"],
              "quantizedBaseDequantized": True, "ggufExported": False,
              "files": [{"name": f.name, "bytes": f.stat().st_size, "sha256": digest(f)}
                        for f in sorted(p.glob("*")) if f.is_file()]}
    (RUN / "fuse-result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["train", "select", "fuse"])
    parser.add_argument("--steps", type=int, default=96)
    parser.add_argument("--data-dir", type=Path, default=DATA)
    parser.add_argument("--run-dir", type=Path, default=RUN)
    parser.add_argument("--max-seq-length", type=int, default=MAX_SEQ_LENGTH)
    parser.add_argument("--learning-rate", type=float, default=LEARNING_RATE)
    args = parser.parse_args()
    DATA = args.data_dir.resolve()
    RUN = args.run_dir.resolve()
    MAX_SEQ_LENGTH = args.max_seq_length
    LEARNING_RATE = args.learning_rate
    if args.steps < 1 or MAX_SEQ_LENGTH < 1 or LEARNING_RATE <= 0:
        parser.error("Steps, sequence length, and learning rate must be positive")
    if args.stage == "train":
        train(args.steps)
    elif args.stage == "select":
        select()
    else:
        fuse()
