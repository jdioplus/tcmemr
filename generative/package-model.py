#!/usr/bin/env python3
"""Package an exported GGUF for offline File[] loading. Does not train or quantize it."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import tempfile

ROOT = Path(__file__).resolve().parent
PART_BYTES = 90_000_000

def sha256_file(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def package_model(model, output, training_metadata=None, model_name=None, model_license=None, source_url=None):
    model = Path(model).resolve()
    output = Path(output).resolve()
    if not model.is_file():
        raise FileNotFoundError(f'GGUF not found: {model}')
    with model.open('rb') as source:
        header = source.read(24)
    if len(header) < 24 or header[:4] != b'GGUF' or struct.unpack('<I', header[4:8])[0] not in (2, 3):
        raise ValueError('Input does not have a supported GGUF v2/v3 header.')
    size = model.stat().st_size
    count = math.ceil(size / PART_BYTES)
    if count > 99:
        raise ValueError('More than 99 parts exceed this loader filename format.')
    metadata = None
    metadata_hash = None
    if training_metadata is not None:
        metadata_path = Path(training_metadata)
        metadata = json.loads(metadata_path.read_text())
        if not isinstance(metadata, dict):
            raise ValueError('Training metadata must be a JSON object.')
        metadata_hash = sha256_file(metadata_path)
    full_hash = sha256_file(model)
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'manifest.json').exists():
        old = json.loads((output / 'manifest.json').read_text())
        if old.get('model', {}).get('sha256') != full_hash:
            raise FileExistsError('Output already contains a different model manifest; choose a new directory.')
    prefix = re.sub(r'[^\w.\-\u3400-\u9fff]+', '-', model.name, flags=re.UNICODE).strip('.-')
    if not prefix:
        raise ValueError('Model filename cannot produce a safe part prefix.')
    expected_names = [f'{prefix}.part{i:02}-of-{count:02}.bin' for i in range(1, count + 1)]
    baseline = json.loads((ROOT / 'manifest.json').read_text())
    known_official = full_hash == baseline['model']['sha256']
    license_value = model_license or (metadata or {}).get('license') or (metadata or {}).get('modelLicense')
    if not license_value and known_official:
        license_value = baseline['model'].get('license')
    if not license_value:
        license_value = 'UNVERIFIED'
    url = source_url or (metadata or {}).get('sourceUrl') or (baseline['model'].get('url') if known_official else None)
    manifest = {
        'model': {'name': model_name or model.stem, 'filename': model.name, 'bytes': size, 'sha256': full_hash, 'license': license_value},
        'parts': [],
        'runtime': baseline['runtime'],
        'packaging': {'partBytes': PART_BYTES, 'method': 'Raw ordered byte slices; browser Blob merge, not GGUF tensor shards', 'ggufVersion': struct.unpack('<I', header[4:8])[0]},
        'licensing': {'model': license_value, 'runtime': 'MIT (wllama and llama.cpp); Apache-2.0 (wasm-feature-detect)'}
    }
    if url:
        manifest['model']['url'] = url
    if metadata is not None:
        manifest['trainingMetadata'] = metadata
        manifest['trainingMetadataSha256'] = metadata_hash
        manifest['model']['baseModel'] = metadata.get('baseModel', metadata.get('base_model', 'not specified'))
    # Validate pre-existing parts before writing anything. A retry with identical bytes
    # is safe; an unrelated file with the expected name is never silently replaced.
    with model.open('rb') as source:
        for index, name in enumerate(expected_names, 1):
            data = source.read(PART_BYTES)
            part = {'index': index, 'name': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            target = output / name
            if target.exists() and (target.stat().st_size != part['bytes'] or sha256_file(target) != part['sha256']):
                raise FileExistsError(f'Output part differs from source: {target.name}')
            manifest['parts'].append(part)
        if source.read(1):
            raise ValueError('Source size changed while packaging.')
    with tempfile.TemporaryDirectory(prefix='.model-package-', dir=output) as temp:
        temporary = Path(temp)
        with model.open('rb') as source:
            for part in manifest['parts']:
                data = source.read(part['bytes'])
                if hashlib.sha256(data).hexdigest() != part['sha256']:
                    raise ValueError('Source changed while packaging; no files were installed.')
                target = output / part['name']
                if not target.exists():
                    (temporary / part['name']).write_bytes(data)
        if sha256_file(model) != full_hash:
            raise ValueError('Source changed while packaging; no files were installed.')
        (temporary / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        if metadata is not None:
            (temporary / 'training-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
        licenses = ['wllama-LICENCE.txt', 'llama-cpp-LICENSE.txt', 'wasm-feature-detect-LICENSE.txt']
        base = (metadata or {}).get('baseModel', (metadata or {}).get('base_model', ''))
        base_name = base.get('name', base.get('repo', '')) if isinstance(base, dict) else str(base)
        upstream_name = base.get('upstream', '') if isinstance(base, dict) else ''
        if license_value == 'Apache-2.0' and (known_official or base_name.startswith('Qwen/') or str(upstream_name).startswith('Qwen/')):
            licenses.append('Qwen-LICENSE.txt')
        for name in licenses:
            shutil.copyfile(ROOT / 'sources' / name, temporary / name)
        for artifact in temporary.iterdir():
            artifact.replace(output / artifact.name)
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--training-metadata', type=Path)
    parser.add_argument('--model-name')
    parser.add_argument('--model-license', help='Explicit license; absent source information is marked UNVERIFIED.')
    parser.add_argument('--source-url')
    args = parser.parse_args()
    manifest = package_model(args.model, args.out, args.training_metadata, args.model_name, args.model_license, args.source_url)
    print(json.dumps({'output': str(args.out.resolve()), 'name': manifest['model']['name'], 'bytes': manifest['model']['bytes'], 'sha256': manifest['model']['sha256'], 'parts': len(manifest['parts']), 'largestPartBytes': max(p['bytes'] for p in manifest['parts']), 'license': manifest['model']['license']}, ensure_ascii=False))

if __name__ == '__main__':
    main()
