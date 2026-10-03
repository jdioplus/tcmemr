"""Offline, deterministic holdout comparison; does not select a checkpoint.

Run with training/.venv/bin/python on the production machine with Metal access.
Literal tests expose specific omissions and additions, not clinical competence.
"""
from pathlib import Path
import argparse
import gc
import hashlib
import json
import os
import re
import time

ROOT = Path(__file__).resolve().parent


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def normalize(text):
    return re.sub(r'\s+', '', str(text)).replace('µ', 'μ').replace('℃', '°C')


DATE = re.compile(r'\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?')
MEASURE = re.compile(r'(?<![\d.])\d+(?:\.\d+)?\s*(?:g/dL|g/L|mg/dL|mg/L|mmol/L|μmol/L|mIU/L|IU/mL|U/mL|U/L|ng/mL|copies/mL|μg|mg|mL|kg|℃|°C|%)(?![A-Za-z])', re.I)
PENDING = re.compile(r'(?:分期|TNM)[^。；;\n]{0,12}(?:未填写|未录入|未提供|尚未提供)')


def unique(items):
    return list(dict.fromkeys(items))


def score(case, output):
    expected = case['expected']
    required = expected['required']
    forbidden = expected['forbidden']
    norm = normalize(output)
    missing = [fact for fact in required if normalize(fact) not in norm]
    leaked = [fact for fact in forbidden if normalize(fact) in norm]
    reference = expected['referenceOutput']
    dates = unique(DATE.findall(reference))
    measures = unique(MEASURE.findall(reference))
    absent_dates = [date for date in dates if normalize(date) not in norm]
    absent_measures = [item for item in measures if normalize(item) not in norm]
    negatives = [item for item in required if re.search(r'无|未|否认|不能|尚未|不沿用|不改变', item)]
    absent_negatives = [item for item in negatives if normalize(item) not in norm]
    input_text = json.dumps(case['input'], ensure_ascii=False)
    new_measures = [item for item in unique(MEASURE.findall(output)) if normalize(item) not in normalize(input_text)]
    new_dates = [item for item in unique(DATE.findall(output)) if normalize(item) not in normalize(input_text)]
    headings = expected.get('preserveHeadings', [])
    positions = [output.find(heading) for heading in headings]
    heading_order = all(pos >= 0 for pos in positions) and positions == sorted(positions)
    added_headings = [line.strip() for line in output.splitlines() if line.strip().endswith('：') and line.strip() not in headings]
    explanations = [word for word in ('以下是整理', '以下为整理', '整理后的', '作为AI', '资料不足', '不能认定', '根据语料库', '未采纳原文') if word in output]
    # Detect repeated nonempty whole lines without judging clinical phrasing.
    lines = [line.strip() for line in output.splitlines() if len(line.strip()) >= 8]
    repeated = unique(line for line in lines if lines.count(line) > 2)
    unrequested_stage_notes = PENDING.findall(output) if not PENDING.search(reference) else []
    passed = bool(output.strip()) and not any((missing, leaked, absent_dates, absent_measures, absent_negatives, new_measures, new_dates, added_headings, explanations, repeated, unrequested_stage_notes)) and heading_order
    return {
        'literalChecksPassed': passed,
        'required': {'total': len(required), 'retained': len(required) - len(missing), 'missing': missing},
        'dates': {'total': len(dates), 'retained': len(dates) - len(absent_dates), 'missing': absent_dates, 'new': new_dates},
        'numericUnits': {'total': len(measures), 'retained': len(measures) - len(absent_measures), 'missing': absent_measures, 'new': new_measures},
        'negationUncertainty': {'total': len(negatives), 'retained': len(negatives) - len(absent_negatives), 'missing': absent_negatives},
        'forbiddenFactsFound': leaked,
        'format': {'headingsRetainedInOrder': heading_order, 'headings': headings, 'positions': positions, 'addedHeadings': added_headings, 'explanations': explanations, 'repeatedLines': repeated},
        'unrequestedStageMissingNotes': unrequested_stage_notes
    }


def summarize(results):
    groups = {}
    for group in ('holdout', 'challenge'):
        rows = [row for row in results if row['suite'] == group]
        if not rows:
            continue
        stats = {'cases': len(rows), 'literalChecksPassed': sum(row['checks']['literalChecksPassed'] for row in rows), 'casesWithForbiddenFacts': sum(bool(row['checks']['forbiddenFactsFound']) for row in rows), 'casesWithAddedMeasures': sum(bool(row['checks']['numericUnits']['new']) for row in rows)}
        for key in ('required', 'dates', 'numericUnits', 'negationUncertainty'):
            total = sum(row['checks'][key]['total'] for row in rows)
            retained = sum(row['checks'][key]['retained'] for row in rows)
            stats[key] = {'retained': retained, 'total': total, 'rate': round(retained / total, 4) if total else None}
        groups[group] = stats
    return groups


def verify_sealed(data):
    metadata = json.loads((data / 'metadata.json').read_text())
    for name, entry in metadata['files'].items():
        if sha(data / name) != entry['sha256']:
            raise ValueError('Sealed dataset changed: ' + name)
    return metadata


