#!/usr/bin/env python3
"""Embed official wllama runtime. Model stays in five checked local parts (<100MB each)."""
from pathlib import Path
import argparse
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parent
RUNTIME_HASHES = {
    'index.min.js': '29e4320f49c2d7a5b55233146d80f32a0b92443d8594fa88f06efa72f18238fa',
    'wllama.wasm': '529c780d43cb57cb9ac7ef4c42e16463afb0b2dec4ecaae9a6df8179c435fd71',
}

def runtime_asset(name):
    data = (ROOT / 'assets' / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != RUNTIME_HASHES[name]:
        raise ValueError(f'Pinned official runtime asset mismatch: {name}')
    return data

def writer_scripts(manifest_override=None):
    manifest = manifest_override if manifest_override is not None else json.loads((ROOT / 'manifest.json').read_text())
    payload = {
        'manifest': manifest,
        'module': base64.b64encode(runtime_asset('index.min.js')).decode(),
        'wasm': base64.b64encode(runtime_asset('wllama.wasm')).decode(),
    }
    def script(text):
        return '<script>' + text.replace('</', '<\\/') + '</script>'
    licenses = '\n\n'.join((ROOT / 'sources' / name).read_text() for name in ['Qwen-LICENSE.txt', 'wllama-LICENCE.txt', 'llama-cpp-LICENSE.txt', 'wasm-feature-detect-LICENSE.txt'])
    return '<script type="text/plain" id="writerLicenses">' + licenses.replace('</', '<\\/') + '</script>' + script('window.BINGLI_WRITER_ASSETS=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';') + script((ROOT / 'writer.js').read_text())

DEMO = '''<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地病历改写试验</title>
<style>body{font:16px/1.6 system-ui;max-width:960px;margin:20px auto;padding:0 16px;color:#153a3f}textarea{width:100%;box-sizing:border-box;min-height:130px;font:inherit;padding:10px}button{font:inherit;padding:10px 16px;margin:4px;border:0;border-radius:6px;background:#087a76;color:white}button:disabled{opacity:.55}input{max-width:100%}#status{color:#51686d}</style>
<h1>本地病历改写试验</h1><p>用现有 Chrome 直接打开。在一次选择中选齐 5 个模型分片，校验后在本机生成待审核候选；候选不会自动覆盖原文。</p>
<label for="parts">选择全部模型分片</label><input id="parts" type="file" multiple accept=".bin"><button id="load">载入模型</button><p id="status" role="status">模型尚未载入。</p>
<label for="original">原文与医师判断</label><textarea id="original">患者今日乏力，进食较前减少，无发热、无呕吐。今日血红蛋白86 g/L，较昨日92 g/L下降。医师考虑乏力与贫血和低摄入相关，拟结合复查血常规及铁代谢进一步评估。暂未提供舌脉资料。</textarea><p><button id="generate">生成待审核候选</button><button id="cancel">停止</button></p><label for="candidate">待审核候选</label><textarea id="candidate"></textarea>
<!--WRITER--><script>
window.addEventListener('bingli-writer-status',e=>{const s=e.detail;document.getElementById('status').textContent=s.error||s.progress?.message||({unloaded:'模型尚未载入',generating:'正在本机生成 '+s.generatedTokens+' tokens',stopping:'正在停止',ready:'模型已就绪，候选需审核'}[s.state]||s.state);});
document.getElementById('load').onclick=async()=>{const b=document.getElementById('load');b.disabled=true;try{await BingliWriter.loadParts(document.getElementById('parts').files);}catch(e){document.getElementById('status').textContent=e.message;}finally{b.disabled=false;}};
document.getElementById('generate').onclick=async()=>{const b=document.getElementById('generate');b.disabled=true;try{const r=await BingliWriter.generate(document.getElementById('original').value,{maxTokens:220,onToken:(piece,text)=>document.getElementById('candidate').value=text});document.getElementById('candidate').value=r.text;}catch(e){document.getElementById('status').textContent=e.message;}finally{b.disabled=false;}};
document.getElementById('cancel').onclick=()=>BingliWriter.cancel();
</script></html>'''

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'writer-demo.html')
    args = parser.parse_args()
    scripts = writer_scripts()
    if args.input:
        source = args.input.read_text()
        if source.lower().count('</body>') != 1:
            raise ValueError('Expected exactly one closing body tag')
        source = source.replace('</body>', scripts + '</body>')
    else:
        source = DEMO.replace('<!--WRITER-->', scripts)
    args.output.write_text(source)
    data = args.output.read_bytes()
    print(json.dumps({'file': str(args.output.resolve()), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}, ensure_ascii=False))

if __name__ == '__main__':
    main()
