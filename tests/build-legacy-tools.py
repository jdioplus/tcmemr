"""Prepare a read-only tools copy and a protected workbench copy of the original UI.

The returned document chooses its mode from iframe.name. The source file is never
modified. Tool engines and corpus entries are preserved verbatim.
"""
from pathlib import Path
import argparse
import re


BRIDGE = r'''
(function(){
 'use strict';
 const channel='bingli-legacy-v1',S=v=>String(v??''),clone=v=>JSON.parse(JSON.stringify(v));
 let context=null,api=null,currentKind='',pending=null;
 const only=(globalThis.__BINGLI_FRAME_MODE__||window.name)!=='protected'&&window.name!=='bingli-protected';globalThis.__BINGLI_TOOLS_ONLY__=only;
 const send=message=>{if(parent!==window)parent.postMessage({channel,...message},'*');};
 function result(kind,data,token=context?.token){
  if(!context||!token||token!==context.token){api?.toast('本次资料已变化，请重新载入后带回。');return false;}
  send({type:'result',kind,token,...clone(data||{})});return true;
 }
 function toolContext(){
  const p=context?.patient||{},e=context?.encounter||{};
  const date=S(e.date).split('T')[0];
  return {token:context?.token||'',label:context?.label||'本次病程',cancer:p.cancer||e.cancer||'',tcmDisease:e.tcmDisease||p.tcmDisease||'',syndrome:e.syndromeStatus==='confirmed'?e.syndrome||'':'',sex:p.sex||'',age:p.ageAtIndex||p.age||'',symptoms:e.symptoms||'',tongue:e.tongue||'',coat:e.coat||'',pulse:e.pulse||'',labRaw:e.labRaw||'',labDate:e.labDate||'',prescriptionRaw:e.prescriptionRaw||'',dosageForm:e.dosageForm||'unknown',date};
 }
 function open(kind){
  if(kind==='workbench'&&only){send({type:'open',kind,token:context?.token});return;}
  if(['reports','staging','prescription'].includes(kind)){
   document.dispatchEvent(new CustomEvent('v6-quick-tool-open',{detail:{kind,context:toolContext()}}));
  }else if(kind==='generator'){
   api.loadGenerator(context);api.showPane(kind);
  }else if(kind==='workbench'){
   globalThis.V5Workbench?.receiveLegacyContext(context);api.showPane(kind);
  }else api.showPane(kind);
  currentKind=kind;refreshToolbar();
 }
 function refreshToolbar(){
  for(const b of document.querySelectorAll('[data-legacy-pane]'))b.setAttribute('aria-current',b.dataset.legacyPane===currentKind?'page':'false');
  const returnButton=document.getElementById('legacyReturnCurrent');
  if(returnButton){returnButton.hidden=!['library','generator','workbench'].includes(currentKind);returnButton.textContent=currentKind==='library'?'把已选语料带回':currentKind==='generator'?'把此正文带回':'把当前记录带回';}
 }
 function receive(message){
  if(message.type==='context'){
   const incoming=message.context;if(!incoming||typeof incoming.token!=='string'||!incoming.token)return;
   context=clone(incoming);if(message.kind)open(message.kind);
  }else if(message.type==='invalidate'&&context&&message.token!==context.token){
   context=null;api?.toast('主页面资料已变化，旧工具结果不能回填。请重新打开工具载入本次资料。');
  }else if(message.type==='accepted')api?.toast(message.message||'结果已带回本次病程。');
  else if(message.type==='rejected')api?.toast(message.message||'资料已变化，结果未带回。');
 }
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!==channel)return;if(!api){pending=event.data;return;}receive(event.data);});
 globalThis.__BingliLegacyInit=function(hostApi){
  api=hostApi;
  globalThis.V6Quick={...(globalThis.V6Quick||{}),getToolContext:toolContext,openTool:open,acceptToolResult:(kind,data,token)=>result(kind,data,token),refreshPatients:()=>{},hasUnsaved:globalThis.V6Quick?.hasUnsaved||(()=>false)};
  if(only){
   document.getElementById('v6Gate').hidden=true;document.getElementById('v6Settings').hidden=true;
   const app=document.getElementById('v6App');app.hidden=false;app.removeAttribute('inert');document.body.classList.remove('v6-locked');
   document.querySelector('.v6-securitybar')?.setAttribute('hidden','');
   for(const id of ['rxInsertWorkbench','wbImport','wbBackup'])document.getElementById(id)?.setAttribute('hidden','');
  }
  const style=document.createElement('style');style.textContent='#v6MainNav,#v6ToolsMenu,#v6ToolContext{display:none!important}.legacy-bridge-toolbar{position:sticky;top:0;z-index:500;display:flex;gap:7px;flex-wrap:wrap;padding:10px;background:#f4f7f3;border-bottom:1px solid #cddbd4}.legacy-bridge-toolbar button{font-size:13px;padding:7px 9px}.legacy-bridge-toolbar [aria-current="page"]{background:#1a6470;color:white}.legacy-bridge-context{padding:5px 12px;color:#426153;font-size:12px;overflow-wrap:anywhere}@media(max-width:600px){.legacy-bridge-toolbar{gap:5px}.legacy-bridge-toolbar button{font-size:12px}}@media print{.legacy-bridge-toolbar,.legacy-bridge-context{display:none!important}}';document.head.append(style);
  const toolbar=document.createElement('div');toolbar.className='legacy-bridge-toolbar';toolbar.setAttribute('aria-label','全部辅助功能');
  for(const[k,label]of Object.entries({library:'语料库',generator:'详细编辑',reports:'检查分析',staging:'肿瘤分期',prescription:'处方分析',workbench:'患者病案'})){
   const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.legacyPane=k;b.onclick=()=>open(k);toolbar.append(b);
  }
  const returnButton=document.createElement('button');returnButton.type='button';returnButton.hidden=true;returnButton.id='legacyReturnCurrent';returnButton.onclick=()=>{
   if(currentKind==='library'){const entries=api.selectedEntries();if(!entries.length){api.toast('请先勾选需要的语料');return;}result('library',{raw:entries.map(x=>x.text).join('\n\n'),ids:entries.map(x=>x.id),entries});}
   else if(currentKind==='generator'){const noteText=document.getElementById('resultText').value;if(!noteText.trim()){api.toast('请先生成并核对正文');return;}result('generator',{noteText,fields:api.collect()});}
   else if(currentKind==='workbench'){const draft=globalThis.V5Workbench?.getLegacyDraft();if(draft)result('workbench',draft);}
  };toolbar.append(returnButton);
  const back=document.createElement('button');back.type='button';back.textContent='回到本次书写';back.onclick=()=>send({type:'close'});toolbar.append(back);document.getElementById('v6App').prepend(toolbar);
  document.getElementById('quickTab').onclick=()=>send({type:'close'});
  document.getElementById('workbenchTab').onclick=()=>open('workbench');
  document.getElementById('v6ToolReturn').onclick=()=>send({type:'close'});
  send({type:'ready',mode:only?'tools':'protected'});if(pending){const p=pending;pending=null;receive(p);}else api.showPane(only?'library':'workbench');
 };
})();
'''

