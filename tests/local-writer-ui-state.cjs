/* Node VM + a minimal DOM stub: interface state only, not model quality or browser compatibility. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'minimal/local-writer-ui.js'),'utf8');
const policySource=fs.readFileSync(path.join(root,'minimal/writing-policy.js'),'utf8');
const checks=[];

function harness(result){
 const elements=new Map();
 class Element {
  constructor(id){this.id=id;this.value='';this.textContent='';this.checked=false;this.disabled=false;this.hidden=false;this.selectionStart=0;this.selectionEnd=0;this.files=[];this.type='';}
  set innerHTML(html){
   this.html=html;
   for(const m of html.matchAll(/<(?:input|button|textarea|div|p)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const el=new Element(m[1]);el.hidden=/\bhidden\b/.test(m[0]);el.disabled=/\bdisabled\b/.test(m[0]);el.checked=/\bchecked\b/.test(m[0]);el.readOnly=/\breadonly\b/.test(m[0]);elements.set(el.id,el);
   }
  }
  after(el){elements.set(el.id,el);}
  before(el){elements.set(el.id,el);}
  click(){if(!this.disabled)return this.onclick?.();}
  dispatchEvent(){if(this.id==='qNote')elements.get('qReviewed').checked=false;}
 }
 for(const id of ['qNote','qToday','qType','qCancer','qReviewed'])elements.set(id,new Element(id));
 elements.get('qType').value='日常病程记录';
 const api={loadParts:async()=>{api.loads=(api.loads||0)+1;},cancel(){api.cancelled=true;},generate:async(input,options)=>{
  api.lastInput=input;api.lastOptions=options;api.calls=(api.calls||0)+1;
  const out=typeof result==='function'?await result(input,api):result;
  if(out?.text!==undefined)options.onToken(out.text,out.text);
  return out;
 }};
 const context={document:{getElementById:id=>elements.get(id),createElement:()=>new Element(),querySelectorAll:()=>['qToday','qType','qCancer'].map(id=>elements.get(id))},BingliWriter:api,Event:class{},Date,console};
 vm.runInNewContext(policySource,context,{filename:'minimal/writing-policy.js'});
 vm.runInNewContext(source,context,{filename:'minimal/local-writer-ui.js'});
 const el=id=>elements.get(id);
 return {el,api,context,async load(){el('writerParts').files=[{name:'stub.bin'}];await el('writerParts').onchange();},async generate(text,start=0,end=0){el('qNote').value=text;el('qNote').selectionStart=start;el('qNote').selectionEnd=end;await el('writerGenerate').onclick();},review(){el('writerReviewed').checked=true;el('writerReviewed').onchange();},edit(text){el('writerCandidate').value=text;el('writerCandidate').oninput();}};
}

(async()=>{
 const original='患者今天乏力，无发热。血红蛋白86 g/L。拟明日复查血常规。';
 let h=harness(input=>({text:input.draft,usage:{elapsedMs:1234}}));await h.load();
 assert.match(h.el('writerStatus').textContent,/已载入，尚未修改正文/);
 assert.equal(h.api.calls,undefined);assert.equal(h.el('writerGenerate').disabled,false);checks.push('Loading reports readiness without implying a rewrite');
 await h.generate(original);assert.equal(h.el('writerOriginal').value,original);assert.equal(h.el('writerOriginal').readOnly,true);assert.equal(h.el('writerCandidate').value,original);assert.match(h.el('writerStatus').textContent,/完全相同，无改动/);assert.match(h.el('writerTiming').textContent,/1\.2 秒/);h.review();assert.equal(h.el('writerAccept').disabled,true);assert.equal(h.el('qNote').value,original);checks.push('Identical output shows original/candidate comparison and elapsed time, and cannot be adopted');
 h.edit(original.replace('今天','今日'));assert.equal(h.el('writerReviewed').checked,false);assert.equal(h.el('writerAccept').disabled,true);h.review();assert.equal(h.el('writerAccept').disabled,false);h.el('qReviewed').checked=true;h.el('writerAccept').click();assert.match(h.el('qNote').value,/今日/);assert.equal(h.el('qReviewed').checked,false);checks.push('An edited identical candidate can be adopted only after renewed review and resets final review');

 h=harness(input=>({text:input.draft.replace('今天','今日')}));await h.load();await h.generate('开头。今天乏力，无发热。结尾。',3,12);assert.equal(h.el('writerOriginal').value,'今天乏力，无发热。');assert.equal(h.el('qNote').value,'开头。今天乏力，无发热。结尾。');h.review();h.el('writerAccept').click();assert.equal(h.el('qNote').value,'开头。今日乏力，无发热。结尾。');checks.push('Selected paragraph adoption preserves surrounding text');

 h=harness(input=>({text:input.draft.replace('今天','今日')}));await h.load();await h.generate(original);h.el('qToday').value='另一例';h.review();h.el('writerAccept').click();assert.equal(h.el('qNote').value,original);assert.match(h.el('writerStatus').textContent,/已有修改/);checks.push('Changed patient input prevents stale adoption');

 h=harness(input=>({text:input.draft.replace('今天','今日')}));await h.load();await h.generate('  '+original+'\n');h.el('qNote').value=original+'\n';h.review();h.el('writerAccept').click();assert.equal(h.el('qNote').value,original+'\n');assert.match(h.el('writerStatus').textContent,/已有修改/);checks.push('Exact source snapshot detects whitespace edits and preserves original formatting');

 for(const flag of ['cancelled','truncated','repetition','incomplete']){
  h=harness({text:original.replace('今天','今日'),[flag]:true});await h.load();await h.generate(original);h.edit(original.replace('今天','今日'));h.review();assert.equal(h.el('writerAccept').disabled,true);assert.equal(h.el('qNote').value,original);
 }checks.push('Cancelled, truncated, repetitive and incomplete output remain blocked even after editing');

 h=harness(async(input,api)=>{api.waiting=true;await new Promise(resolve=>api.cancel=()=>resolve());return {text:'部分候选',cancelled:true};});await h.load();const pending=h.generate(original);await Promise.resolve();assert.equal(h.el('writerCancel').hidden,false);h.el('writerCancel').click();await pending;assert.equal(h.el('writerCancel').hidden,true);assert.match(h.el('writerStatus').textContent,/已停止/);checks.push('Stop controls retain the original and show cancellation');

 h=harness(input=>({text:input.draft}));await h.load();await h.generate('本次资料'.repeat(260));assert.equal(h.api.calls,undefined);assert.match(h.el('writerStatus').textContent,/1000字以内/);checks.push('Overlong unselected text does not call the model');

 h=harness(input=>({text:input.draft.replace('今天','今日')}));h.context.BingliExamples={context:async()=>{throw new Error('Constrained wording must not import example facts or free-text preferences');}};await h.load();await h.generate(original);assert.match(h.api.lastInput.judgments,/今天→今日/);assert.doesNotMatch(JSON.stringify(h.api.lastInput),/措辞简洁|42|黑便|紫杉醇/);assert.equal(h.api.lastOptions.grammar,h.context.BingliWritingPolicy.buildGrammar(original).grammar);checks.push('Only fixed wording choices and their exact grammar reach the model; example facts and preferences do not');

 for(const wrong of [original.replace('无发热','发热'),original.replace('86','68')]){
  h=harness({text:wrong});await h.load();await h.generate(original);h.review();assert.equal(h.el('writerAccept').disabled,true);assert.equal(h.el('qNote').value,original);assert.match(h.el('writerStatus').textContent,/超出/);assert.match(h.el('writerChanges').textContent,/暂不允许采用/);
 }checks.push('Model changes to negatives or numbers cannot be adopted even after review');

 h=harness(()=>{throw new Error('Fixed normalization must not call the model');});
 h.el('qNote').value='患者说今天没有发热；昨天报告还没出来，明天复查。';h.el('writerNormalize').click();
 assert.equal(h.api.loads,undefined);assert.equal(h.api.calls,undefined);assert.equal(h.el('writerCandidate').value,'患者诉今日无发热；昨日报告尚未回报，明日复查。');assert.equal(h.el('writerAccept').disabled,true);assert.match(h.el('writerCandidateSource').textContent,/固定用语整理；本次没有调用模型/);assert.equal(h.el('writerTiming').textContent,'');h.review();assert.equal(h.el('writerAccept').disabled,false);h.el('writerAccept').click();assert.equal(h.el('qNote').value,'患者诉今日无发热；昨日报告尚未回报，明日复查。');checks.push('Fixed normalization works without loading or calling the model, shows its source and requires review');

 h=harness(()=>{throw new Error('Fixed normalization must not call the model');});const longText='今天没有发热。\n'.repeat(200);h.el('qNote').value=longText;h.el('writerNormalize').click();assert.equal(h.el('writerCandidate').value,'今日无发热。\n'.repeat(200));assert.equal(h.api.calls,undefined);h.review();h.el('writerAccept').click();assert.equal(h.el('qNote').value,'今日无发热。\n'.repeat(200));checks.push('Fixed normalization handles an entire long note and preserves line structure');

 h=harness(()=>({text:''}));h.el('qNote').value='开头今天。今天没有发热。结尾今天。';h.el('qNote').selectionStart=5;h.el('qNote').selectionEnd=12;h.el('writerNormalize').click();assert.equal(h.el('writerOriginal').value,'今天没有发热。');h.review();h.el('writerAccept').click();assert.equal(h.el('qNote').value,'开头今天。今日无发热。结尾今天。');checks.push('Fixed normalization of a selection leaves all surrounding text unchanged');

 h=harness(()=>({text:''}));h.el('qNote').value='患者乏力，无发热。';h.el('writerNormalize').click();h.review();assert.equal(h.el('writerAccept').disabled,true);assert.match(h.el('writerStatus').textContent,/没有匹配/);assert.equal(h.api.calls,undefined);checks.push('Fixed normalization with no matching wording reports no change and cannot be adopted');

 h=harness(input=>({text:input.draft.replace('今天','今日')}));await h.load();await h.generate(original);assert.match(h.el('writerCandidateSource').textContent,/现有本地模型受限用语整理/);assert.equal(h.api.calls,1);h.edit(original.replace('86','68'));h.review();assert.equal(h.el('writerAccept').disabled,true);h.edit(original.replace('今天','今日'));h.review();assert.equal(h.el('writerAccept').disabled,false);checks.push('Model source is labeled and manual edits must also stay within the wording policy');

 h=harness(()=>{throw new Error('No editable wording must skip inference');});await h.load();const alreadyFormal='患者乏力，无发热。Hb86 g/L。拟明日复查。';await h.generate(alreadyFormal);assert.equal(h.api.calls,undefined);assert.equal(h.el('writerOriginal').value,alreadyFormal);assert.equal(h.el('writerCandidate').value,alreadyFormal);assert.match(h.el('writerCandidateSource').textContent,/未调用模型/);assert.match(h.el('writerStatus').textContent,/没有匹配/);assert.equal(h.el('writerGenerate').disabled,false);assert.equal(h.el('writerNormalize').disabled,false);assert.equal(h.el('writerCancel').hidden,true);h.review();assert.equal(h.el('writerAccept').disabled,true);checks.push('Already formal text skips model inference, reports that clearly and restores controls');

 const template=fs.readFileSync(path.join(root,'minimal/page.html'),'utf8');const build=fs.readFileSync(path.join(root,'tests/build-minimal.py'),'utf8');
 const start='<!-- SOURCE_ENTRY_NOTICE_START -->',end='<!-- SOURCE_ENTRY_NOTICE_END -->';assert.equal(template.split(start).length,2);assert.equal(template.split(end).length,2);assert.match(template.slice(template.indexOf(start),template.indexOf(end)),/这是界面源码模板[\s\S]*\.\.\/离线病历AI\/病历书写AI\.html/);assert.match(build,/page=page\[:begin\]\+page\[end:\]/);checks.push('Source template links to runnable pages; build has one explicitly delimited removal block');
 const report={status:'PASS',scope:'Node VM + minimal DOM stub; no browser launched and no model quality or Windows compatibility claim',checks};
 const out=path.join(root,'test-results/local-writer-ui-state');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
