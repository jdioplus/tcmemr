(function(){
 'use strict';
 const $=id=>document.getElementById(id),S=v=>String(v??'').trim(),end=v=>S(v).replace(/[。；;，,]+$/,'')+'。';
 const fieldMap={name:'qName',doctor:'qDoctor',sex:'qSex',ageAtIndex:'qAge',chiefComplaint:'qChiefComplaint',admissionDate:'qAdmissionDate',day:'qDay',hospitalNumber:'qHospitalNumber',westernDiagnosis:'qWestern',tcmDisease:'qTcmDisease',presentIllness:'qPresentIllness',symptoms:'qSymptoms',history:'qHistory',exam:'qExam',tongue:'qTongue',coat:'qCoat',pulse:'qPulse',labRaw:'qLabRaw',pathologyReport:'qPathology',imagingReport:'qImaging',molecularReport:'qMolecular',diagnosisBasis:'qDiagnosisBasis',stage:'qStage',tcmEvidence:'qTcmEvidence',tcmDifferential:'qTcmDiff',westernDifferential:'qWesternDiff',assessment:'qAssessment',supportPlan:'qPlan',tcmPlan:'qTcmPlan',prescriptionRaw:'qPrescription',externalPlan:'qExternalPlan',tumorPlan:'qTumorPlan',nursingPlan:'qNursing',dietPlan:'qDiet',checkPlan:'qCheckPlan',followPlan:'qFollowPlan',communication:'qCommunication'};
 const fieldIds=[...new Set(['qType','qDate','qToday','qCancer','qSyndrome','qSyndromeCustom','qSyndromeConfirmed','qIncludeClassics',...Object.values(fieldMap)])];
 let state=null,selections={},selectedBooks=new Set(),changed=false,autoFilled={},toolResults={},extraCorpus=[];
 const cancers=[...new Set(TCM_PROFILES.map(p=>p.cancer))];
 cancers.forEach(c=>{$('qCancer').add(new Option(c,c));$('diseases').append(new Option(c,c));});
 function dateNow(){const d=new Date(),pad=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}
 $('qDate').value=dateNow();
 function updateSyndromes(value=''){$('qSyndrome').replaceChildren(new Option('待辨证',''));const c=$('qCancer').value;c&&TCM_PROFILES.filter(p=>p.cancer===c).forEach(p=>$('qSyndrome').add(new Option(p.syndrome,p.syndrome)));$('qSyndrome').add(new Option('其他（填写）','__custom'));$('qSyndrome').value=value;$('qSyndromeCustom').hidden=$('qSyndrome').value!=='__custom';}
 updateSyndromes();
 function inputs(){return Object.fromEntries(fieldIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
 function inputSignature(){return JSON.stringify(inputs());}
 function notify(message){$('qStatus').textContent=message;}
 function reviewReset(){ $('qReviewed').checked=false;syncCopy(); }
 function treatmentConflict(){
  if(!state)return '';
  const plan=[state.encounter.supportPlan,state.encounter.tumorPlan,state.encounter.tcmPlan].map(S).join('；'),primary=selections.treatment?.primary;
  const continuing=/(?:继续|维持)(?:现有|原|目前|当前)?(?:抗肿瘤治疗|化疗|系统治疗|免疫治疗|靶向治疗|治疗方案|方案|治疗)/.test(plan);
  const pausing=/(?:暂缓|暂停|停止)(?:现有|原|目前|当前)?(?:抗肿瘤治疗|化疗|系统治疗|免疫治疗|靶向治疗|治疗方案|方案|治疗)/.test(plan);
  return (primary==='defer'&&continuing||primary==='continue'&&pausing)?'治疗选择与录入计划不一致。请修改本次医师意见，重新生成并核对后复制。':'';
 }
 function syncCopy(){const conflict=treatmentConflict();$('qConflict').textContent=conflict;$('qConflict').hidden=!conflict;const ok=Boolean(state&&!changed&&!conflict&&S($('qNote').value)&&$('qReviewed').checked);$('qCopy').disabled=!ok;$('downloadNote').disabled=!ok;}
 function cleanSigns(text){return S(text).split(/[。；;\n]/).map(part=>part.split(/[，,]/).filter(x=>!/^\s*(?:(?:舌质|舌象|舌苔|脉象)\s*[:：]|(?:舌|苔|脉)\s*[:：]|舌[淡红绛紫暗胖瘦]|苔[薄厚白黄腻少无]|脉[弦细沉浮滑涩弱数])/u.test(x)).join('，')).filter(S).join('；');}
 function infoWarnings(list){const ul=$('reviewWarnings');ul.replaceChildren();[...new Set(list.filter(Boolean))].forEach(w=>{const li=document.createElement('li');li.textContent=w;ul.append(li);});$('reviewDetails').hidden=!ul.children.length;}
 function quoteText(){return [...selectedBooks].map(id=>ANCIENT_BOOKS.find((b,i)=>(b.id||String(i))===id)).filter(Boolean).map(b=>'《'+b.book+(b.chapter?'·'+b.chapter:'')+'》载：“'+S(b.text).replace(/[。；;]+$/,'')+'。”').join('\n');}
 function role(e){return /主任/.test(e.recordType)?'主任中医师':/主治/.test(e.recordType)?'主治中医师':'';}
 function doctor(e){return S(e.doctor).replace(/(?:主治|主任)(?:中)?医师$/,'')||'【查房医师姓名】';}
 function ancillary(e){const values=[];if(e.labRaw)values.push(e.labRaw);for(const [label,key]of [['病理','pathologyReport'],['影像','imagingReport'],['分子检测','molecularReport']])if(S(e[key])&&!S(e.labRaw).includes(S(e[key])))values.push(label+'：'+e[key]);return values.join('\n');}
 function composePlan(e,chosen){
  if(/^\s*1[、.．]/.test(e.supportPlan))return e.supportPlan;
  const tcm=[e.tcmPlan,e.externalPlan,e.prescriptionRaw?'中药处方：'+e.prescriptionRaw:''].filter(S).join('\n');
  return ['1、'+end(e.nursingPlan||'【本次护理安排待补】'),'2、'+end(e.dietPlan||'【本次饮食安排待补】'),'3、'+end(e.checkPlan||'【拟完善检查待医师选择或填写】'),'4、中医治疗：'+end(tcm||'【本次中医治疗安排待补】'),'5、西医治疗及观察：'+end([e.tumorPlan,e.supportPlan,e.followPlan].filter(S).join('；')||'【本次西医治疗及复评安排待补】'),'6、沟通及宣教：'+end(e.communication||'【本次沟通与宣教待补】')].join('\n');
 }
 function compose(data){
  const {patient:p,encounter:e,cards,tcm,rxText,analysis={}}=data,chosen=V63Decisions.resolve(cards,selections),blocks=[];
  const add=(id,text)=>{if(S(text))blocks.push({id,text:S(text)});};
  const first=/首次/.test(e.recordType),round=/查房/.test(e.recordType);
  add('head',e.date.replace('T',' ')+'        '+(round?doctor(e)+role(e)+'查房记录':e.recordType));
  const signs=[e.tongue?'舌'+e.tongue.replace(/^舌(?:质)?/,''):'',e.coat?'苔'+e.coat.replace(/^(?:舌)?苔/,''):'',e.pulse?'脉'+e.pulse.replace(/^脉(?:象)?/,''):''].filter(Boolean).join('，');
  const exam=end(e.exam||'【本次实际查体待补】')+(signs&&!/舌|苔|脉[细弦沉浮滑涩弱数]/.test(e.exam)?end(signs):'');
  if(first){
   add('identity','患者'+(p.name||'【姓名】')+'，'+(p.sex||'【性别】')+'，'+(p.ageAtIndex?p.ageAtIndex+'岁':'【年龄】')+'。因“'+S(e.chiefComplaint||'【主诉待补】').replace(/[。]+$/,'')+'”于'+(p.admissionDate||'【入院日期及时间】')+'入院。');
   add('features','病例特点：');add('condition','1、'+end(e.presentIllness||e.symptoms||'【现病史待补】')+(p.history?'\n既往及肿瘤诊疗史：'+end(p.history):''));
   add('exam','2、PE：'+exam);add('labs','3、辅助检查：\n'+(ancillary(e)||'【本次检查资料待补】'));
   add('discussion','拟诊讨论：\n中医辨病辨证依据及鉴别诊断：');
  }else{
   const intro=round?'今日'+(e.day?'为患者入院第'+e.day+'天，':'')+doctor(e)+role(e)+'查房，患者诉':'患者诉';
   add('condition',intro+end(S(e.symptoms).replace(/^患者(?:自)?诉/, '')||'【本次病情及变化待补】')+'\nPE：'+exam);
   if(ancillary(e))add('labs','辅助检查：'+ancillary(e));
   add('discussion',round?doctor(e)+role(e)+'查房指示：':'病情分析与处理：');
  }
  add('tcm',analysis.tcmText||tcm.text);
  add('tcmDifferential',analysis.tcmDifferential||e.tcmDifferential);
  const quote=quoteText();if(quote)add('classics',quote);
  if(first)add('westernHeading','西医诊断依据及鉴别诊断：');
  add('western',analysis.westernText||(e.westernDiagnosis?'结合病史、症状、体征及辅助检查，本案西医诊断为：'+end(e.westernDiagnosis):'【本次西医诊断待医师填写】'));
  if(first){
   add('basis','诊断依据如下：\n1、病史：'+end([e.chiefComplaint,p.history].filter(S).join('；')||e.presentIllness||'【诊疗史待补】')+'\n2、症状：'+end(cleanSigns(e.symptoms)||e.chiefComplaint||'【本次症状待补】')+'\n3、体征：'+exam+'\n4、辅助检查：'+(e.diagnosisBasis?end(e.diagnosisBasis):ancillary(e)?'见上述检查资料。':'【检查依据待补】'));
  }
  const clinical=cards.filter(c=>c.id!=='treatment');
  if(first&&clinical.length)add('analysisHeading','本次主要问题及鉴别分析：');
  clinical.forEach(c=>add('judgment_'+c.id,chosen.textById[c.id]||c.defaultText));
  const treatment=cards.find(c=>c.id==='treatment');
  const treatmentChoice=chosen.selections.treatment;
  if(treatment&&(treatmentChoice?.primary||treatmentChoice?.extra||treatmentChoice?.checks.length))add('judgment_treatment','本次治疗决定：'+chosen.textById.treatment);
  if(first){
   add('admissionDiagnosis','入院诊断：\n中医诊断：'+(e.tcmDisease||'【中医病名】')+'\n　　　　　'+(e.syndrome||'【证型】')+'\n西医诊断：'+(e.westernDiagnosis||'【西医诊断】'));
   add('assessment','病情评估：\n'+(e.assessment||'【补充本次实际病情、营养、体能及自理能力等评估】'));
   add('plan','诊疗计划：\n'+composePlan(e,chosen));
  }else{
   if(e.assessment)add('assessment',(/主任/.test(e.recordType)?'综合评估：':'本次评估：')+end(e.assessment));
   const plans=[e.tcmPlan,e.externalPlan,e.tumorPlan,e.supportPlan,e.nursingPlan,e.dietPlan,e.checkPlan,e.communication].filter(S);
   if(plans.length)add('plan',plans.map(end).join('\n'));
   else add('plan','【本次医师诊疗安排待补】');
  }
  if(rxText)add('rx',rxText);
  add('follow',analysis.followText||e.followPlan);
  for(let i=0;i<extraCorpus.length;i++)add('corpus_'+i,extraCorpus[i].text);
  if(first)add('signature','书写医师：【医师核对并签名】');
  return {text:blocks.map(b=>b.text).join('\n\n'),blocks,chosen};
 }
 function judgmentChanged(key,value){
  if(changed){notify('本次资料已变化，请重新生成草稿后选择判断。');return;}
  const old=compose(state),id='judgment_'+key,previous=old.blocks.find(b=>b.id===id)?.text||'';
  const prior={...selections};selections={...selections,[key]:value};const next=compose(state),replacement=next.blocks.find(b=>b.id===id)?.text||'';
  if(previous&&$('qNote').value.includes(previous)){$('qNote').value=$('qNote').value.replace(previous,replacement);state.blocks=next.blocks;state.encounter.clinicalSelections=JSON.stringify(next.chosen.selections);notify('已更新对应判断；其他正文编辑保留。');}
  else if(!previous&&replacement){const index=next.blocks.findIndex(b=>b.id===id),anchor=next.blocks.slice(index+1).find(b=>$('qNote').value.includes(b.text));if(anchor)$('qNote').value=$('qNote').value.replace(anchor.text,replacement+'\n\n'+anchor.text);else $('qNote').value+='\n\n'+replacement;state.blocks=next.blocks;state.encounter.clinicalSelections=JSON.stringify(next.chosen.selections);notify('已加入本次治疗决定。');}
  else{selections=prior;notify('该分析段已被手动改写，未覆盖你的文字。请直接修订该段，或重新生成后选择。');}
  reviewReset();V63ReviewUI.render(state.cards.map(c=>({...c,contextNote:V63Decisions.resolve(state.cards,selections).textById[c.id]||c.defaultText})),judgmentChanged,selections);
 }
 function extractIntoInputs(){
  const found=V64Parse.extract($('qToday').value),issues=[...(found.warnings||[])],filled=[];
  for(const [key,id]of Object.entries(fieldMap)){
   const next=S(found[key]),current=$(id).value;
   if(!current||Object.prototype.hasOwnProperty.call(autoFilled,id)&&current===autoFilled[id]){$(id).value=next;autoFilled[id]=$(id).value;if(next)filled.push($(id).closest('label')?.childNodes[0]?.textContent?.trim()||key);}
   else if(next&&S(current)!==next)issues.push(($(id).closest('label')?.childNodes[0]?.textContent?.trim()||key)+'与粘贴资料不同，保留手动填写内容，请核对。');
  }
  const known=[found.tcmDisease,found.westernDiagnosis].filter(S).map(v=>cancers.find(c=>v===c||(c==='肺癌'&&/肺.*癌/.test(v))||(c==='胃癌'&&/胃.*癌/.test(v)))).find(Boolean)||'';
  if(!$('qCancer').value||autoFilled.qCancer===$('qCancer').value){if($('qCancer').value!==known){$('qCancer').value=known;updateSyndromes();$('qSyndromeConfirmed').checked=false;}autoFilled.qCancer=known;}
  if(!$('qSyndrome').value||autoFilled.qSyndrome===$('qSyndrome').value){
   const prior=$('qSyndrome').value==='__custom'?$('qSyndromeCustom').value:$('qSyndrome').value;
   const same=[...$('qSyndrome').options].find(o=>o.value.replace(/亏虚/g,'虚')===S(found.syndrome).replace(/亏虚/g,'虚'));
   $('qSyndrome').value=same?same.value:found.syndrome?'__custom':'';$('qSyndromeCustom').value=found.syndrome||'';$('qSyndromeCustom').hidden=$('qSyndrome').value!=='__custom';autoFilled.qSyndrome=$('qSyndrome').value;
   if(prior!==S(found.syndrome))$('qSyndromeConfirmed').checked=false;
  }
  $('qExtractSummary').textContent=filled.length?'已整理：'+[...new Set(filled)].join('、')+'。可在下方展开核对。':'已保留粘贴原文及手动填写内容。';
  return {found,issues};
 }
 function collect(){
  const {found,issues}=extractIntoInputs(),values=Object.fromEntries(Object.entries(fieldMap).map(([key,id])=>[key,S($(id).value)]));
  const p={...values,cancer:$('qCancer').value};
  const e={...values,date:$('qDate').value,recordType:$('qType').value,cancer:p.cancer,symptoms:values.symptoms||found.symptoms,presentIllness:values.presentIllness||(/首次/.test($('qType').value)?found.symptoms:''),syndrome:$('qSyndrome').value==='__custom'?S($('qSyndromeCustom').value):$('qSyndrome').value,syndromeStatus:$('qSyndromeConfirmed').checked?'confirmed':'unconfirmed',includeClassics:$('qIncludeClassics').checked,includeDiseaseClassics:false,clinicalSelections:JSON.stringify(selections),labAnalysis:toolResults.reports?.analysis||'',prescriptionAnalysis:toolResults.prescription?.analysis||'',sourceRaw:S($('qToday').value)};
  if(e.labRaw){const r=analyzePastedReport(e.labRaw,{sex:p.sex,age:p.ageAtIndex,allowClinicalThresholds:true,symptoms:e.symptoms,treatmentInfo:p.history});e.labItems=r.items;issues.push(...r.warnings);}else e.labItems=[];
  return {p,e,issues};
 }
 function generate(options={}){
  const raw=S($('qToday').value);if(!raw){notify('请粘贴本次实际资料。');$('qToday').focus();return false;}
  if(!$('qDate').value){notify('请填写本次记录时间。');return false;}
  if(state&&$('qNote').value!==compose(state).text&&!options.restoring&&!window.confirm('重新生成会替换当前正文中的手动修改。是否继续？'))return false;
  const {p,e,issues}=collect();
  const positiveText=V63Facts.positive({...e,symptoms:e.symptoms+(/首次/.test(e.recordType)&&e.chiefComplaint?'\n本次主诉：'+e.chiefComplaint:'')});
  const context={positiveText,labItems:e.labItems},specialty=globalThis.V65Western?.review(p,e)||{cards:[],warnings:[],sources:[]},cards=[...V63Decisions.build(p,e,context),...specialty.cards];issues.push(...specialty.warnings);
  const valid=V63Decisions.resolve(cards,selections);selections=valid.selections;e.clinicalSelections=JSON.stringify(selections);
  const tcm=V5Clinical.tcmAnalysis(p,e),analysis=V64Analysis.build(p,e,{...context,decisionCards:cards,skillRules:SKILL_RULES});issues.push(...tcm.warnings,...analysis.warnings);
  if(!e.westernDiagnosis)issues.push('西医诊断未填写');
  if(/首次/.test(e.recordType)&&!e.chiefComplaint)issues.push('首次病程主诉未填写');
  if(/查房/.test(e.recordType)&&!e.doctor)issues.push('查房医师姓名未填写');
  let rxText='';if(e.prescriptionRaw){const r=V5Rx.analyze(e.prescriptionRaw,{cancer:p.cancer,syndrome:e.syndromeStatus==='confirmed'?e.syndrome:'',symptoms:e.symptoms,tongue:e.tongue,coat:e.coat,pulse:e.pulse});issues.push(...r.warnings);rxText='中药处方：\n'+e.prescriptionRaw;const groups=(r.groups||[]).map(g=>{const herbs=(g.herbs||[]).map(h=>typeof h==='string'?h:h.standardName||h.name||h.rawName||'').filter(Boolean).join('、');return herbs?herbs+'用于'+g.label:'';}).filter(Boolean);if(groups.length)rxText+='\n方药功效分析：'+groups.join('；')+'。';}
  state={patient:p,encounter:e,cards,tcm,analysis,rxText,sources:specialty.sources,signature:inputSignature()};const result=compose(state);state.blocks=result.blocks;$('qNote').value=result.text;changed=false;reviewReset();infoWarnings(issues);
  $('qDecisionReview').hidden=!cards.length;$('reviewGuide').hidden=!cards.length;V63ReviewUI.render(cards.map(c=>({...c,contextNote:result.chosen.textById[c.id]||c.defaultText})),judgmentChanged,selections);
  notify('草稿已生成。可选择本次判断，再核对、修改正文。');return true;
 }
 function renderBooks(){
  const q=S($('bookSearch').value),host=$('bookList');host.replaceChildren();
  const visible=ANCIENT_BOOKS.map((b,i)=>({...b,id:b.id||String(i)})).filter(b=>!q||[b.book,b.chapter,b.title,b.text,...(b.tags||[])].join(' ').includes(q));
  visible.slice(0,30).forEach(b=>{const div=document.createElement('div');div.className='book-entry';const title=document.createElement('strong');title.textContent='《'+b.book+'》'+(b.chapter?' · '+b.chapter:'');const p=document.createElement('p');p.textContent=b.text;const label=document.createElement('label');label.className='check';const box=document.createElement('input');box.type='checkbox';box.checked=selectedBooks.has(b.id);label.append(box,document.createTextNode('选入本次中医分析'));box.onchange=()=>{if(box.checked)selectedBooks.add(b.id);else selectedBooks.delete(b.id);if(state){const old=state.blocks.find(x=>x.id==='classics')?.text||'',quote=quoteText(),next=quote||'';if(old&&$('qNote').value.includes(old))$('qNote').value=$('qNote').value.replace(old,next);else if(!old&&next){const target=state.blocks.find(x=>x.id==='tcm')?.text;if(target&&$('qNote').value.includes(target))$('qNote').value=$('qNote').value.replace(target,target+'\n\n'+next);else $('qNote').value+='\n\n'+next;}else if(old)notify('你已改写引文段，保留现有正文，请手动修订。');state.blocks=compose(state).blocks;reviewReset();}};const src=document.createElement('p');src.className='book-source';src.textContent=b.sourcePath?'来源：'+b.sourcePath+(b.sourceStartLine?'（原文件第'+b.sourceStartLine+'行起）':''):'';div.append(title,p,label,src);host.append(div);});
  if(!visible.length)host.textContent=q?'未找到匹配摘录。':'正在整理古籍摘录。';
 }
 function clear(){if((S($('qToday').value)||S($('qNote').value))&&!window.confirm('清空本例资料及正文，开始下一例？'))return;for(const id of fieldIds){const el=$(id);if(el.type==='checkbox')el.checked=false;else if(id==='qType')el.value='首次病程记录';else if(id==='qDate')el.value=dateNow();else el.value='';}state=null;selections={};selectedBooks.clear();autoFilled={};toolResults={};extraCorpus=[];changed=false;$('qIncludeClassics').checked=true;updateSyndromes();$('qNote').value='';$('qDecisionReview').replaceChildren();$('qDecisionReview').hidden=true;$('reviewGuide').hidden=true;infoWarnings([]);renderBooks();reviewReset();$('copyStatus').textContent='';notify('已清空本例，粘贴下一例资料。');}
 function download(filename,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('qGenerate').onclick=()=>generate();$('qClear').onclick=clear;$('qExtract').onclick=()=>{const r=extractIntoInputs();infoWarnings(r.issues);notify('资料已整理，可展开核对后生成病程。');};
 $('qCopy').onclick=async()=>{if($('qCopy').disabled)return;let ok=false;try{await navigator.clipboard.writeText($('qNote').value);ok=true;}catch(_){$('qNote').focus();$('qNote').select();try{ok=document.execCommand('copy');}catch(_){} }$('copyStatus').textContent=ok?'正文已复制。':'请选中正文，手动复制。';};
 $('downloadNote').onclick=()=>{if(!$('downloadNote').disabled)download('病程正文.txt',$('qNote').value,'text/plain;charset=utf-8');};
 $('saveDraft').onclick=()=>{if(!state||changed){notify('请先生成本次草稿，再保存。');return;}download('病程草稿.json',JSON.stringify({format:'bingli-mini',version:1,inputs:inputs(),clinicalSelections:JSON.stringify(selections),selectedBooks:[...selectedBooks],autoFilled,toolResults,extraCorpus,noteText:$('qNote').value},null,2),'application/json');notify('草稿文件已保存，包含本次资料及已选判断。');};
 $('openDraft').onclick=()=>$('draftFile').click();
 function applyInputs(values){for(const id of fieldIds){if(id==='qSyndrome')continue;const el=$(id);if(el.type==='checkbox')el.checked=values[id]===true;else el.value=typeof values[id]==='string'?values[id]:'';}updateSyndromes(values.qSyndrome||'');}
 function validateDraft(data){
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!object(data)||data.format!=='bingli-mini'||data.version!==1||!object(data.inputs)||typeof data.noteText!=='string')throw new Error('不是本简版的草稿文件');
  const values={};for(const id of fieldIds){const v=data.inputs[id];if(v!==undefined&&typeof v!==($(id).type==='checkbox'?'boolean':'string'))throw new Error('草稿字段格式有误：'+id);values[id]=v===undefined?($(id).type==='checkbox'?false:''):v;}
  if(![...$('qType').options].some(o=>o.value===values.qType)||!S(values.qToday))throw new Error('草稿缺少有效病程类型或本次资料');
  const date=document.createElement('input');date.type='datetime-local';date.value=values.qDate;if(!date.value)throw new Error('草稿记录时间无效');
  const choices=typeof data.clinicalSelections==='string'?JSON.parse(data.clinicalSelections):data.clinicalSelections??{};
  if(!object(choices)||Object.values(choices).some(v=>!object(v)))throw new Error('草稿判断选择格式有误');
  if(data.selectedBooks!==undefined&&!Array.isArray(data.selectedBooks))throw new Error('草稿古籍选择格式有误');
  const books=(data.selectedBooks||[]).filter(id=>typeof id==='string'&&ANCIENT_BOOKS.some((b,i)=>(b.id||String(i))===id));
  const auto=object(data.autoFilled)?Object.fromEntries(Object.entries(data.autoFilled).filter(([id,v])=>fieldIds.includes(id)&&typeof v==='string')):{};
  const results=object(data.toolResults)?Object.fromEntries(Object.entries(data.toolResults).filter(([id,v])=>['reports','prescription','staging'].includes(id)&&object(v)).map(([id,v])=>[id,Object.fromEntries(Object.entries(v).filter(([k,x])=>['raw','analysis','stage','date','cancer','dosageForm'].includes(k)&&typeof x==='string'))])):{};
  const corpus=Array.isArray(data.extraCorpus)?data.extraCorpus.filter(x=>object(x)&&typeof x.text==='string').map(x=>({id:S(x.id),text:x.text})):[];
  return {values,choices,books,auto,results,corpus,noteText:data.noteText};
 }
 $('draftFile').onchange=async()=>{
  const file=$('draftFile').files[0];if(!file)return;let backup=null;
  try{
   if(file.size>2*1024*1024)throw new Error('草稿文件过大');
   const data=validateDraft(JSON.parse(await file.text()));
   if((S($('qToday').value)||S($('qNote').value))&&!window.confirm('载入草稿会替换当前这一例，是否继续？'))return;
   backup={values:inputs(),state,selections,books:new Set(selectedBooks),autoFilled,toolResults,extraCorpus,changed,note:$('qNote').value,reviewed:$('qReviewed').checked,warnings:[...$('reviewWarnings').children].map(x=>x.textContent)};
   applyInputs(data.values);selections=data.choices;selectedBooks=new Set(data.books);autoFilled=data.auto;toolResults=data.results;extraCorpus=data.corpus;state=null;
   if(!generate({restoring:true}))throw new Error('草稿未能生成');
   $('qNote').value=data.noteText;renderBooks();reviewReset();notify('草稿已打开，已选判断保留。请重新核对正文。');
  }catch(error){
   if(backup){applyInputs(backup.values);state=backup.state;selections=backup.selections;selectedBooks=backup.books;autoFilled=backup.autoFilled;toolResults=backup.toolResults;extraCorpus=backup.extraCorpus;changed=backup.changed;$('qNote').value=backup.note;$('qReviewed').checked=backup.reviewed;infoWarnings(backup.warnings);$('qDecisionReview').hidden=!state?.cards.length;$('reviewGuide').hidden=!state?.cards.length;V63ReviewUI.render(state?.cards||[],judgmentChanged,selections);renderBooks();syncCopy();}
   notify('未打开草稿：'+error.message);
  }finally{$('draftFile').value='';}
 };
 $('bookSearch').oninput=renderBooks;renderBooks();
 $('qReviewed').onchange=syncCopy;$('qNote').oninput=()=>reviewReset();
 function formatHint(){$('formatHint').textContent=/首次/.test($('qType').value)?'病例特点 → 拟诊讨论 → 入院诊断 → 病情评估 → 诊疗计划':/查房/.test($('qType').value)?'本次病情、PE、检查 → 查房指示 → 辨证与西医分析 → 治疗及复评':'本次病情、PE、检查 → 病情分析与处理 → 本次计划及复评';}
 $('qType').addEventListener('change',formatHint);formatHint();
 for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>{
  const {p,e}=collect(),signature=inputSignature(),token='record-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  BingliTools.open(button.dataset.tool,{token,patient:p,encounter:{...e,noteText:$('qNote').value},noteText:$('qNote').value,label:(p.name||'本次病程')+' · '+e.date},result=>{
   if(result.token!==token||inputSignature()!==signature){notify('本次资料已变化，工具中的旧结果未带回。');return false;}
   if(result.kind==='library'){
    for(const row of result.entries||[])if(typeof row.text==='string')extraCorpus.push({id:S(row.id),text:row.text});
    if(result.raw)$('qNote').value+=(S($('qNote').value)?'\n\n':'')+result.raw;
    if(state)state.blocks=compose(state).blocks;reviewReset();notify('已选语料已带回正文，请核对与本例的对应。');return true;
   }
   if(result.kind==='generator'||result.kind==='workbench'){
    if(S($('qNote').value)&&!window.confirm('用工具中已核对的资料和正文替换当前草稿？'))return false;
    const x=result.kind==='workbench'?{...(result.patient||{}),...(result.encounter||{})}:{...(result.fields||{})};
    if(result.kind==='generator'){x.westernDiagnosis=x.diagnosis;x.name=x.patientName;x.ageAtIndex=x.age;}
    autoFilled={};toolResults={};extraCorpus=[];selectedBooks.clear();$('qSyndromeConfirmed').checked=false;for(const id of Object.values(fieldMap))$(id).value='';for(const [key,id]of Object.entries(fieldMap))if(typeof x[key]==='string'||typeof x[key]==='number')$(id).value=String(x[key]);
    if(x.cancer){$('qCancer').value=x.cancer;updateSyndromes(x.syndrome||'');}if(x.syndrome&&!$('qSyndrome').value){$('qSyndrome').value='__custom';$('qSyndromeCustom').value=x.syndrome;$('qSyndromeCustom').hidden=false;}
    const rt=x.recordType;if([...$('qType').options].some(o=>o.value===rt))$('qType').value=rt;
    if(x.date){const date=S(x.date).replace(' ','T');$('qDate').value=date.length===10?date+'T09:00':date;}
    $('qToday').value=x.sourceRaw||['现病史：'+S(x.presentIllness||x.symptoms),'查体：'+S(x.exam),'辅助检查：'+S(x.labRaw)].join('\n');
    selections={};state=null;generate({restoring:true});if(S(result.noteText))$('qNote').value=result.noteText;reviewReset();formatHint();notify('资料和正文已带回，请完成本次审核。');return true;
   }
   if(result.kind==='staging'&&result.cancer!==p.cancer){notify('分期癌种与当前病案不一致，未带回。');return false;}
   toolResults[result.kind]=result;
   if(result.kind==='reports'){$('qLabRaw').value=S(result.raw);delete autoFilled.qLabRaw;}
   if(result.kind==='prescription'){$('qPrescription').value=S(result.raw);delete autoFilled.qPrescription;}
   if(result.kind==='staging'){$('qStage').value=S(result.stage);delete autoFilled.qStage;}
   changed=Boolean(state);reviewReset();notify('结果已带回本次资料。重新生成后即可进入病程正文。');return true;
  });
 };
 for(const source of SKILL_RULES.sources||[]){const p=document.createElement('p'),a=document.createElement('a');a.textContent=source.name||source.id;a.href=source.url||source.skillUrl||'#';a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(' · '+(typeof source.license==='string'?source.license:source.license?.name||'详见来源许可')));$('skillSources').append(p);}
 for(const entry of WESTERN_UPDATES.entries||[]){
  const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=entry.cancer;detail.className='source-entry';detail.append(summary);
  for(const [label,key]of [['诊断','diagnosisFocus'],['分期','stagingFocus'],['分子检测','biomarkers'],['复评','followupFocus']]){const p=document.createElement('p'),v=entry[key];p.textContent=label+'：'+(Array.isArray(v)?v.join('；'):S(v));detail.append(p);}
  for(const source of entry.sources||[]){const p=document.createElement('p'),a=document.createElement('a');a.textContent=source.title||source.id;a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode(' · '+(source.version||'')+' · '+(source.access||'')+' · 核查 '+(source.reviewedAt||WESTERN_UPDATES.reviewedAt)));detail.append(p);}
  $('westernSources').append(detail);
 }
 for(const [name,content]of Object.entries(SKILL_LICENSE_TEXTS)){const detail=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=name;pre.textContent=content;detail.append(summary,pre);$('skillLicenses').append(detail);}
 $('inputs').addEventListener('change',event=>{const id=event.target.id;if(!fieldIds.includes(id))return;if(id==='qTcmDisease'&&!$('qCancer').value&&cancers.includes(S($('qTcmDisease').value))){$('qCancer').value=S($('qTcmDisease').value);updateSyndromes();}if(id==='qCancer'){updateSyndromes();$('qSyndromeConfirmed').checked=false;}if(id==='qSyndrome'){$('qSyndromeCustom').hidden=$('qSyndrome').value!=='__custom';$('qSyndromeConfirmed').checked=false;}if(['qSyndromeCustom','qTcmDisease'].includes(id))$('qSyndromeConfirmed').checked=false;});
 ['input','change'].forEach(type=>$('inputs').addEventListener(type,event=>{if(!fieldIds.includes(event.target.id))return;if(['qToday','qName','qWestern','qCancer','qTcmDisease','qSyndrome','qSyndromeCustom'].includes(event.target.id))selections={};if(['qToday','qName'].includes(event.target.id)){toolResults={};extraCorpus=[];selectedBooks.clear();$('qSyndromeConfirmed').checked=false;}if(event.target.id==='qLabRaw')delete toolResults.reports;if(event.target.id==='qPrescription')delete toolResults.prescription;if(event.target.id==='qStage')delete toolResults.staging;if(state){changed=true;notify('资料已修改，请重新生成本次草稿。');reviewReset();}}));
 window.addEventListener('beforeunload',event=>{if(S($('qToday').value)||S($('qNote').value)){event.preventDefault();event.returnValue='';}});
 globalThis.BingliMini=Object.freeze({generate,getState:()=>state?JSON.parse(JSON.stringify({...state,clinicalSelections:JSON.stringify(selections)})):null,clear});
})();
