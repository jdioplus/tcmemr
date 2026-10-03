#!/usr/bin/env python3
"""Build an entirely local file:// semantic-retrieval page or add it to an existing HTML.

No target-machine download, install or server is required. Only reviewed official ORT
distribution code is included; the Hub repository contributes model data and JSON.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json

ROOT = Path(__file__).resolve().parent
MODEL_HASHES = {
    'model_quantized.onnx': '99a6e522710c00220c89f8c52e0cc5aa09d4cbb1c34c0e932eab3a9dfdc65df3',
    'model_quantized.onnx_data': '952623481ca8beea884e3d3c9ecaf8a3c7bf1d0c21de29e970cd31af9d37a90b',
}

def read_asset(name):
    value = (ROOT / 'assets' / name).read_bytes()
    if name in MODEL_HASHES and hashlib.sha256(value).hexdigest() != MODEL_HASHES[name]:
        raise ValueError(f'Official model SHA256 mismatch: {name}')
    return value

def inline_script(text):
    return '<script>' + text.replace('</', '<\\/') + '</script>'

def semantic_scripts():
    assets = {
        'model': base64.b64encode(read_asset('model_quantized.onnx')).decode(),
        'weights': base64.b64encode(read_asset('model_quantized.onnx_data')).decode(),
        'wasm': base64.b64encode(read_asset('ort-wasm-simd-threaded.wasm')).decode(),
        'module': base64.b64encode(read_asset('ort-wasm-simd-threaded.mjs')).decode(),
        'tokenizer': json.loads(read_asset('tokenizer.json')),
    }
    payload = 'window.BINGLI_SEMANTIC_ASSETS=' + json.dumps(assets, ensure_ascii=False, separators=(',', ':')) + ';'
    runtime = read_asset('ort.wasm.min.js').decode()
    own = (ROOT / 'semantic.js').read_text()
    licenses = (ROOT / 'sources' / 'ort-LICENSE.txt').read_text() + '\n' + (ROOT / 'sources' / 'flagembedding-LICENSE.txt').read_text()
    notices = (ROOT / 'sources' / 'ort-ThirdPartyNotices.txt').read_text()
    attribution = '<script id="semanticLicenses" type="text/plain">' + (licenses + '\n' + notices).replace('</', '<\\/') + '</script>'
    return attribution + inline_script(runtime) + inline_script(payload) + inline_script(own)

DEMO = '''<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地中文语义检索试验</title>
<style>body{font:16px/1.65 system-ui;max-width:900px;margin:24px auto;padding:0 18px;color:#16333b}textarea{box-sizing:border-box;width:100%;min-height:95px;font:inherit}button{font:inherit;padding:9px 20px;background:#087a76;color:white;border:0;border-radius:6px}li{padding:12px 0;border-bottom:1px solid #ddd}#status{color:#546973}small{color:#59696e}</style>
<h1>本地中文语义检索试验</h1><p>中文编码器对已有语料排序。相似分数不代表诊断概率；本页不生成病程、不自动给出诊疗决定。</p>
<label for="query">输入要查找的病情</label><textarea id="query">化疗后乏力，血红蛋白下降，进食减少</textarea><p><button id="search">查找相关语料</button></p><p id="status" role="status">模型尚未载入，点击查找后在本机运行。</p><ol id="results"></ol>
<!--SEMANTIC-->
<script>
const DOCS=[
{id:'anemia',text:'肿瘤患者乏力伴血红蛋白下降，评估贫血的程度和动态变化，结合网织红细胞、铁代谢、出血及既往治疗情况分析可能原因。'},
{id:'intake',text:'肿瘤患者进食减少、体重下降时，核对实际能量和蛋白摄入，评估营养状态、恶心呕吐、吞咽问题及消化道症状，复查相关指标。'},
{id:'infection',text:'出现发热、咳嗽和新发肺部影像变化时，应结合感染、肿瘤进展、药物或放射治疗相关肺损伤等可能性进行鉴别，完善针对性检查。'},
{id:'staging',text:'肺癌分期需注明所采用的TNM版本及临床或病理前缀，依据原发肿瘤、区域淋巴结和远处转移证据核对，不以单项症状替代分期依据。'},
{id:'tcm',text:'中医辨证须结合已提供的症状、舌象和脉象。肝胃不和的一般病机为肝失疏泄、胃失和降；应由医师核实对应四诊依据。'},
{id:'unrelated',text:'文件导出后可以使用浏览器打开，窗口宽度改变时按钮会自动换行，查询结果在当前页面显示。'}];
window.addEventListener('bingli-semantic-status',e=>{const s=e.detail;document.getElementById('status').textContent=s.state==='searching'?'正在匹配 '+s.completedChunks+'/'+s.totalChunks+' 段语料':s.state==='ready'?'模型已就绪，全部在本机运行':s.state==='error'?s.lastError:'正在本机载入模型…';});
document.getElementById('search').addEventListener('click',async()=>{const b=document.getElementById('search');b.disabled=true;try{const matches=await BingliSemantic.search(document.getElementById('query').value,DOCS,{limit:4});const list=document.getElementById('results');list.replaceChildren();for(const m of matches){const li=document.createElement('li');li.textContent=m.text+'（语义相似分数 '+m.score.toFixed(3)+'）';list.append(li);}}catch(e){document.getElementById('status').textContent=e.message;}finally{b.disabled=false;}});
</script></html>'''

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, help='Optional HTML to enhance; inserts scripts before </body>.')
    parser.add_argument('--output', type=Path, default=ROOT / 'semantic-demo.html')
    args = parser.parse_args()
    scripts = semantic_scripts()
    if args.input:
        source = args.input.read_text()
        if source.lower().count('</body>') != 1:
            raise ValueError('Expected exactly one closing body tag.')
        source = source.replace('</body>', scripts + '</body>')
    else:
        source = DEMO.replace('<!--SEMANTIC-->', scripts)
    args.output.write_text(source)
    data = args.output.read_bytes()
    print(json.dumps({'file': str(args.output.resolve()), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}, ensure_ascii=False))

if __name__ == '__main__':
    main()
