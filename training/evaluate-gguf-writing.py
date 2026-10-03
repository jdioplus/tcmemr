"""Local native Q2_K regression, independent of adapter selection and browser UI.

Uses exactly the sealed chat inputs. Saves untouched stdout/stderr as well as
cleaned output and literal checks. A native result is not a browser UI check.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import time

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('writing_eval', ROOT / 'evaluate-writing.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


def run(args):
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1')
    metadata = checks.verify_sealed(args.data)
    selection = json.loads(args.selection.read_text())
    if selection.get('holdoutTestUsed') is not False:
        raise ValueError('Checkpoint selection must be frozen validation-only before holdout')
    if args.out.exists():
        raise ValueError('Preserve original results: choose a new --out directory')
    rows = [row for row in json.loads((args.data / 'eval-cases.json').read_text())['cases'] if row['split'] == 'test']
    messages = [json.loads(line)['messages'] for line in (args.data / 'test.jsonl').read_text().splitlines() if line.strip()]
    if len(rows) != metadata['counts']['test'] or len(messages) != len(rows):
        raise ValueError('Holdout count differs from metadata')
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(str(args.base), local_files_only=True, trust_remote_code=False)
    args.out.mkdir(parents=True)
    results = []
    for row, chat in zip(rows, messages):
        if json.loads(chat[1]['content']) != row['input'] or chat[0]['content'] != metadata['contract']['system']:
            raise ValueError('Chat contract differs: ' + row['id'])
        prompt = tokenizer.apply_chat_template(chat[:-1], tokenize=False, add_generation_prompt=True)
        prompt_path = args.out / (row['id'] + '.prompt.txt')
        prompt_path.write_text(prompt)
        command = [str(args.cli), '-m', str(args.model), '-f', str(prompt_path), '-no-cnv', '-n', str(args.max_tokens), '--temp', '0', '--top-k', '20', '--top-p', '0.8', '--repeat-penalty', str(args.repeat_penalty), '--repeat-last-n', str(args.repeat_last_n), '--seed', '20261004', '--simple-io', '--no-display-prompt', '--no-escape', '--log-verbosity', '0', '--offline', '-ngl', '0', '-t', str(args.threads)]
        start = time.time()
        completed = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout, env=os.environ.copy())
        elapsed = round((time.time() - start) * 1000)
        (args.out / (row['id'] + '.stdout.txt')).write_text(completed.stdout)
        (args.out / (row['id'] + '.stderr.txt')).write_text(completed.stderr)
        # This exact suffix is CLI decoration, never clinical content.
        output = completed.stdout.strip()
        ended = output.endswith('[end of text]')
        if ended:
            output = output[:-len('[end of text]')].rstrip()
        scored = checks.score(row, output)
        suspected_truncation = not ended
        if completed.returncode != 0 or suspected_truncation:
            scored['literalChecksPassed'] = False
        result = {'id':row['id'], 'suite':'holdout', 'variant':'trained-native-q2-k', 'output':output, 'returncode':completed.returncode, 'elapsedMs':elapsed, 'endOfTextSuffixPresent':ended, 'suspectedTruncation':suspected_truncation, 'inputSha256':hashlib.sha256(chat[1]['content'].encode()).hexdigest(), 'command':command, 'checks':scored}
        (args.out / (row['id'] + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        (args.out / (row['id'] + '.txt')).write_text(output + '\n')
        results.append(result)
        print(row['id'], 'literalPass=' + str(scored['literalChecksPassed']), 'exit=' + str(completed.returncode), 'ms=' + str(elapsed), flush=True)
    manifest = {'schemaVersion':1, 'runtime':'native-llama.cpp-Q2_K', 'model':str(args.model), 'modelSha256':checks.sha(args.model), 'cliSha256':checks.sha(args.cli), 'selection':selection['selected']['name'], 'datasetFiles':metadata['files'], 'sampling':{'temperature':0,'topK':20,'topP':0.8,'repetitionPenalty':args.repeat_penalty,'repetitionContextSize':args.repeat_last_n,'maxTokens':args.max_tokens,'seed':20261004}, 'holdoutUsedForSelection':False,'clinicalQualification':False, 'limits':'Literal checks can flag valid paraphrases and miss unlisted medical errors. Native execution does not test the browser application or its review safeguards.', 'summary':checks.summarize(results), 'results':results}
    (args.out / 'results.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(manifest['summary'], ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=Path, default=ROOT / 'data-v2')
    parser.add_argument('--base', type=Path, default=ROOT / 'base-model')
    parser.add_argument('--selection', type=Path, default=ROOT / 'experiment-v2/validation-selection.json')
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--cli', type=Path, default=ROOT / 'tools/llama-build/bin/llama-completion')
    parser.add_argument('--out', type=Path, default=ROOT / 'experiment-v2/native-writing-evaluation')
    parser.add_argument('--max-tokens', type=int, default=512)
    parser.add_argument('--repeat-penalty', type=float, default=1.1)
    parser.add_argument('--repeat-last-n', type=int, default=64)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--timeout', type=int, default=120)
    run(parser.parse_args())