def run(args):
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_DATASETS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1', WANDB_MODE='disabled', HF_HOME=str(ROOT / 'hf-cache'))
    data = args.data.resolve()
    metadata = verify_sealed(data)
    selection = json.loads(args.selection.read_text())
    if selection.get('holdoutTestUsed') is not False:
        raise ValueError('Selection must be recorded as validation-only before holdout evaluation')
    tests = [case for case in json.loads((data / 'eval-cases.json').read_text())['cases'] if case['split'] == 'test']
    test_messages = [json.loads(line)['messages'] for line in (data / 'test.jsonl').read_text().splitlines() if line.strip()]
    if len(tests) != metadata['counts']['test'] or len(test_messages) != len(tests):
        raise ValueError('Sealed holdout count differs from metadata')
    inputs = []
    for case, messages in zip(tests, test_messages):
        source = json.loads(messages[1]['content'])
        if source != case['input'] or messages[0]['content'] != metadata['contract']['system']:
            raise ValueError('Prompt contract mismatch: ' + case['id'])
        inputs.append((case, messages[:-1], 'holdout'))
    if args.challenge:
        challenge = json.loads(args.challenge.read_text())
        for case in challenge['cases']:
            user = json.dumps(case['input'], ensure_ascii=False, separators=(',', ':'))
            messages = [{'role': 'system', 'content': metadata['contract']['system']}, {'role': 'user', 'content': user}]
            inputs.append((case, messages, 'challenge'))
    if args.out.exists():
        raise ValueError('Evaluation directory already exists; preserve raw results and choose a new --out')
    args.out.mkdir(parents=True)
    (args.out / 'inputs.json').write_text(json.dumps([{'id': case['id'], 'suite': suite, 'messages': messages} for case, messages, suite in inputs], ensure_ascii=False, indent=2) + '\n')
    (args.out / 'validation-selection.json').write_text(json.dumps(selection, ensure_ascii=False, indent=2) + '\n')
    # Import only after offline variables and sealed inputs have been validated.
    import mlx.core as mx
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler, make_logits_processors
    manifest = {
        'schemaVersion': 2, 'sampling': {'temperature': 0, 'greedy': True, 'maxTokens': args.max_tokens, 'seed': 20261004, 'repetitionPenalty': args.repeat_penalty, 'repetitionContextSize': args.repeat_last_n},
        'datasetFiles': metadata['files'], 'selectionDataset': selection['selectionDataset'], 'selectedCheckpoint': selection['selected']['name'],
        'base': str(args.base.resolve()), 'adapter': str(args.adapter.resolve()), 'adapterSha256': sha(args.adapter / 'adapters.safetensors'),
        'holdoutUsedForSelection': False, 'clinicalQualification': False,
        'metricLimits': 'Literal checks may flag valid paraphrases and may miss unlisted clinical errors; raw outputs require review. MLX4bit comparison is distinct from the distributed Q2_K browser model.',
        'challengeSha256': sha(args.challenge) if args.challenge else None
    }
    comparison = {}
    for variant, adapter in (('base', None), ('trained', args.adapter)):
        print('LOAD', variant, flush=True)
        model, tokenizer = load(str(args.base), adapter_path=str(adapter) if adapter else None, tokenizer_config={'trust_remote_code': False}, trust_remote_code=False)
        results = []
        folder = args.out / variant
        folder.mkdir()
        for index, (case, messages, suite) in enumerate(inputs, 1):
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            mx.random.seed(20261004)
            start = time.time()
            processors = make_logits_processors(repetition_penalty=args.repeat_penalty, repetition_context_size=args.repeat_last_n)
            output = generate(model, tokenizer, prompt=prompt, max_tokens=args.max_tokens, sampler=make_sampler(temp=0), logits_processors=processors, verbose=False)
            elapsed = round((time.time() - start) * 1000)
            checks = score(case, output)
            estimated_tokens = len(tokenizer.encode(output))
            suspected_truncation = estimated_tokens >= args.max_tokens
            if suspected_truncation:
                checks['literalChecksPassed'] = False
            row = {'id': case['id'], 'suite': suite, 'variant': variant, 'inputSha256': hashlib.sha256(messages[1]['content'].encode()).hexdigest(), 'output': output, 'elapsedMs': elapsed, 'estimatedGeneratedTokens': estimated_tokens, 'suspectedTruncation': suspected_truncation, 'checks': checks}
            results.append(row)
            (folder / (case['id'] + '.json')).write_text(json.dumps(row, ensure_ascii=False, indent=2) + '\n')
            (folder / (case['id'] + '.txt')).write_text(output + '\n')
            print(variant, index, '/', len(inputs), case['id'], 'literalPass=' + str(checks['literalChecksPassed']), 'ms=' + str(elapsed), flush=True)
        stats = summarize(results)
        comparison[variant] = stats
        (folder / 'results.json').write_text(json.dumps({'summary': stats, 'results': results}, ensure_ascii=False, indent=2) + '\n')
        del model, tokenizer
        gc.collect()
        mx.clear_cache()
    manifest['comparison'] = comparison
    (args.out / 'comparison.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(comparison, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=ROOT / 'data')
    parser.add_argument('--base', type=Path, default=ROOT / 'base-model')
    parser.add_argument('--adapter', type=Path, default=ROOT / 'experiment-v1/selected-adapter')
    parser.add_argument('--selection', type=Path, default=ROOT / 'experiment-v1/validation-selection.json')
    parser.add_argument('--out', type=Path, default=ROOT / 'experiment-v1/writing-evaluation')
    parser.add_argument('--challenge', type=Path)
    parser.add_argument('--max-tokens', type=int, default=512)
    parser.add_argument('--repeat-penalty', type=float, default=1.1)
    parser.add_argument('--repeat-last-n', type=int, default=64)
    run(parser.parse_args())
