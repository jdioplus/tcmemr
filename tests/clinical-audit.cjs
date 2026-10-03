/**
 * Reproduce generator behavior using synthetic fixtures only.
 * Usage: node tests/clinical-audit.cjs <input.html> <new-output-directory>
 * Add --overwrite only when replacing prior generated sample results intentionally.
 * The VM does not initialize browser UI, access user storage or save any patient record.
 * These selected sample assertions do not establish clinical correctness or completeness.
 */
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const crypto=require('crypto');
const sourcePath=path.resolve(process.argv[2]||path.join(__dirname,'..','123.html'));
const outDir=path.resolve(process.argv[3]||path.join(__dirname,'..','test-results','clinical-run'));
fs.mkdirSync(outDir,{recursive:true});
if(fs.existsSync(path.join(outDir,'clinical-summary.json'))&&!process.argv.includes('--overwrite'))throw new Error('此目录已有临床样本测试结果；请选择新的输出目录，或明确传入 --overwrite。');
const purpose='合成样本生成行为测试；结果不代表病案临床合格、治疗正确或可直接用于真实患者。';
const html=fs.readFileSync(sourcePath,'utf8');

const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(x=>!/(?:application\/json|corpusData)/.test(x[1]));
const ctx=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto,URL,setTimeout,clearTimeout,structuredClone,atob,btoa});
for(const s of scripts)vm.runInContext(s[2],ctx,{filename:sourcePath});
const patient={id:'synthetic-patient',alias:'合成测试患者A',sex:'男',ageAtIndex:'60',admissionDate:'2026-10-02 09:00',cancer:'胃癌',westernDiagnosis:'胃腺癌',tcmDisease:'胃癌',diagnosisBasis:'合成资料：2026-09-20病理记录胃腺癌',history:'合成资料：既往胃腺癌，本次入院评估纳少。未提供具体抗肿瘤方案。'};
const base={date:'2026-10-03',recordTime:'09:10',recordType:'日常病程记录',doctor:'合成医师甲',chiefComplaint:'纳少3日',presentIllness:'近3日纳少，今日仍乏力。',symptoms:'今日乏力、纳少，无腹痛。',exam:'合成资料：一般情况尚可，实际生命体征未提供。',tongue:'淡胖',coat:'薄白',pulse:'细弱',syndrome:'脾胃气虚证',syndromeStatus:'confirmed',tcmEvidence:'乏力、纳少，舌淡胖，苔薄白，脉细弱。',supportPlan:'合成资料：医师记录暂按原支持方案处理，具体药物未提供。',followPlan:'合成资料：次日复评纳食及乏力变化。',labRaw:'',includeClassics:false,includeDiseaseClassics:false,verification:'unconfirmed',problems:[],negatives:[],labItems:[]};
const tests=[];
for(const type of ['首次病程记录','日常病程记录','主治中医师查房记录','主任中医师查房记录'])tests.push({id:'types_'+(['首次病程记录','日常病程记录','主治中医师查房记录','主任中医师查房记录'].indexOf(type)),patient,encounter:{...base,recordType:type},prior:[],events:[]});
tests.push({id:'missing',patient:{id:'synthetic-patient',alias:'合成测试患者A',cancer:'胃癌'},encounter:{date:'2026-10-03',recordType:'主治中医师查房记录',symptoms:'今日乏力。',syndrome:'脾胃气虚证',syndromeStatus:'confirmed',includeClassics:false,includeDiseaseClassics:false},prior:[],events:[]});
tests.push({id:'syndrome_conflict',patient,encounter:{...base,symptoms:'今日口干，无乏力，无纳差。',tongue:'红',coat:'少苔',pulse:'细数',syndrome:'脾胃气虚证',tcmEvidence:'今日口干，舌红少苔，脉细数。'},prior:[],events:[]});
tests.push({id:'cross_day',patient,encounter:{...base,symptoms:'今日不再腹痛，纳食较昨日改善。',tongue:'',coat:'',pulse:'',tcmEvidence:'',labRaw:''},prior:[{...base,id:'previous-synthetic',date:'2026-10-02',symptoms:'昨日腹痛、纳差。',labRaw:'2026-10-02：Hb 98 g/L。',tongue:'淡',coat:'黄腻',pulse:'弦'}],events:[]});
tests.push({id:'invalid_date',patient,encounter:{...base,date:'2026-02-30',recordType:'主任中医师查房记录'},prior:[],events:[]});
tests.push({id:'before_admission',patient,encounter:{...base,date:'2026-09-01'},prior:[],events:[]});
tests.push({id:'diagnosis_conflict',patient,encounter:{...base,westernDiagnosis:'肺腺癌',tcmDisease:'肺癌'},prior:[],events:[]});
tests.push({id:'uncertain_tongue',patient,encounter:{...base,symptoms:'今日未评估乏力和纳食情况。',tongue:'不详',coat:'未查',pulse:'未查',tcmEvidence:''},prior:[],events:[]});
tests.push({id:'current_negated_prior',patient,encounter:{...base,symptoms:'今日无腹痛，已无腹胀，无乏力，无纳差。',tongue:'红',coat:'少苔',pulse:'细数',tcmEvidence:'未评估证候'},prior:[{...base,id:'previous-synthetic',date:'2026-10-02',symptoms:'昨日腹痛、腹胀、乏力、纳差。'}],events:[]});
tests.push({id:'missing_doctor',patient,encounter:{...base,recordType:'主任中医师查房记录',doctor:''},prior:[],events:[]});
for(const [id,symptoms] of [['neg_no_longer','今日不再腹痛。'],['neg_now_none','今日已无乏力，无其他症状。'],['neg_no_more_fever','今日不再发热。'],['positive_less_than_yesterday','今日腹痛较昨日减轻。'],['neg_not_obvious','今日腹痛不明显。'],['neg_no_longer_bleeding','今日未再便血。']])tests.push({id,patient,encounter:{...base,symptoms,tcmEvidence:'',tongue:'',coat:'',pulse:'',syndrome:'',syndromeStatus:'unconfirmed',supportPlan:'',followPlan:''},prior:[],events:[]});
const results=[];
for(const t of tests){const output=ctx.V5Clinical.generateNote(t.patient,t.encounter,t.prior,t.events);const result={...t,output};fs.writeFileSync(path.join(outDir,'clinical-'+t.id+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(outDir,'clinical-'+t.id+'.txt'),output.text+'\n\nWARNINGS:\n'+output.warnings.join('\n'));results.push({id:t.id,chars:output.text.length,placeholders:(output.text.match(/【[^】]+】/g)||[]).length,warnings:output.warnings});}
const parseTests=[
 {id:'parse_current_plan_after_historical',input:'昨日中药处方：黄芪10g。诊疗计划：今日复查血常规。'},
 {id:'parse_plain_plan',input:'今日纳少。计划：次日复查血常规。'},
 {id:'parse_full_lab_and_plans',input:'今日乏力。辅助检查：2026-10-03 Hb 100 g/L。诊疗计划：次日复评。'},
 {id:'parse_historical',input:'今日仍纳少。昨日舌红，苔黄腻，脉细数。'},
 {id:'parse_conflict',input:'今日舌淡，苔薄白，脉细弱；本次舌红，苔少，脉细数。'},
 {id:'parse_mixed_date',input:'今日纳少。辅助检查：2026-10-02 Hb 98 g/L；2026-10-03 Hb 100 g/L。'},
 {id:'parse_negated',input:'今日无乏力，无纳差。舌不红，无黄腻苔，脉不数。'},
 {id:'parse_medicine_historical',input:'今日乏力。昨日处方：黄芪10g。诊疗计划：继续观察。'},
 {id:'parse_tongue_implicit',input:'今日纳少。舌淡胖有齿痕，苔薄白，脉细弱。'},
 {id:'parse_explicit_relative',input:'今日纳少。辅助检查：昨天Hb 98 g/L。诊疗计划：昨日决定暂缓治疗。'}
];
for(const t of parseTests){t.output=ctx.V6QuickParse.extract(t.input);fs.writeFileSync(path.join(outDir,'clinical-'+t.id+'.json'),JSON.stringify(t,null,2));results.push(t);}
const byId=Object.fromEntries(tests.map(t=>[t.id,{...t,output:ctx.V5Clinical.generateNote(t.patient,t.encounter,t.prior,t.events)}]));
const parses=Object.fromEntries(parseTests.map(t=>[t.id,t]));
const assertions=[];
function check(id,name,passed){assertions.push({id,name,passed:Boolean(passed)});}
for(const [id,forbidden] of [['neg_no_longer','已录腹部胀痛'],['neg_now_none','本次存在乏力'],['neg_no_more_fever','已录发热或寒战'],['neg_no_longer_bleeding','已录出血表现']])check(id,'已消失症状不得变成当前阳性分析',!byId[id].output.text.includes(forbidden));
check('positive_less_than_yesterday','仍存在而较昨日减轻的腹痛应保留当前分析',byId.positive_less_than_yesterday.output.text.includes('已录腹部胀痛'));
check('parse_current_plan_after_historical','明确今日计划不受前一句昨日处方影响',parses.parse_current_plan_after_historical.output.supportPlan.includes('今日复查血常规'));
check('parse_plain_plan','明确计划标记能整理到诊疗计划字段',parses.parse_plain_plan.output.supportPlan.includes('次日复查血常规'));
check('missing_doctor','查房医师缺失应有待补项或提醒',/【[^】]*医师[^】]*】/.test(byId.missing_doctor.output.text)||byId.missing_doctor.output.warnings.some(x=>/医师|医生/.test(x)));
check('types_0','首次病程保留书写医师签名待补，查房医师字段不充当签名',/【[^】]*(?:(?:书写|记录|经治)医师|签名)[^】]*】/.test(byId.types_0.output.text));
check('parse_historical','昨日舌苔脉不作为今日自动填写',['tongue','coat','pulse'].every(k=>!parses.parse_historical.output[k]));
check('parse_conflict','多处不同舌苔脉不自动取一个',['tongue','coat','pulse'].every(k=>!parses.parse_conflict.output[k]));
check('invalid_date','无效日历日期有提醒',byId.invalid_date.output.warnings.some(x=>x.includes('日期值无效')));
check('before_admission','早于入院的日期有提醒',byId.before_admission.output.warnings.some(x=>x.includes('早于登记的入院日期')));
check('diagnosis_conflict','病种冲突暂停专病引用并提醒',byId.diagnosis_conflict.output.warnings.some(x=>x.includes('病种字段冲突')));
const metadata={purpose,sourcePath,sha256:crypto.createHash('sha256').update(html).digest('hex'),engine:ctx.V5Clinical.version,synthetic:true,node:process.version,scenarioCount:tests.length+parseTests.length};
fs.writeFileSync(path.join(outDir,'clinical-metadata.json'),JSON.stringify(metadata,null,2));
fs.writeFileSync(path.join(outDir,'clinical-assertions.json'),JSON.stringify({purpose,assertions},null,2));
fs.writeFileSync(path.join(outDir,'clinical-summary.json'),JSON.stringify({metadata,results,assertions},null,2));
console.log(JSON.stringify({purpose,input:sourcePath,output:outDir,scenarios:tests.length+parseTests.length,assertions:assertions.length,passed:assertions.filter(x=>x.passed).length,failed:assertions.filter(x=>!x.passed).length,checks:assertions},null,2));
process.exitCode=assertions.some(x=>!x.passed)?1:0;
