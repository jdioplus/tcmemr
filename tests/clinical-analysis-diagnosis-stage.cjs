/* Synthetic regression for source-bound diagnosis and staging labels.
 * No patient storage, browser state, HTML build, or clinical certification. */
const assert=require('node:assert/strict');
const analysis=require('../minimal/clinical-analysis.js');
const build=(p,e={})=>analysis.build(p,e,{positiveText:'',labItems:[],decisionCards:[],skillRules:{}});
let count=0;
function test(name,run){run();count++;console.log('passed:',name);}

test('cancer selection supplies no unconfirmed diagnosis',()=>{
 for(const cancer of ['胃癌','肺癌','乳腺癌']){
  const a=build({cancer});
  assert.equal(a.westernText,'');
  assert(a.warnings.some(w=>w.includes('西医主要诊断待医师填写或确认')));
  assert(!a.westernText.includes('待医师'));
 }
});
test('recorded pathology remains factual without a fabricated diagnosis',()=>{
 const a=build({cancer:'胃癌'},{pathologyReport:'合成：胃活检示腺癌，进一步分型待回报'});
 assert(a.westernText.includes('病理依据：合成：胃活检示腺癌，进一步分型待回报'));
 assert(!a.westernText.includes('本案西医诊断为'));
 assert(a.warnings.some(w=>w.includes('西医主要诊断待医师')));
});
test('explicit doctor diagnosis and uncertainty are retained',()=>{
 const a=build({cancer:'胃癌',westernDiagnosis:'胃腺癌（既往）'},{westernDiagnosis:'胃恶性肿瘤待核实'});
 assert(a.westernText.startsWith('本案西医诊断为：胃恶性肿瘤待核实。'));
 assert(!a.westernText.includes('胃腺癌（既往）'));
 assert(!a.warnings.some(w=>w.includes('西医主要诊断待医师填写或确认')));
});
test('TNM prefixes remain unchanged under a neutral staging label',()=>{
 for(const stage of ['pT2N0M0（术后病理）','ypT1N0M0','ycT2N1M0','rT3N1M0','cT2N0M0','ⅢA期']){
  const a=build({cancer:'肺癌'},{stage});
  assert(a.westernText.includes('分期记录：'+stage+'。'));
  assert(!a.westernText.includes('临床分期：'));
 }
});
test('explicitly recorded clinical pathological and recurrent labels remain',()=>{
 for(const stage of ['临床分期：cT2N0M0（第9版）','病理分期：pT2N0M0（第8版）','治疗后病理分期：ypT1N0M0','治疗后临床分期：ycT2N1M0','复发分期：rT3N1M0']){
  assert.equal(build({cancer:'肺癌'},{stage}).westernText,stage+'。');
 }
});
test('mixed staging history does not become one clinical stage',()=>{
 const stage='既往cT2N0M0；术后pT3N1M0，两次评估日期不同';
 assert.equal(build({cancer:'肺癌'},{stage}).westernText,'分期记录：'+stage+'。');
});
test('encounter staging priority and other provided facts remain',()=>{
 const a=build({cancer:'胃癌',westernDiagnosis:'胃腺癌',stage:'cT2N0M0'},{stage:'病理分期：pT3N1M0',imagingReport:'合成：术后复查影像待核对',molecularReport:'合成：HER2 IHC 2+，ISH待回报',assessment:'合成：医师拟核对复评资料'});
 assert(a.westernText.includes('本案西医诊断为：胃腺癌'));
 assert(a.westernText.includes('病理分期：pT3N1M0'));
 assert(!a.westernText.includes('cT2N0M0'));
 assert(a.westernText.includes('HER2 IHC 2+，ISH待回报'));
 assert(a.westernText.includes('医师拟核对复评资料'));
});
console.log(JSON.stringify({synthetic:true,purpose:'source-bound diagnosis/staging regression; not clinical qualification',passed:count}));
