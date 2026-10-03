/* Isolated Chrome audit of actual generated HTML. Synthetic note formats only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const input=path.resolve(process.argv[2]||'病历书写简版.html');
const out=path.resolve(process.argv[3]||'test-results/note-format');
const first=`2026-10-04 09:00 首次病程记录
患者合成甲，男，60岁。因“乏力伴纳食减少3日”于2026-10-03 15:00入院。
病例特点：
1、现病史：合成资料：病理曾提示胃腺癌，近3日乏力、纳少，无呕血，无发热。
2、PE：T 36.5℃，腹软，无反跳痛；舌紫，苔薄白，脉弦涩。
3、辅助检查：2026-10-03 Hb 110 g/L，参考范围130-175 g/L。
拟诊讨论：
中医辨病辨证依据及鉴别诊断：病属中医“胃癌”范畴，证属气虚血瘀证。症状：鉴别时须留意呕血、发热。查体：若舌红脉数，另作辨证。
西医诊断：胃腺癌（合成记录）。
诊断依据：所录病理报告。
入院诊断：
中医诊断：胃癌
证型：气虚血瘀证
西医诊断：胃腺癌（合成记录）。
病情评估：本次医师认为乏力需结合血象及摄入量复评。
诊疗计划：
1、护理：按本次医师已录护理安排。
2、饮食：记录实际摄入量。
3、检查计划：明日复查血常规。
4、中医治疗：按医师已录原方案继续。
5、西医治疗：本次按既定医嘱处理。
6、沟通及宣教：告知复评安排。`;
const attending=`2026-10-04 09:30 主治中医师查房记录
今日入院第2天，合成张主治中医师查房，患者诉今日乏力减轻，纳食改善，无发热。
PE：T 36.5℃，腹软；舌紫，苔薄白，脉弦涩。
辅助检查：2026-10-04 Hb 111 g/L，参考范围130-175 g/L。
合成张主治中医师查房指示：
中医辨证依据：乏力、舌紫及脉弦涩，证属气虚血瘀证。
西医诊断：胃腺癌（合成记录）。
诊断依据：原病理报告。
症状：若出现呕血、发热，及时复评。
查体：若舌红，需另作辨证。
病情评估：乏力变化需结合摄入量。
中医治疗：继续医师已决定的原方案。
西医治疗：按本次既定医嘱处理。
观察与复评：明日复查血常规。`;
const labelled=`姓名：合成乙\n性别：女\n年龄：58\n现病史：既往胃腺癌，昨日腹痛，昨日舌红，苔黄，脉数。\n今日症状：今日无腹痛，乏力减轻。\n查体：腹软，舌淡，苔薄白，脉弱。\n辅助检查：2026-10-04 Hb 112 g/L。\n观察与复评：明日复查血常规。`;
const cases=[{id:'first-user-layout',raw:first},{id:'attending-user-layout',raw:attending},{id:'current-v-history',raw:labelled},
 {id:'numbered-no-explicit-history',raw:first.replace('1、现病史：','1、')},
 {id:'crlf-layout',raw:attending.replaceAll('\n','\r\n')},
 {id:'single-line-patient-fields',raw:'姓名：合成丙，性别：男，年龄：61；今日症状：乏力。查体：腹软。西医诊断：胃腺癌。诊疗计划：明日复查血常规。'},
 {id:'historical-report-only',raw:'今日症状：乏力。\n昨日辅助检查：2026-10-03 Hb 108 g/L。\n观察与复评：明日复查血常规。'},
 {id:'round-discussion-only',raw:'2026-10-04 主任中医师查房记录\n今日入院第3天，合成李主任中医师查房，患者诉无新不适。\nPE：腹软。\n辅助检查：无新增。\n合成李主任中医师查房意见：\n患者可能因痰热出现舌红，苔黄，脉数，须核实。\n西医诊断：胃腺癌。\n病情评估：病情平稳。'}];
async function main(){
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome'});
 const errors=[],network=[];
 try{
  const context=await browser.newContext();const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  await page.goto(pathToFileURL(input).href);await page.waitForFunction(()=>typeof V64Parse?.extract==='function');
  const results=await page.evaluate(items=>items.map(item=>({...item,extracted:V64Parse.extract(item.raw)})),cases);
  const by=id=>results.find(r=>r.id===id).extracted, f=by('first-user-layout'),a=by('attending-user-layout'),l=by('current-v-history'),s=by('single-line-patient-fields');
  const checks={
   first_identity:f.name==='合成甲'&&f.sex==='男'&&f.ageAtIndex==='60'&&f.chiefComplaint==='乏力伴纳食减少3日'&&f.admissionDate==='2026-10-03 15:00',
   first_observation_clean:!/(病例特点|首次病程|患者合成|拟诊讨论|入院诊断|诊断依据|鉴别时)/.test(f.symptoms)&&f.symptoms.includes('近3日乏力'),
   first_exam_not_analysis:f.exam==='T 36.5℃，腹软，无反跳痛；舌紫，苔薄白，脉弦涩。'&&f.tongue==='紫'&&f.coat==='薄白'&&f.pulse==='弦涩',
   first_diagnosis_clean:f.westernDiagnosis==='胃腺癌（合成记录）。'&&f.tcmDisease==='胃癌'&&f.syndrome==='气虚血瘀证',
   first_lab_clean:f.labRaw==='2026-10-03 Hb 110 g/L，参考范围130-175 g/L。',
   round_identity:a.doctor==='合成张'&&a.day==='2',
   round_observation_clean:a.symptoms==='今日乏力减轻，纳食改善，无发热。'&&!/(查房|医师|指示|呕血)/.test(a.symptoms),
   round_exam_not_analysis:a.tongue==='紫'&&a.coat==='薄白'&&a.pulse==='弦涩'&&!a.exam.includes('若舌红'),
   round_lab_clean:a.labRaw==='2026-10-04 Hb 111 g/L，参考范围130-175 g/L。',
   current_symptoms_not_overridden:l.symptoms==='今日无腹痛，乏力减轻。'&&l.presentIllness.includes('昨日腹痛'),
   current_tongue_not_history:l.tongue==='淡'&&l.coat==='薄白'&&l.pulse==='弱',
   followup_not_report:l.labRaw==='2026-10-04 Hb 112 g/L。'&&l.followPlan==='明日复查血常规。',
   same_line_fields:s.name==='合成丙'&&s.sex==='男'&&s.ageAtIndex==='61',
   historical_report_not_current:!by('historical-report-only').labRaw,
   numbered_features_clean:by('numbered-no-explicit-history').symptoms===f.symptoms,
   crlf_equivalent:['symptoms','exam','labRaw','doctor','day'].every(k=>by('crlf-layout')[k]===a[k]),
   unobserved_discussion_not_four:!by('round-discussion-only').tongue&&!by('round-discussion-only').coat&&!by('round-discussion-only').pulse,
   no_external_requests:network.length===0,no_page_errors:errors.length===0
  };
  const bytes=fs.readFileSync(input);const result={input,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),scope:'macOS isolated Chrome; synthetic data only; actual generated HTML; not clinical quality validation',checks,errors,network,results};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({input,checks,errors,network,failed:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k)},null,2));
  process.exitCode=Object.values(checks).every(Boolean)?0:1;await context.close();
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
