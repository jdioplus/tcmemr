/** Additional synthetic sample regressions; these do not establish clinical fitness. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const input=path.resolve(process.argv[2]||'123-v6.3.html');
const output=path.resolve(process.argv[3]||'test-results/improved');
fs.mkdirSync(output,{recursive:true});
const html=fs.readFileSync(input,'utf8');
const ctx=vm.createContext({TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:crypto.webcrypto,URL,setTimeout,clearTimeout,structuredClone,atob,btoa});
for(const s of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(x=>!/(?:application\/json|corpusData)/.test(x[1])))vm.runInContext(s[2],ctx);
const patient={id:'synthetic-extra',alias:'合成补充测试患者',cancer:'胃癌',westernDiagnosis:'胃腺癌（合成资料）',tcmDisease:'胃癌',sex:'男',admissionDate:'2026-10-02'};
const seed={date:'2026-10-03',recordType:'日常病程记录',verification:'unconfirmed',syndromeStatus:'unconfirmed',includeClassics:false,includeDiseaseClassics:false};
const scenarios=[
 {id:'conditional_plan',raw:'今日症状：无不适。计划：如出现发热，复查血常规。既往史：曾咳嗽。',forbidden:['已录发热或寒战','已录呼吸相关症状']},
 {id:'conditional_unlabelled',raw:'今日无不适。明日若出现发热和咳嗽，提前复评。',forbidden:['已录发热或寒战','已录呼吸相关症状']},
 {id:'conditional_next_day',raw:'今日无不适。次日如出现腹痛，提前复评。',forbidden:['已录腹部胀痛']},
 {id:'explicit_current_positive',raw:'今日出现发热和咳嗽。',required:['已录发热或寒战','已录呼吸相关症状']},
 {id:'explicit_current_less',raw:'今日腹痛较昨日减轻。',required:['已录腹部胀痛']},
 {id:'explicit_current_still',raw:'今日仍有腹痛，较昨日减轻。',required:['已录腹部胀痛']},
 {id:'resolved_multiple',raw:'今日不再腹痛，已无乏力，未再便血。',forbidden:['已录腹部胀痛','本次存在乏力','已录出血表现']},
 {id:'resolved_and_positive',raw:'今日不再腹痛，但仍有乏力。',forbidden:['已录腹部胀痛'],required:['本次存在乏力']},
 {id:'current_plan_after_old_prescription',raw:'今日纳少。昨日中药处方：黄芪10g。诊疗计划：今日复查血常规。',plan:'今日复查血常规'},
 {id:'missing_syndrome',raw:'今日乏力。舌淡，苔薄白，脉细弱。',forbidden:['经医师辨证，证属'],warning:/证型尚未填写/},
 {id:'unconfirmed_syndrome',raw:'今日乏力。舌淡，苔薄白，脉细弱。',patch:{syndrome:'脾胃气虚证',syndromeStatus:'unconfirmed'},forbidden:['经医师辨证，证属'],warning:/证型.*(?:确认|待确认)/},
 {id:'conflicting_syndrome',raw:'今日口干，无乏力，无纳差。舌红，苔少，脉细数。',patch:{syndrome:'脾胃气虚证',syndromeStatus:'confirmed'},warning:/证型.*(?:不足|阴性|核对)/},
 {id:'first_signature_placeholder',raw:'今日乏力。',patch:{recordType:'首次病程记录',doctor:'合成查房医师甲',chiefComplaint:'乏力1日',presentIllness:'今日乏力。'},required:['书写医师：【待实际医师核对并签名】'],forbidden:['书写医师：合成查房医师甲']},
 {id:'full_evidence_classics_retained',raw:'今日胃脘胀满，嗳气，反胃；舌淡红，苔薄白，脉弦。',patch:{syndrome:'肝胃不和证',syndromeStatus:'confirmed',tcmEvidence:'胃脘胀满、嗳气，脉弦；需据实际四诊复核。',includeClassics:true,includeDiseaseClassics:true},required:['肝欲散','翻胃大约有四','疏肝理气、和胃降逆'],forbidden:['可核实篇名','不是将现代','未采纳原文']},
 {id:'first_partial_liver_stomach',raw:'',patch:{recordType:'首次病程记录',chiefComplaint:'【主诉待补】',symptoms:'',presentIllness:'',tongue:'',coat:'',pulse:'',tcmEvidence:'',syndrome:'肝胃不和证',syndromeStatus:'confirmed',includeClassics:true,includeDiseaseClassics:true},forbidden:['本例已见胃脘胀痛','患者诉胃脘胀痛','可核实篇名','不是将现代','未采纳原文'],required:['【舌质、舌苔及脉象待补】'],factsBoundary:true},
 {id:'round_missing_doctor',raw:'今日乏力。',patch:{recordType:'主任中医师查房记录'},required:['【查房医师姓名及职务待补】'],warning:/查房医师.*待补/}
];
const results=[];
for(const s of scenarios){
 const parsed=ctx.V6QuickParse.extract(s.raw);
 const e={...seed,...parsed,...(s.patch||{})};
 const note=ctx.V5Clinical.generateNote(patient,e,[],[]);
 const checks={forbiddenAbsent:(s.forbidden||[]).every(t=>!note.text.includes(t)),requiredPresent:(s.required||[]).every(t=>note.text.includes(t)),planCaptured:!s.plan||parsed.supportPlan.includes(s.plan),expectedWarning:!s.warning||[...parsed.warnings,...note.warnings].some(t=>s.warning.test(t)),factsBoundary:!s.factsBoundary||!note.text.includes('从肝胃不和证的病机分析：')||/(?:一般病机|证型病机)[\s\S]*(?:不代表|未记录|不作)/.test(note.text)};
 results.push({id:s.id,raw:s.raw,patient,encounter:e,parsed,note,checks,passed:Object.values(checks).every(Boolean)});
}
const purpose='合成样本生成行为回归测试，不代表临床合格或真实诊疗正确。';
fs.writeFileSync(path.join(output,'clinical-extra-regression.json'),JSON.stringify({purpose,input,sha256:crypto.createHash('sha256').update(html).digest('hex'),results},null,2));
console.log(JSON.stringify({purpose,total:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).map(x=>({id:x.id,checks:x.checks,parsed:x.parsed,warnings:x.note.warnings}))},null,2));
process.exitCode=results.some(x=>!x.passed)?1:0;
