"""Build a single, portable HTML page from the existing offline engines."""
from pathlib import Path
import json
import importlib.util

root=Path(__file__).resolve().parent.parent
s=(root/'123-v6.3.html').read_text()
spec=importlib.util.spec_from_file_location('prose',root/'tests/update-clinical-prose.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
s=mod.revised(s)
public_spec=importlib.util.spec_from_file_location('public_examples',root/'tests/sanitize-public-examples.py')
public_examples=importlib.util.module_from_spec(public_spec);public_spec.loader.exec_module(public_examples)
s=public_examples.sanitize(s)
decoder=json.JSONDecoder()
def constant(name):
    start=s.index('=',s.index('const '+name))+1
    obj,_=decoder.raw_decode(s[start:].lstrip())
    return obj
profiles=constant('TCM_PROFILES')
constants='const TCM_PROFILES='+json.dumps(profiles,ensure_ascii=False)+';\n'
constants+='const TCM_DISEASES='+json.dumps(constant('TCM_DISEASES'),ensure_ascii=False)+';\n'
constants+='const V5_HERB_DATA='+json.dumps(constant('V5_HERB_DATA'),ensure_ascii=False)+';\n'
rs=s.index('const REPORT_SOURCES');re_=s.index("if(typeof module!=='undefined'&&module.exports)module.exports={analyzePastedReport",rs)
report=s[rs:re_]
cs=s.rfind('(function',0,s.index('  function analyzeProblems'));ce=s.index('})(globalThis);',cs)+len('})(globalThis);')
clinical=s[cs:ce].replace('g.V5Clinical={','g.V63Facts={positive:e=>positiveSegments(recordedSymptoms(e).symptoms).join("；")};\n  g.V5Clinical={')
rxs=s.index('/* Offline, evidence-tagged formula');rxe=s.index('function initV5Workbench',rxs)
rx=s[rxs:rxe]
ps=s.index('/* Deterministic text extraction');pe=s.index('/* One reviewed quick-note transaction',ps)
parser=s[ps:pe]
book_path=root/'knowledge/ancient-books.json'
books=json.loads(book_path.read_text()) if book_path.exists() else []
if isinstance(books,dict):books=books.get('entries',[])
engines=constants+report+clinical+rx+parser+(root/'tests/decision-rules.js').read_text()+(root/'tests/decision-review-ui.js').read_text()
engines+='\nconst ANCIENT_BOOKS='+json.dumps(books,ensure_ascii=False).replace('</','<\\/')+';\n'
for name,rel in [('SKILL_RULES','knowledge/skill-adaptations/rules.json'),('USER_NOTE_FORMATS','knowledge/user-note-formats.json')]:
    engines+='\nconst '+name+'='+json.dumps(json.loads((root/rel).read_text()),ensure_ascii=False)+';\n'
western=[]
for fp in sorted((root/'knowledge/western-updates').glob('*.json')):
    pack=json.loads(fp.read_text());western.extend(pack.get('entries',pack.get('cancers',[])))
engines+='\nconst WESTERN_UPDATES='+json.dumps({'reviewedAt':'2026-10-04','entries':western},ensure_ascii=False)+';\n'
licenses={p.name:p.read_text() for p in (root/'knowledge/skill-adaptations').glob('*.txt')}
engines+='\nconst SKILL_LICENSE_TEXTS='+json.dumps(licenses,ensure_ascii=False)+';\n'

legacy_spec=importlib.util.spec_from_file_location('legacy',root/'tests/build-legacy-tools.py')
legacy=importlib.util.module_from_spec(legacy_spec);legacy_spec.loader.exec_module(legacy)
engines+='\nconst LEGACY_APP_HTML='+json.dumps(legacy.prepare_legacy(s),ensure_ascii=False)+';\n'
for rel in ['minimal/record-parser.js','minimal/clinical-analysis.js','minimal/western-knowledge.js','minimal/legacy-tools.js','minimal/writing-policy.js']:
    if (root/rel).exists():engines+='\n'+(root/rel).read_text()
page=(root/'minimal/page.html').read_text()
notice_start='<!-- SOURCE_ENTRY_NOTICE_START -->'
notice_end='<!-- SOURCE_ENTRY_NOTICE_END -->'
assert page.count(notice_start)==page.count(notice_end)==1,'Expected one source-only entry notice'
begin=page.index(notice_start);end=page.index(notice_end,begin)+len(notice_end)
page=page[:begin]+page[end:]
page=page.replace('<!-- ENGINES -->','<script>'+engines.replace('</script','<\\/script')+'</script>')
page=page.replace('<!-- APP -->','<script>'+((root/'minimal/app.js').read_text()+'\n'+(root/'minimal/examples.js').read_text()).replace('</script','<\\/script')+'</script>')
(root/'病历书写简版.html').write_text(page)
print('Built 病历书写简版.html:',len(page.encode()),'bytes,',len(profiles),'syndromes,',len(books),'book excerpts')
