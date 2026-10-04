/* Offline conversation routing. This module does not claim general LLM comprehension. */
(function(g){
 'use strict';
 const S=x=>String(x??'').trim();
 const fields={qName:'姓名',qSex:'性别',qAge:'年龄',qAdmissionDate:'入院时间',qChiefComplaint:'主诉',qDoctor:'查房医师',qDay:'入院天数',qWestern:'西医诊断',qTcmDisease:'中医病名',qSyndromeCustom:'证型',qSymptoms:'本次症状',qPresentIllness:'现病史',qHistory:'既往史',qExam:'查体',qTongue:'舌质',qCoat:'舌苔',qPulse:'脉象',qLabRaw:'检查结果',qPathology:'病理报告',qImaging:'影像报告',qMolecular:'分子检测',qDiagnosisBasis:'诊断依据',qStage:'分期',qTcmEvidence:'辨证依据',qTcmDiff:'中医鉴别',qWesternDiff:'西医鉴别',qAssessment:'病情评估',qPlan:'诊疗计划',qTcmPlan:'中医治疗',qPrescription:'中药处方',qExternalPlan:'中医外治',qTumorPlan:'西医治疗',qNursing:'护理',qDiet:'饮食',qCheckPlan:'拟完善检查',qFollowPlan:'观察与复评',qCommunication:'沟通及宣教'};
 const aliases={...Object.fromEntries(Object.entries(fields).map(([k,v])=>[v,k])),'症状':'qSymptoms','今日症状':'qSymptoms','今日病情':'qSymptoms','本次病情':'qSymptoms','PE':'qExam','辅助检查':'qLabRaw','检验结果':'qLabRaw','病理':'qPathology','影像':'qImaging','检查计划':'qCheckPlan','复查计划':'qFollowPlan','治疗计划':'qPlan','医师意见':'qPlan','中医辨证依据':'qTcmEvidence'};
 const singular=new Set(['qName','qSex','qAge','qAdmissionDate','qChiefComplaint','qDoctor','qDay','qWestern','qTcmDisease','qSyndromeCustom','qTongue','qCoat','qPulse','qStage','qSyndromeCustom']);
 const types={'首次病程记录':'首次病程记录','主治查房记录':'主治中医师查房记录','主治中医师查房记录':'主治中医师查房记录','主任查房记录':'主任中医师查房记录','主任中医师查房记录':'主任中医师查房记录','日常病程记录':'日常病程记录'};
 function plan(message,values={},target=''){
  const text=S(message);if(!text)return {kind:'empty'};
  if(text.length>30000)return {kind:'help',message:'本条资料较长，请分成几次补充（每次不超过3万字）。'};
  const analysis=text.match(/^(?:请|帮我)?(?:分析|解读)(?:一下)?(化验单|检查结果|处方|肿瘤|分期)(?:[：:]([\s\S]*))?[。！!]?$/);
  if(analysis)return {kind:'analysis',tool:{'化验单':'reports','检查结果':'reports','处方':'prescription','肿瘤':'oncology','分期':'staging'}[analysis[1]],raw:S(analysis[2])};
  const type=text.match(/^(?:请)?(?:改成|改为|换成|生成|写一份)?(首次病程记录|主治(?:中医师)?查房记录|主任(?:中医师)?查房记录|日常病程记录)(?:的格式|格式)?[。！!]?$/);
  if(type)return {kind:'update',fields:{qType:types[type[1]]},label:'更改记录类型'};
  if(/^(?:请)?(?:生成|更新|整理)(?:完整)?(?:病历|草稿|正文)[。！!]*$/.test(text))return {kind:'update',fields:{},label:'更新病历'};
  if(target&&fields[target])return {kind:'update',fields:{[target]:text},label:'修改'+fields[target]};
  if(/^(?:请)?(?:帮我|你)?(?:分析|判断|解释|润色|缩写|扩写|优化|重写|改写|推荐|开药|诊断(?!依据))|^(?:怎么|如何)|吗[？?]$/.test(text))return {kind:'help',message:'你可以在下方选择本次临床判断；要修改表述，可点选要改的资料项并填写替换内容。当前对话支持资料整理和明确修改，开放式医学问答仍在验证。'};
  if(!S(values.qToday))return {kind:'update',raw:text,fields:{},label:'整理首次提供的资料'};
  const patches={},lines=text.split('\n');let active=null,recognized=false;
  for(const line of lines){
   const m=line.match(/^\s*(补充|追加|修改|更正|替换)?\s*([^：:]{1,12})[：:]\s*(.*)$/);
   const id=m&&aliases[m[2]];
   if(id){recognized=true;active=id;const replace=singular.has(id)||['修改','更正','替换'].includes(m[1]);patches[id]=replace?S(m[3]):[S(patches[id]??values[id]),S(m[3])].filter(Boolean).join('\n');}
   else if(active)patches[active]+='\n'+line;
   else if(S(line))return {kind:'choose',message:text};
  }
  if(!recognized)return {kind:'choose',message:text};
  if(Object.values(patches).some(v=>!S(v)))return {kind:'help',message:'请在资料项后填写本次内容；清空某项请在“全部资料”中直接操作。'};
  return {kind:'update',fields:patches,label:'补充或修改本次资料'};
 }
 function questions(v){
  const first=/首次/.test(v.qType),round=/查房/.test(v.qType);
  const ids=[...(first?['qName','qSex','qAge','qAdmissionDate','qChiefComplaint','qPresentIllness']:[]),...(round?['qDoctor']:[]),'qSymptoms','qExam','qWestern','qTcmDisease','qSyndromeCustom','qTongue','qCoat','qPulse','qLabRaw','qPlan'];
  return ids.filter(id=>!S(v[id])&&!(id==='qSyndromeCustom'&&v.qSyndrome&&v.qSyndrome!=='__custom')).slice(0,3).map(id=>({id,label:'补充'+fields[id]}));
 }
 function mergeBlocks(previous,blocks,next){
  const oldText=blocks.map(b=>b.text).join('\n\n');
  if(previous===oldText||!previous.trim())return {text:next.map(b=>b.text).join('\n\n'),conflicts:[]};
  const conflicts=[];let text=previous;const nextMap=new Map(next.map(b=>[b.id,b.text]));
  for(const b of blocks){const replacement=nextMap.get(b.id)||'';if(b.text===replacement)continue;
   const at=text.indexOf(b.text);if(at<0||text.indexOf(b.text,at+1)>=0){conflicts.push(b.id);continue;}text=text.slice(0,at)+replacement+text.slice(at+b.text.length);
  }
  const oldIds=new Set(blocks.map(b=>b.id));
  for(let i=0;i<next.length;i++){const b=next[i];if(oldIds.has(b.id))continue;
   const anchor=next.slice(i+1).find(x=>oldIds.has(x.id)&&text.includes(x.text));
   if(anchor)text=text.replace(anchor.text,b.text+'\n\n'+anchor.text);else text+=(text?'\n\n':'')+b.text;
  }
  return {text,conflicts};
 }
 function validateHistory(x){
  if(x===undefined)return [];
  if(!Array.isArray(x)||x.length>120||x.reduce((n,m)=>n+(typeof m?.text==='string'?m.text.length:0),0)>200000)throw Error('对话历史格式有误');
  return x.map(m=>{if(!m||!['user','assistant'].includes(m.role)||typeof m.text!=='string'||m.text.length>30000)throw Error('对话历史内容无效');return {role:m.role,text:m.text};});
 }
 g.BingliConversation=Object.freeze({fields,plan,questions,mergeBlocks,validateHistory});
})(globalThis);