WORKBENCH_BRIDGE = r'''
  let legacyContextToken='';
  function receiveLegacyContext(context){
   if(!context?.token||context.token===legacyContextToken)return false;
   if(dirty||pendingPersistence){msg('工作台已有未保存编辑；已保留，未覆盖为主页面资料。请先保存或清空需要的内容。');return false;}
   if(patientId||encounterId){msg('正在查看已有病案；未自动覆盖。新建患者后重新载入主页面资料。');return false;}
   const p=clone(context.patient||{}),e=clone(context.encounter||{});p.name=p.name||p.alias||'';p.verification='unconfirmed';
   fill(pFields,p);refreshSyndromes(e.syndrome||'');fill(eFields,{...e,date:String(e.date||'').split('T')[0],recordTime:e.recordTime||String(e.date||'').split('T')[1]||'',noteText:context.noteText||e.noteText||'',verification:'unconfirmed'});
   if(e.syndrome&&!$('wbSyndrome').value)$('wbCustomSyndrome').value=e.syndrome;
   writeSigns(e.symptomItems||[]);problems=clone(e.problems||[]);rxItems=clone(e.prescriptionItems||[]);labItems=clone(e.labItems||[]);renderProblems();
   $('wbPatientVerification').value='unconfirmed';$('wbEncounterVerification').value='unconfirmed';$('wbLabVerified').value='unconfirmed';$('wbPrescriptionVerified').value='unconfirmed';
   legacyContextToken=context.token;setDirty('patient');setDirty('encounter');noteContextDirty=false;tab('patient');msg('本次资料已载入未保存表单。请核对并保存基础资料；未自动建立或保存病案。');return true;
  }
  function getLegacyDraft(){
   const p={...(patient()||{}),...formValues(pFields)},e=currentEncounter();
   return {patient:p,encounter:e,noteText:$('wbNoteText').value};
  }
'''

