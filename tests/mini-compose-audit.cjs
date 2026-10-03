/* Synthetic VM audit of the actual mini-page engines/composer; no browser flow claim. */
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const input=path.resolve(process.argv[2]||'病历书写简版.html'),out=path.resolve(process.argv[3]||'test-results/mini-compose');
const html=fs.readFileSync(input,'utf8'),scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const elements=new Map();
function el(tag='div'){return {tagName:tag.toUpperCase(),value:'',checked:false,type:'text',children:[],hidden:false,disabled:false,listeners:{},add(x){this.children.push(x);},append(...a){this.children.push(...a);},appendChild(x){this.children.push(x);return x;},replaceChildren(...a){this.children=a;},addEventListener(k,f){(this.listeners[k]??=[]).push(f);},setAttribute(){},getAttribute(){return null;},focus(){},select(){},contains(){return false;},querySelectorAll(){return [];},remove(){},click(){}};}
function get(id){if(!elements.has(id)){const e=el();e.id=id;if(['qSyndromeConfirmed','qReviewed'].includes(id))e.type='checkbox';elements.set(id,e);}return elements.get(id);}
const doc={getElementById:get,createElement:el,createTextNode:t=>({textContent:t}),head:el('head'),activeElement:null,execCommand:()=>true};
const ctx=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto,URL,setTimeout,clearTimeout,structuredClone,atob,btoa,document:doc,window:{confirm:()=>true,addEventListener(){}},Option:function(t,v){this.text=t;this.value=v;},navigator:{clipboard:{writeText:async()=>{}}}});
vm.runInContext(scripts[0][2],ctx,{filename:input+':engines'});
ctx.V63ReviewUI={render(){}};
let ui=scripts[1][2];
ui=ui.replace('globalThis.BingliMini=Object.freeze',"globalThis.__miniAudit={judge:judgmentChanged};globalThis.BingliMini=Object.freeze");
vm.runInContext(ui,ctx,{filename:input+':composer'});
const base={qDate:'2026-10-04T09:00',qType:'日常病程记录',qName:'合成测试胃癌甲',qCancer:'胃癌',qWestern:'胃腺癌（合成输入）',qTcmDisease:'胃癌',qSex:'男',qAge:'60',qDoctor:'合成查房医师',qChiefComplaint:'乏力、纳食减少3日',qSyndrome:'脾胃气虚证',qSyndromeConfirmed:true,qTcmEvidence:'乏力、纳少，舌淡胖，苔薄白，脉细弱。',qPlan:'本次拟继续既定支持安排；明日复查血常规并记录实际摄入量。',qToday:'今日症状：乏力、纳少。查体：T 36.5℃，BP 120/75 mmHg，腹软。舌淡胖，苔薄白，脉细弱。辅助检查：2026-10-04 Hb 110 g/L，参考范围130-175 g/L。'};
function set(fields){for(const [id,v] of Object.entries(fields)){get(id)[typeof v==='boolean'?'checked':'value']=v;}}
function clean(){ctx.BingliMini.clear();}
const results=[];
function capture(id,setup,judge){clean();set({...base,...setup});const generated=ctx.BingliMini.generate();if(judge)judge();const state=ctx.BingliMini.getState();const r={id,inputs:Object.fromEntries(Object.keys(base).map(k=>[k,get(k).type==='checkbox'?get(k).checked:get(k).value])),generated,note:get('qNote').value,state,status:get('qStatus').textContent};results.push(r);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,id+'.txt'),r.note);return r;}
for(const type of ['首次病程记录','日常病程记录','主治中医师查房记录','主任中医师查房记录'])capture('chosen-'+type,{qType:type},()=>{ctx.__miniAudit.judge('fatigue',{primary:'anemia',secondary:['intake'],checks:[],extra:''});ctx.__miniAudit.judge('anemia',{primary:'',secondary:[],checks:['iron'],extra:''});});
capture('resolved',{qToday:'今日已无乏力，无纳差，不再腹痛，未再便血。',qPlan:'',qSyndrome:'',qSyndromeConfirmed:false,qTcmEvidence:''});
capture('denied',{qToday:'今日否认腹痛、发热、咳嗽和便血。',qPlan:'',qSyndrome:'',qSyndromeConfirmed:false,qTcmEvidence:''});
capture('historical-lab',{qToday:'今日症状：乏力。辅助检查：2026-09-20 Hb 110 g/L，参考范围130-175 g/L。',qPlan:'',qSyndrome:'',qSyndromeConfirmed:false,qTcmEvidence:''});
capture('no-report-reference',{qToday:'今日症状：乏力、纳少。辅助检查：2026-10-04 Hb 110 g/L。',qPlan:'',qSyndrome:'',qSyndromeConfirmed:false,qTcmEvidence:''});
capture('treatment-pause',{qPlan:'本次继续既定治疗；明日复查血常规并记录实际摄入量。'},()=>ctx.__miniAudit.judge('treatment',{primary:'defer',secondary:[],checks:[],extra:''}));
const chosen=results.filter(x=>x.id.startsWith('chosen-'));
const checks={chosenJudgmentPreserved:chosen.every(r=>r.note.includes('乏力主要考虑与贫血有关。')&&r.note.includes('乏力考虑摄入减少可能参与')&&r.note.includes('拟完善铁蛋白、转铁蛋白饱和度。')),selectedJsonPreserved:chosen.every(r=>JSON.parse(r.state.clinicalSelections).fatigue.primary==='anemia'),noEditorialPhrase:chosen.every(r=>!/(?:资料不足|不能认定|未采纳)/.test(r.note)),resolvedNoSymptomCards:results.find(r=>r.id==='resolved').state.cards.every(c=>c.id==='treatment'),deniedNoSymptomCards:results.find(r=>r.id==='denied').state.cards.every(c=>c.id==='treatment')};
const metadata={input,sha256:crypto.createHash('sha256').update(html).digest('hex'),scope:'actual source functions with DOM/render stubs; synthetic data only; no browser flow or clinical qualification claim'};
fs.writeFileSync(path.join(out,'mini-compose-results.json'),JSON.stringify({metadata,checks,results},null,2));
console.log(JSON.stringify({metadata,checks,observations:results.map(r=>({id:r.id,cards:r.state.cards.map(c=>c.id),labs:r.state.encounter.labItems,selectedBlocks:r.state.blocks.filter(b=>/judgment|plan/.test(b.id))}))},null,2));
process.exitCode=Object.values(checks).every(Boolean)?0:1;
