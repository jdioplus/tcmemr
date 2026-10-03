/* Parse the user's note layouts without treating an example's discussion as an observation. */
(function(g){
 'use strict';
 const S=v=>String(v??'').trim(),unique=a=>[...new Set(a.filter(Boolean))];
 const labels={
  '主诉':'chiefComplaint','姓名':'name','患者姓名':'name','性别':'sex','年龄':'ageAtIndex','住院号':'hospitalNumber','入院时间':'admissionDate','入院日期':'admissionDate','入院天数':'day','查房医师':'doctor',
  '现病史':'presentIllness','今日症状':'symptoms','今日病情':'symptoms','本次病情':'symptoms','症状':'symptoms','既往史':'history','既往诊疗史':'history','肿瘤诊疗史':'history',
  '查体':'exam','体格检查':'exam','PE':'exam','辅助检查':'labRaw','检查结果':'labRaw','检验结果':'labRaw','病理':'pathologyReport','病理报告':'pathologyReport','影像':'imagingReport','影像报告':'imagingReport','分子检测':'molecularReport','基因检测':'molecularReport',
  '西医诊断':'westernDiagnosis','中医诊断':'tcmDisease','中医病名':'tcmDisease','证型':'syndrome','辨证':'syndrome','分期':'stage','诊断依据':'diagnosisBasis','中医辨证依据':'tcmEvidence','辨证依据':'tcmEvidence','中医鉴别':'tcmDifferential','西医鉴别':'westernDifferential',
  '病情评估':'assessment','医师综合评估':'assessment','诊疗计划':'supportPlan','治疗计划':'supportPlan','本次计划':'supportPlan','医师意见':'supportPlan','中医治疗':'tcmPlan','中医治法':'tcmPlan','西医治疗':'tumorPlan','抗肿瘤治疗':'tumorPlan','外治':'externalPlan','中医外治':'externalPlan','中药处方':'prescriptionRaw','护理':'nursingPlan','饮食':'dietPlan','检查计划':'checkPlan','复评计划':'followPlan','复查计划':'followPlan','观察与复评':'followPlan','沟通及宣教':'communication'
 };
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function extract(raw){
  raw=S(raw);const result={warnings:[],sourceRaw:raw},sections=[];
  const discussion=raw.search(/(?:拟诊讨论\s*[:：]|[^\n。；]{0,18}(?:主治|主任)(?:中)?医师查房(?:指示|意见)\s*[:：])/);
  const observation=discussion>=0?raw.slice(0,discussion):raw;
  const initial=V6QuickParse.extract(observation);Object.assign(result,initial);result.warnings=[...(initial.warnings||[])];
  const names=Object.keys(labels).sort((a,b)=>b.length-a.length).map(escape).join('|');
  const re=new RegExp('(^|[\n。；;，,]|[ \t]{2,})(?:[ \t]*[①②③④⑤⑥一二三四五六0-9]+[、.．]?[ \t]*)?('+names+')\\s*[:：]','gmi');
  let m;while((m=re.exec(raw)))sections.push({start:m.index+m[1].length,end:re.lastIndex,key:labels[m[2]]||labels[m[2].toUpperCase()],label:m[2]});
  const buckets={};
  for(let i=0;i<sections.length;i++){
   const x=sections[i],stop=i+1<sections.length?sections[i+1].start:raw.length;
   let value=S(raw.slice(x.end,stop)).replace(/(?:拟诊讨论|病例特点|入院诊断)\s*[:：]?\s*$/,'').replace(/[，,；;\s]+$/,'').trim();
   const facts=['symptoms','exam','tongue','coat','pulse','labRaw','pathologyReport','imagingReport','molecularReport'];
   if(discussion>=0&&x.start>=discussion&&facts.includes(x.key))continue;
   if(discussion>=0&&x.start<discussion&&stop>discussion)value=S(raw.slice(x.end,discussion));
   if(value)(buckets[x.key]??=[]).push(value);
  }
  for(const [key,values]of Object.entries(buckets)){
   const vals=unique(values);
   if(vals.length===1)result[key]=vals[0];
   else if(['labRaw','pathologyReport','imagingReport','molecularReport','history','presentIllness'].includes(key))result[key]=vals.join('\n');
   else{result.warnings.push('“'+key+'”有多处记载，请在提取内容中核对。');}
  }
  // Numbered first-note features are copied exactly, before the diagnostic discussion.
  const caseMatch=observation.match(/病例特点\s*[:：]\s*(?:1|一)[、.．]\s*([\s\S]*?)(?=\n\s*(?:2|二)[、.．]|$)/);
  if(caseMatch&&!result.presentIllness)result.presentIllness=S(caseMatch[1]);
  const examMatch=observation.match(/(?:^|[\n。])\s*(?:(?:2|二)[、.．]\s*)?PE\s*[:：]\s*([\s\S]*?)(?=(?:\n\s*(?:3|三)[、.．])?\s*辅助检查\s*[:：]|$)/i);
  if(examMatch)result.exam=S(examMatch[1]);
  // Named report sections already end at the next recognised heading. Extending
  // the tail here would swallow follow-up plans or re-import historical reports.
  // Histories may include yesterday's onset, but never fabricate today's observation.
  if(buckets.symptoms?.length){/* Explicit current symptoms take priority over history. */}
  else if(result.presentIllness)result.symptoms=result.presentIllness;
  else{
   const beforePE=observation.split(/\bPE\s*[:：]|查体\s*[:：]/i)[0];
   const said=beforePE.match(/患者(?:自)?诉\s*([\s\S]*)$/);
   if(said)result.symptoms=S(said[1]);
   else result.symptoms=S(result.symptoms).replace(/^.*?(?:首次病程记录|(?:主治|主任)(?:中)?医师查房记录)\s*/,'');
  }
  const admission=raw.match(/患者([^，,。\n]{1,20})[，,]\s*(男|女)[，,]\s*(\d{1,3})岁[。.]?\s*因[“"]([^”"]+)[”"]于\s*([^\n。]+?)入院/);
  if(admission){for(const [key,value]of Object.entries({name:admission[1],sex:admission[2],ageAtIndex:admission[3],chiefComplaint:admission[4],admissionDate:admission[5]}))if(!result[key])result[key]=S(value);}
  const day=observation.match(/入院第([一二三四五六七八九十百零〇\d]+)天/);if(day&&!result.day)result.day=day[1];
  const doctors=unique([...observation.matchAll(/(?:^|[，,。\n\s])([\u4e00-\u9fa5A-Za-zXx×]{1,12})(?:主治|主任)(?:中)?医师查房/g)].map(x=>x[1].replace(/^今日|^今/,'')));
  if(!result.doctor&&doctors.length===1)result.doctor=doctors[0];else if(doctors.length>1)result.warnings.push('查房医师有不同记载，请核对姓名。');
  const plan=raw.match(/(?:^|\n)\s*诊疗计划\s*[:：]\s*([\s\S]*)$/);
  if(plan){
   result.supportPlan=S(plan[1]);result.numberedPlan=true;
   const items=[...result.supportPlan.matchAll(/(?:^|\n)\s*([1-6])[、.．]\s*([^\n]*(?:\n(?!\s*[1-6][、.．])[^\n]*)*)/g)];
   const keys={1:'nursingPlan',2:'dietPlan',3:'checkPlan',4:'tcmPlan',5:'tumorPlan',6:'communication'};
   for(const item of items)if(!result[keys[item[1]]])result[keys[item[1]]]=S(item[2]);
  }
  if(!result.westernDiagnosis){const dx=raw.match(/(?:本案)?西医诊断(?:为)?\s*[:：]\s*([\s\S]*?)(?=诊断依据|(?:\n|。)\s*(?:治疗|病情评估|诊疗计划|入院诊断)|$)/);if(dx)result.westernDiagnosis=S(dx[1]).replace(/[。；]+$/,'');}
  if(!result.tcmDisease){const disease=raw.match(/(?:当属|属于)(?:祖国医学|中医)?[“"「]([^”"」]+)[”"」]范畴/);if(disease)result.tcmDisease=S(disease[1]);}
  if(!result.syndrome){const syndrome=raw.match(/(?:证当\s*[:：]?|证属\s*[:：]?|辨证(?:考虑|为)\s*[:：]?|乃)([\u4e00-\u9fa5]{2,10}?)(?:证[。；，,]|所致|[。；])/);if(syndrome)result.syndrome=syndrome[1].replace(/证$/,'')+'证';}
  // Extract tongue/pulse only from observed narrative + PE, not the authored discussion.
  const four=V6QuickParse.extract(['本次症状：'+S(result.symptoms),'本次查体：'+S(result.exam)].join('\n'));
  for(const key of ['tongue','coat','pulse']){
   result[key]=four[key]||'';
   // The broad source scan may have rejected yesterday's findings; an isolated
   // current observation must not keep a contradictory 'not filled' warning.
   if(result[key]){const field={tongue:'舌质',coat:'舌苔',pulse:'脉象'}[key];result.warnings=result.warnings.filter(w=>!w.startsWith(field+'含既往或昨日记载'));}
  }
  result.warnings=unique([...result.warnings,...four.warnings]);return result;
 }
 g.V64Parse=Object.freeze({extract});
})(globalThis);