INIT_BRIDGE = r'''
  globalThis.__BingliLegacyInit({showPane,toast,collect,
   selectedEntries:()=>[...selected].map(id=>({id,title:byId.get(id).title,text:actualText(id),section:byId.get(id).section,group:byId.get(id).group})),
   loadGenerator:context=>{
    if(!context)return;const p=context.patient||{},e=context.encounter||{};
    const target=$('#clinicalForm');if(target.dataset.legacyToken===context.token)return;
    if(target.dataset.legacyToken&&fields.some(el=>!['recordType','outputMode'].includes(el.id)&&el.type!=='checkbox'&&clean(el.value))&&!window.confirm('载入本次资料会替换详细编辑中的临时输入，是否继续？'))return;
    target.reset();$('#resultText').value='';clearWorkingSelections();
    const date=String(e.date||''),recordTime=date.includes('T')?date.replace('T',' '):[date,e.recordTime].filter(Boolean).join(' ');
    const type=/主任/.test(e.recordType)?'主任中医师查房':/主治/.test(e.recordType)?'主治中医师日常查房':e.recordType||'日常病程记录';
    const values={patientName:p.name||p.alias,sex:p.sex,age:p.ageAtIndex||p.age,cancer:p.cancer,diagnosis:e.westernDiagnosis||p.westernDiagnosis||p.pathology,tcmDisease:e.tcmDisease||p.tcmDisease,stage:e.stage||p.stage,diagnosisBasis:e.diagnosisBasis||p.diagnosisBasis,history:p.history||e.presentIllness,recordType:type,recordTime,doctor:e.doctor,chiefComplaint:e.chiefComplaint,symptoms:e.symptoms,exam:e.exam,tongue:e.tongue,coat:e.coat,pulse:e.pulse,tcmEvidence:e.tcmEvidence,labRaw:e.labRaw,labDate:e.labDate,reportAnalysis:e.labAnalysis,tcmPlan:[e.prescriptionAnalysis,e.tcmPlan].filter(Boolean).join('\n'),supportPlan:e.supportPlan,followPlan:e.followPlan,communication:e.communication};
    for(const[id,value]of Object.entries(values))if($('#'+id))$('#'+id).value=value||'';
    refreshSyndromes(e.syndrome||'');if(e.syndrome&&!$('#syndrome').value)$('#customSyndrome').value=e.syndrome;
    $('#syndromeStatus').value=e.syndromeStatus==='confirmed'?'confirmed':'provisional';
    $('#negativeChecks').querySelectorAll('input').forEach(el=>el.checked=false);syncRecordType();syncProfile();target.dataset.legacyToken=context.token;
    $('#issues').textContent='已载入本次资料，详细字段仍可编辑。模板和语料不能代替本例事实。';
   }
  });
'''


def prepare_legacy(source: str) -> str:
    """Return the prepared HTML, accepting the original HTML as a string."""
    def replace_once(old, new):
        nonlocal source
        count = source.count(old)
        if count != 1:
            raise ValueError(f'Legacy anchor expected once ({count}): {old[:100]}')
        source = source.replace(old, new, 1)

    replace_once('initV5Workbench({showPane,toast,copy,refreshSyndromes,syncRecordType});',
                 'if(!globalThis.__BINGLI_TOOLS_ONLY__)initV5Workbench({showPane,toast,copy,refreshSyndromes,syncRecordType});')
    replace_once('initV6Quick({showPane,toast,copy,commitQuick:commitV6Quick});',
                 'if(!globalThis.__BINGLI_TOOLS_ONLY__)initV6Quick({showPane,toast,copy,commitQuick:commitV6Quick});')
    wb = ' globalThis.V5Workbench={getDB:()=>clone(db),getPatientId:()=>patientId'
    replace_once(wb, WORKBENCH_BRIDGE + '\n' + wb.replace('{getDB:', '{receiveLegacyContext,getLegacyDraft,getDB:'))
    replace_once(" showPane('quick');\n}\nif(typeof document!=='undefined')V6Security.boot(initApp);",
                 INIT_BRIDGE + "\n}\nif(typeof document!=='undefined'){if(globalThis.__BINGLI_TOOLS_ONLY__)initApp();else V6Security.boot(initApp);}")
    # Install the bridge before the app script; no scripts are evaluated by this builder.
    marker = '<script type="application/json" id="corpusData">'
    replace_once(marker, '<script>' + BRIDGE + '</script>' + marker)
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(prepare_legacy(args.input.read_text(encoding='utf-8')), encoding='utf-8')
