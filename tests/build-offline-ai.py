"""Build the self-contained browser runtime; the model is selected from local parts."""
from pathlib import Path
import argparse, importlib.util, json, hashlib
ROOT=Path(__file__).resolve().parent.parent

def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'test-results/integrated-ai/病历书写AI.html')
    parser.add_argument('--manifest',type=Path)
    args=parser.parse_args()
    semantic=module('semantic_build',ROOT/'semantic/build-semantic.py')
    writer=module('writer_build',ROOT/'generative/build-generative.py')
    page=(ROOT/'病历书写简版.html').read_text()
    manifest=json.loads(args.manifest.read_text()) if args.manifest else None
    scripts=semantic.semantic_scripts()+writer.writer_scripts(manifest_override=manifest)
    scripts+='<script>'+(ROOT/'minimal/local-writer-ui.js').read_text().replace('</','<\\/')+'</script>'
    at=page.rfind('</body>')
    if at<0:raise ValueError('Expected outer body')
    page=page[:at]+scripts+page[at:]
    page=page.replace('<title>病历书写简版</title>','<title>病历书写AI离线实验版</title>').replace('<h1>病历书写简版</h1>','<h1>病历书写AI · 实验版</h1>').replace('完整语料 · 离线使用','本地模型 · 离线使用')
    data=page.encode();assert len(data)<100_000_000
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(data)
    print(json.dumps({'path':str(args.output.resolve()),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},ensure_ascii=False))

if __name__=='__main__':main()
