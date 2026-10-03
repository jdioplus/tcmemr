(function(g){
 'use strict';
 const channel='bingli-legacy-v1',kinds=new Set(['library','generator','reports','staging','prescription','workbench']);
 const titles={library:'语料库',generator:'详细病程编辑',reports:'检查分析',staging:'肿瘤分期',prescription:'中药处方分析',workbench:'患者病案'};
 let active=null,callback=null,current=null,protectedFrame=null;
 const records=new Map(),clone=value=>JSON.parse(JSON.stringify(value));
 const $=id=>document.getElementById(id);
 function status(message){const el=$('legacyToolsStatus');if(el)el.textContent=message;}
 function html(){
  if(typeof LEGACY_APP_HTML!=='undefined')return LEGACY_APP_HTML;
  if(typeof g.LEGACY_APP_HTML==='string')return g.LEGACY_APP_HTML;
  throw new Error('辅助工具尚未加载');
 }
 function send(frame,data){frame?.contentWindow?.postMessage({channel,...data},'*');}
 function display(){
  const dialog=$('legacyToolsDialog');if(!dialog)throw new Error('辅助工具窗口尚未准备好');
  if(typeof dialog.showModal==='function'){if(!dialog.open)dialog.showModal();}else{dialog.hidden=false;dialog.setAttribute('aria-modal','true');}
 }
 function close(){
  const dialog=$('legacyToolsDialog');if(!dialog)return;
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.hidden=true;
 }
 function getFrame(mode){
  let frame=mode==='protected'?protectedFrame:$('legacyToolsFrame');
  if(!frame&&mode==='protected'){
   frame=document.createElement('iframe');frame.id='legacyWorkbenchFrame';frame.title='受密码保护的患者病案';
   frame.className=$('legacyToolsFrame')?.className||'';frame.style.cssText=$('legacyToolsFrame')?.style.cssText||'width:100%;height:70vh;border:0';
   $('legacyToolsFrame').after(frame);protectedFrame=frame;
  }
  if(!frame)throw new Error('辅助工具页面尚未准备好');
  if(!records.has(frame)){
   const record={mode,ready:false};records.set(frame,record);
   frame.name=mode==='protected'?'bingli-protected':'bingli-tools';
   frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups');
   frame.title=mode==='protected'?'患者病案工作台':'全部病程辅助工具';
   // Set mode in the document itself. Browsers may clear window.name on navigation.
   frame.srcdoc=html().replace(/<head(?:\s[^>]*)?>/i,match=>match+'<script>globalThis.__BINGLI_FRAME_MODE__='+JSON.stringify(mode)+';</'+'script>');
  }
  return frame;
 }
 function open(kind,context,onResult){
  if(!kinds.has(kind))throw new Error('未知辅助功能');
  if(!context||typeof context.token!=='string'||!context.token)throw new Error('请先提供明确归属的本次资料');
  const nextContext=clone(context),nextCallback=typeof onResult==='function'?onResult:null;
  const mode=kind==='workbench'?'protected':'tools',frame=getFrame(mode);active=frame;
  for(const item of records.keys())item.hidden=item!==frame;
  const title=$('legacyToolsTitle');if(title)title.textContent=titles[kind];
  // Opening a modal can blur a just-edited input and dispatch its final change.
  // Finish that event before adopting this new, already-current context.
  display();current={kind,context:nextContext};callback=nextCallback;
  status(mode==='protected'?'患者病案保留原有密码与加密保存。解锁后可载入本次未保存资料。':'共用本次资料，核对结果后可带回正文。');
  if(records.get(frame).ready)send(frame,{type:'context',kind,context:current.context});
  return true;
 }
 window.addEventListener('message',async event=>{
  const frame=[...records.keys()].find(item=>item.contentWindow===event.source);if(!frame||event.data?.channel!==channel)return;
  const data=event.data,record=records.get(frame);
  if(data.type==='ready'){
   record.ready=true;if(active===frame&&current)send(frame,{type:'context',kind:current.kind,context:current.context});return;
  }
  if(frame!==active)return;
  if(data.type==='close'){close();return;}
  if(data.type==='open'&&kinds.has(data.kind)&&current){open(data.kind,current.context,callback);return;}
  if(data.type!=='result')return;
  if(!current||typeof data.token!=='string'||data.token!==current.context.token){send(frame,{type:'rejected',message:'本次资料已变化，旧结果未带回。'});status('旧工具结果未带回，请重新载入本次资料。');return;}
  try{
   const result=clone(data);delete result.channel;delete result.type;
   if(!kinds.has(result.kind))throw new Error('未知工具结果');
   const accepted=callback?await callback(result):false;
   if(accepted===false){send(frame,{type:'rejected',message:'结果未带回，请核对本次资料或正文。'});status('结果未带回，请核对本次资料或正文。');return;}
   send(frame,{type:'accepted'});status('结果已带回本次病程，请核对正文。');close();
  }catch(error){send(frame,{type:'rejected',message:error.message});status(error.message);}
 });
 function invalidate(token){
  if(!current||token===current.context.token)return;
  current=null;for(const frame of records.keys())send(frame,{type:'invalidate',token});
 }
 function setup(){
  $('legacyToolsClose')?.addEventListener('click',close);
  const dialog=$('legacyToolsDialog');dialog?.addEventListener('cancel',event=>{event.preventDefault();close();});
  // Main-page edits invalidate old outputs, including after the dialog closes.
  for(const type of ['input','change'])document.addEventListener(type,event=>{
   if(!$('inputs')?.contains(event.target))return;invalidate('changed:'+Date.now());
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
 g.BingliTools=Object.freeze({open,close,invalidate});
})(globalThis);
