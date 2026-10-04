/* Model output remains a separate candidate until the clinician adopts it. */
(function(g){
 'use strict';
 if(!g.BingliWriter)return;
 const $=id=>document.getElementById(id),S=v=>String(v??'').trim(),note=$('qNote');if(!note)return;
 const panel=document.createElement('details');panel.id='localWriterPanel';panel.open=true;
 panel.innerHTML='<summary>本地 AI 与病历用语整理</summary><p class="mini-help" style="color:#78572f">本地模型仅整理固定用语；病情分析请依据本次资料，在上方选择医师判断及检查、处理意见。</p><p class="mini-help muted">首次使用一次选中全部模型分包。核验、合并及生成均在本机完成；在上方正文中选中一段，再整理用语。模型仅整理表达；病情分析由本次资料及上方选择的医师判断生成。</p><div class="actions"><button id="writerLoad" type="button">选择模型分包</button><input id="writerParts" type="file" multiple hidden><button id="writerGenerate" type="button" disabled>整理选中段落</button><button id="writerCancel" type="button" hidden>停止</button></div><p id="writerStatus" class="status" role="status">模型未载入。可以先使用上方病历整理功能。</p><div id="writerCandidateArea" hidden><p id="writerTiming" class="mini-help muted"></p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px"><label>本次整理原文（只读）<textarea id="writerOriginal" rows="12" readonly></textarea></label><label>AI 候选正文（可修改后采用）<textarea id="writerCandidate" rows="12"></textarea></label></div><p id="writerChanges" class="mini-help"></p><label class="check"><input id="writerReviewed" type="checkbox">已逐项核对候选中的事实、数值、否定和医师意见</label><div class="actions"><button id="writerAccept" type="button" disabled>采用这份正文</button><button id="writerKeep" type="button">保留原正文</button></div></div>';
 note.after(panel);
 const normalizeButton=document.createElement('button');normalizeButton.type='button';normalizeButton.id='writerNormalize';normalizeButton.textContent='规范病历用语（无需模型）';$('writerLoad').before(normalizeButton);
 const sourceLabel=document.createElement('p');sourceLabel.id='writerCandidateSource';sourceLabel.className='mini-help';$('writerTiming').before(sourceLabel);
 let busy=false,original='',sourceStamp='',complete=false,targetText='',selectionStart=0,selectionEnd=0;
 const stamp=()=>JSON.stringify([...document.querySelectorAll('#inputs input:not([type=file]),#inputs select,#inputs textarea')].filter(x=>!x.id.startsWith('example')).map(x=>[x.id,x.type==='checkbox'?x.checked:x.value]));
 function status(text){$('writerStatus').textContent=text;}
 const unchanged=()=>$('writerCandidate').value===targetText;
 const assessment=()=>g.BingliWritingPolicy?.assess(targetText,$('writerCandidate').value)||{safe:false,reason:'用语校验模块未载入，请重新打开完整版本。'};
 function review(){ $('writerAccept').disabled=busy||!complete||!$('writerReviewed').checked||!S($('writerCandidate').value)||unchanged()||!assessment().safe; }
 function resetCandidate(){complete=false;$('writerReviewed').checked=false;$('writerAccept').disabled=true;}
 function changes(){
  const candidate=$('writerCandidate').value;
  if(unchanged()){$('writerChanges').textContent='候选与原文完全相同，无改动。可保留原正文，或直接编辑候选后重新审核。';return;}
  const check=assessment();if(!check.safe){$('writerChanges').textContent='候选超出了已核对的用语替换范围，暂不允许采用。'+check.reason+' 可点击“规范病历用语”，或在上方正文中直接修改。';return;}
  const numbers=text=>[...new Set(text.match(/\d+(?:[./:-]\d+)*(?:\s*(?:g\/L|mmol\/L|U\/L|mmHg|℃|%|岁|次\/分))?/g)||[])];
  const before=numbers(targetText),after=numbers(candidate),added=after.filter(x=>!before.includes(x)),lost=before.filter(x=>!after.includes(x));
  $('writerChanges').textContent=[added.length?'新增数字表达：'+added.join('、'):'',lost.length?'未原样保留的数字表达：'+lost.join('、'):'',!added.length&&!lost.length?'数字表达对照未发现变化；仍需核对语义、否定与计划状态。':'请逐项对照原正文后修改。'].filter(Boolean).join(' ');
 }
 $('writerLoad').onclick=()=>$('writerParts').click();
 normalizeButton.onclick=()=>{
  if(busy)return;if(!S(note.value)){status('请先生成或填写病历草稿。');return;}
  if(!g.BingliWritingPolicy){status('用语校验模块未载入，请重新打开完整版本。');return;}
  original=note.value;selectionStart=note.selectionStart;selectionEnd=note.selectionEnd;targetText=selectionEnd>selectionStart?original.slice(selectionStart,selectionEnd):original;sourceStamp=stamp();resetCandidate();
  const result=g.BingliWritingPolicy.standardize(targetText);$('writerCandidateArea').hidden=false;$('writerOriginal').value=targetText;$('writerCandidate').value=result.text;$('writerTiming').textContent='';$('writerCandidateSource').textContent='来源：固定用语整理；本次没有调用模型。';complete=true;changes();review();status(result.changed?'已整理 '+result.edits.length+' 处病历用语，请对照原文审核后采用。':'本次没有匹配到需要规范的用语，原正文保留。');
 };
 $('writerParts').onchange=async()=>{
  if(busy)return;busy=true;normalizeButton.disabled=true;$('writerLoad').disabled=true;$('writerGenerate').disabled=true;resetCandidate();
  try{const files=[...$('writerParts').files];status('正在核验模型分包…');await g.BingliWriter.loadParts(files,{onProgress:p=>status(typeof p==='string'?p:p.message||'正在本机载入模型…')});status('本地模型已载入，尚未修改正文。请在上方选中一段，再点“整理选中段落”。');$('writerGenerate').disabled=false;}
  catch(e){status('模型未载入：'+e.message+'。上方病历整理仍可使用。');}
  finally{busy=false;normalizeButton.disabled=false;$('writerLoad').disabled=false;$('writerParts').value='';review();}
 };
 $('writerGenerate').onclick=async()=>{
  if(busy)return;original=note.value;if(!S(original)){status('请先生成或填写病历草稿。');return;}
  selectionStart=note.selectionStart;selectionEnd=note.selectionEnd;targetText=selectionEnd>selectionStart?note.value.slice(selectionStart,selectionEnd):original;if(targetText.length>1000){status('请先在正文中选中需要整理的一段（1000字以内），再点“整理选中段落”。');return;}
  busy=true;resetCandidate();sourceStamp=stamp();$('writerCandidateArea').hidden=false;$('writerOriginal').value=targetText;$('writerCandidate').value='';$('writerChanges').textContent='';$('writerTiming').textContent='';$('writerGenerate').disabled=true;$('writerLoad').disabled=true;$('writerCancel').hidden=false;status('正在本机整理，请保留窗口…');
  $('writerCandidateSource').textContent='来源：现有本地模型受限用语整理；数值、诊疗事实及顺序按原文保留。';normalizeButton.disabled=true;
  const startedAt=Date.now();let generationElapsedMs=null,modelInvoked=false;
  try{
   if(!g.BingliWritingPolicy?.buildGrammar)throw Error('缺少用语约束模块，请重新打开完整版本');
   const constraint=g.BingliWritingPolicy.buildGrammar(targetText);
   if(!constraint.changed){$('writerCandidate').value=targetText;complete=true;$('writerCandidateSource').textContent='本段没有可规范的词语，本次未调用模型。';changes();status('原文没有匹配到本地模型可处理的用语，原正文保留。需要补充分析时，可在上方选择判断或填写医师意见。');return;}
   const substitutions=g.BingliWritingPolicy.standardize(targetText).edits.map(e=>e.from+'→'+e.to).filter((x,i,a)=>a.indexOf(x)===i).join('；');
   const input={recordType:$('qType').value,draft:targetText,facts:'所有事实以待整理正文为准。',judgments:'只规范下列用语：'+substitutions+'。优先使用箭头右侧的病历表达。其他事实、数值、日期、否定、标点、空格和顺序逐字保留。不输出解释。'};
   modelInvoked=true;const result=await g.BingliWriter.generate(input,{maxTokens:2200,grammar:constraint.grammar,onToken:(token,full)=>{if(typeof full==='string')$('writerCandidate').value=full;else $('writerCandidate').value+=typeof token==='string'?token:'';}});
   if(Number.isFinite(result?.usage?.elapsedMs))generationElapsedMs=result.usage.elapsedMs;
   if(result?.text!==undefined)$('writerCandidate').value=result.text;
   complete=!result?.cancelled&&!result?.truncated&&!result?.repetition&&!result?.incomplete&&Boolean(S($('writerCandidate').value));changes();
   status(result?.repetition?'候选出现重复，已停止整理，原正文保留。请缩小选中段落后重试。':result?.cancelled?'已停止，候选未完成，原正文保留。':result?.truncated?'候选达到生成长度上限，尚未完成。请缩小选中段落后重试。':!complete?'本次未生成完整候选，原正文保留。':unchanged()?'模型运行完成，候选与原文完全相同，无改动。':'候选已生成，已限定为固定用语范围。请对照原正文审核。');
   if(complete&&!assessment().safe)status('模型已返回结果，但改动超出已核对的用语范围，候选未采用。可用“规范病历用语”继续整理。');
  }catch(e){complete=false;status('本次生成未完成：'+e.message+'。原正文保留。');}
  finally{$('writerTiming').textContent=modelInvoked?'本次生成用时 '+(Math.max(0,generationElapsedMs??Date.now()-startedAt)/1000).toFixed(1)+' 秒':'';busy=false;normalizeButton.disabled=false;$('writerGenerate').disabled=false;$('writerLoad').disabled=false;$('writerCancel').hidden=true;review();}
 };
 $('writerCancel').onclick=()=>{g.BingliWriter.cancel();status('正在停止…');};
 $('writerCandidate').oninput=()=>{$('writerReviewed').checked=false;changes();if(complete)status(unchanged()?'候选与原文完全相同，无改动。':'候选已手动修改，请重新核对后采用。');review();};$('writerReviewed').onchange=review;
 $('writerKeep').onclick=()=>{$('writerCandidateArea').hidden=true;resetCandidate();status('原正文已保留。');};
 $('writerAccept').onclick=()=>{
  if($('writerAccept').disabled)return;
  if(stamp()!==sourceStamp||note.value!==original){status('本次资料或原正文已有修改，候选未覆盖。请按新资料重新生成。');resetCandidate();return;}
  note.value=selectionEnd>selectionStart?note.value.slice(0,selectionStart)+$('writerCandidate').value+note.value.slice(selectionEnd):$('writerCandidate').value;note.dispatchEvent(new Event('input',{bubbles:true}));$('writerCandidateArea').hidden=true;resetCandidate();status('已采用候选。请完成正文审核后复制。');
 };
})(globalThis);
