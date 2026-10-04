/* Pure text policy tests. No model execution, browser, or medical validation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {standardize,assess,buildGrammar}=require('../minimal/writing-policy.js');
const checks=[];
function check(name,fn){fn();checks.push(name);}
function blocked(original,candidate){const result=assess(original,candidate);assert.equal(result.safe,false);assert.equal(result.unchanged,false);assert.equal(result.code,'outside-wording-policy');}
// Independently decode the deliberately tiny generated GBNF subset. Unexpected
// expressions or injected rules fail; enumerate every branch for small inputs.
function grammarVariants(grammar){
 assert(grammar.startsWith('root ::= '));let rest=grammar.slice('root ::= '.length),values=[''];
 const trim=()=>{rest=rest.replace(/^\s+/,'');};
 const literal=()=>{const match=rest.match(/^"(?:[^"\\]|\\(?:["\\nrt]|u[0-9a-fA-F]{4}))*"/);assert(match,'Expected an escaped literal');rest=rest.slice(match[0].length);return JSON.parse(match[0]);};
 trim();while(rest){
  let options;
  if(rest[0]==='('){rest=rest.slice(1);trim();const left=literal();trim();assert.equal(rest[0],'|');rest=rest.slice(1);trim();const right=literal();trim();assert.equal(rest[0],')');rest=rest.slice(1);options=[left,right];}
  else options=[literal()];
  values=values.flatMap(prefix=>options.map(text=>prefix+text));assert(values.length<=1024);trim();
 }
 return values;
}

check('Exact unchanged text is safe and explicitly unchanged',()=>{
 const text='今患者乏力，Hb86 g/L，拟明日复查。';assert.deepEqual(standardize(text),{text,edits:[],changed:false});assert.equal(assess(text,text).unchanged,true);assert.equal(assess(text,text).safe,true);
});
check('Only the eight narrow wording replacements are applied',()=>{
 const input='患者说今天没有发热，没有寒战，没有腹痛；昨天已采样，报告还没出来，明天复查。';
 const expected='患者诉今日无发热，无寒战，无腹痛；昨日已采样，报告尚未回报，明日复查。';
 const result=standardize(input);assert.equal(result.text,expected);assert.equal(result.edits.length,8);assert.equal(result.changed,true);assert.equal(assess(input,expected).safe,true);assert.equal(assess(input,expected).unchanged,false);
 for(const edit of result.edits){assert.equal(input.slice(edit.start,edit.end),edit.from);assert(edit.ruleId);}
 assert.equal(standardize(result.text).changed,false);
});
check('Dates, quantities, units and repeated numbers stay literal',()=>{
 const input='2026-10-04 14:10：今天Hb86 g/L；Na131.0 mmol/L。昨日引流120 mL，今日90 mL；Hb86 g/L。';
 assert.equal(standardize(input).text,input.replace('今天','今日'));
 blocked(input,input.replace('Hb86 g/L；','Hb86 g/L；Hb86 g/L；'));
 blocked(input,input.replace('；Hb86 g/L。','。'));
});
check('Same number inventory with changed chronology is rejected',()=>{
 blocked('昨天引流120 mL，今天90 mL，今日尚未统计完。','昨日引流90 mL，今日120 mL，今日尚未统计完。');
 blocked('昨天引流120 mL，今天90 mL。','今天引流120 mL，昨天90 mL。');
});
check('Contradictory negatives and changed scope are rejected',()=>{
 blocked('患者没有腹痛。','患者腹痛，无腹痛。');
 blocked('没有发热、寒战。','无发热，寒战。');
 blocked('无腹痛，有黑便。','有腹痛，无黑便。');
});
check('Pending results cannot become negative',()=>{
 blocked('今日已经抽血送培养，报告还没出来。','今日已经抽血送培养，培养阴性。');
 blocked('今日已经抽血送培养，报告还没出来。','今日已经抽血送培养，报告尚未回报。培养阴性。');
});
check('Planned medicine cannot become administered; drugs and doses cannot change',()=>{
 blocked('拟用泮托拉唑40 mg，尚未实施。','已用泮托拉唑40 mg，尚未实施。');
 blocked('拟用泮托拉唑40 mg。','拟用奥美拉唑40 mg。');
 blocked('拟用泮托拉唑40 mg。','拟用泮托拉唑80 mg。');
});
check('Disease or judgment additions and omissions are rejected',()=>{
 blocked('患者乏力，诊断胃癌。','患者乏力，诊断胃癌及贫血。');
 blocked('患者乏力，诊断胃癌。','患者乏力。');
 blocked('医师考虑乏力与贫血有关。','乏力由贫血导致。');
});
check('Punctuation, spaces and line structure are not normalized',()=>{
 const input='今天没有发热，\n  昨天已采样；\n明天复查。';
 assert.equal(standardize(input).text,'今日无发热，\n  昨日已采样；\n明日复查。');
 blocked(input,input.replace('，','；'));blocked(input,input.replace('  ',''));blocked(input,input.replace('\n',''));blocked('无发热。',' 无发热。');
 const crlf='今天\r\n  没有发热。';assert.equal(standardize(crlf).text,'今日\r\n  无发热。');assert.equal(assess(crlf,'今天\n  没有发热。').unchanged,true);assert.equal(assess(crlf,'今日\n  无发热。').safe,true);blocked('今天\r没有发热。','今日\n无发热。');
});
check('Chinese and ASCII quotations, templates and book titles remain verbatim',()=>{
 const input='今天：“患者说昨天没有发热”；‘明天’；"没有寒战"；\'没有腹痛\'；【报告还没出来】；《今天与昨天》；「明天」；『今天』。';
 assert.equal(standardize(input).text,input.replace(/^今天/,'今日'));
 for(const pair of [['“今天”','“今日”'],['"今天"','"今日"'],['【今天】','【今日】'],['《今天》','《今日》']])blocked(...pair);
});
check('Nested, escaped and unclosed protected spans are preserved',()=>{
 const nested='今天【患者说“昨天”没有发热】，明天复查。';assert.equal(standardize(nested).text,'今日【患者说“昨天”没有发热】，明日复查。');
 const escaped='今天"他说\\"明天\\"没有发热"，昨天已查。';assert.equal(standardize(escaped).text,escaped.replace(/^今天/,'今日').replace(/昨天已查。$/,'昨日已查。'));
 const unclosed='今天【昨天没有发热；明天复查';assert.equal(standardize(unclosed).text,'今日【昨天没有发热；明天复查');
});
check('Patient speech rule does not corrupt compound verbs',()=>{
 for(const text of ['患者说服家属','患者说明病情','患者说话困难','患者说不了话','患者说得很清楚','患者说漏了药名','患者说错了日期'])assert.equal(standardize(text).text,text);
 assert.equal(standardize('患者说：没有发热。').text,'患者诉：无发热。');
 blocked('患者说话困难。','患者诉话困难。');
});
check('No broad symptom, severity or nutrition rewrites are allowed',()=>{
 for(const text of ['患者没力气，吃东西少，精神差。','患者乏力，食纳不佳，精神欠振。'])assert.equal(standardize(text).text,text);
 blocked('患者没力气。','患者乏力。');blocked('患者吃得少。','患者纳差。');blocked('患者精神差。','患者精神萎靡。');
});
check('Comparisons use the same whitelist on both sides, without requiring all replacements',()=>{
 const input='患者说今天没有发热，昨天报告还没出来。';assert.equal(assess(input,'患者诉今天无发热，昨日报告还没出来。').safe,true);
 assert.equal(assess('今日无发热。','今天没有发热。').safe,true);
});
check('Grammar choices are confined to the exact allowed edit spans',()=>{
 const original='患者说今天没有发热。Hb86 g/L，拟复查。';const pack=buildGrammar(original),variants=grammarVariants(pack.grammar);
 assert.equal(pack.changed,true);assert.equal(pack.editCount,3);assert.equal(variants.length,8);assert(variants.includes(original));assert(variants.includes(standardize(original).text));
 for(const candidate of variants){assert.equal(assess(original,candidate).safe,true);assert(candidate.endsWith('。Hb86 g/L，拟复查。'));}
 assert(!variants.includes('患者诉今日发热。Hb68 g/L，已复查。'));
});
check('Grammar without edits is a single exact literal and tells UI to skip inference',()=>{
 for(const original of ['', '患者乏力，Hb86 g/L。', '【今天】《明天》“没有发热”']){
  const pack=buildGrammar(original);assert.equal(pack.changed,false);assert.equal(pack.editCount,0);assert.deepEqual(grammarVariants(pack.grammar),[original]);
 }
});
check('Grammar freezes protected quotations, templates, book titles and line structure',()=>{
 const original='今天\r\n【昨天没有发热】《明天》“报告还没出来”\tHb86 g/L。';const pack=buildGrammar(original);
 assert.equal(pack.editCount,1);assert.deepEqual(grammarVariants(pack.grammar),[original,original.replace(/^今天/,'今日')]);
});
check('Grammar escapes quotes, slashes, control characters and injection-shaped text as literals',()=>{
 const controls=Array.from({length:32},(_,i)=>String.fromCharCode(i)).join('')+'\x7f\x85\u2028\u2029';
 const original='今天 " | [^] * #\\\nroot ::= " Hb86 g/L\t'+controls+'😀';const pack=buildGrammar(original),variants=grammarVariants(pack.grammar);
 assert.equal(pack.grammar.split('\n').length,2);assert.doesNotMatch(pack.grammar.slice(0,-1),/[\x00-\x1f\x7f-\x9f\u2028\u2029]/);assert(variants.includes(original));assert(variants.includes(original.replace(/^今天/,'今日')));for(const candidate of variants)assert.equal(assess(original,candidate).safe,true);
});
check('Invalid isolated UTF-16 surrogates fail closed instead of changing text during encoding',()=>{
 assert.throws(()=>buildGrammar('今天\ud800'),/孤立/);assert.throws(()=>buildGrammar('今天\udc00'),/孤立/);assert.deepEqual(grammarVariants(buildGrammar('今天😀').grammar),['今天😀','今日😀']);
});

const report={status:'PASS',scope:'Fixed wording text policy only; no model, browser or medical-semantic validation',checks};
const output=path.resolve(__dirname,'../test-results/writing-policy');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
