/* Model output remains a separate candidate until the clinician adopts it. */
(function(g){
 'use strict';
 if(!g.BingliWriter)return;
 const $=id=>document.getElementById(id),S=v=>String(v??'').trim(),note=$('qNote');if(!note)return;
 const panel=document.createElement('details');panel.id='localWriterPanel';panel.open=true;
 panel.innerHTML='<summary>本地 AI 段落整理（实验）</summary><p class="mini-help" style="color:#78572f">独立测试中仍出现病理、症状改写及检查状态遗漏，仅供合成病例试写与对照。</p><p class="mini-help muted">首次使用一次选中全部模型分包。核验、合并及生成均在本机完成；在上方正文中选中一段，再整理文字。</p><div class="actions"><button id="writerLoad" type="button">选择模型分包</button><input id="writerParts" type="file" multiple hidden><button id="writerGenerate" type="button" disabled>整理选中段落</button><button id="writerCancel" type="button" hidden>停止</button></div><label class="check"><input id="writerUseExamples" type="checkbox" checked>沿用同类范例的表达偏好</label><p id="writerStatus" class="status" role="status">模型未载入。可以先使用上方病历整理功能。</p><div id="writerCandidateArea" hidden><label>AI 候选正文（可修改后采用）<textarea id="writerCandidate" rows="14"></textarea></label><p id="writerChanges" class="mini-help"></p><label class="check"><input id="writerReviewed" type="checkbox">已逐项核对候选中的事实、数值、否定和医师意见</label><div class="actions"><button id="writerAccept" type="button" disabled>采用这份正文</button><button id="writerKeep" type="button">保留原正文</button></div></div>';
 note.after(panel);
 let busy=false,original='',sourceStamp='',complete=false,targetText='',selectionStart=0,selectionEnd=0;
 const stamp=()=>JSON.stringify([...document.querySelectorAll('#inputs input:not([type=file]),#inputs select,#inputs textarea')].filter(x=>!x.id.startsWith('example')).map(x=>[x.id,x.type==='checkbox'?x.checked:x.value]));
 function status(text){$('writerStatus').textContent=text;}
 function review(){ $('writerAccept').disabled=busy||!complete||!$('writerReviewed').checked||!S($('writerCandidate').value); }
 function resetCandidate(){complete=false;$('writerReviewed').checked=false;$('writerAccept').disabled=true;}
 function changes(){
  const candidate=$('writerCandidate').value;
  const numbers=text=>[...new Set(text.match(/\d+(?:[./:-]\d+)*(?:\s*(?:g\/L|mmol\/L|U\/L|mmHg|℃|%|岁|次\/分))?/g)||[])];
  const before=numbers(targetText),after=numbers(candidate),added=after.filter(x=>!before.includes(x)),lost=before.filter(x=>!after.includes(x));
  $('writerChanges').textContent=[added.length?'新增数字表达：'+added.join('、'):'',lost.length?'未原样保留的数字表达：'+lost.join('、'):'',!added.length&&!lost.length?'数字表达对照未发现变化；仍需核对语义、否定与计划状态。':'请逐项对照原正文后修改。'].filter(Boolean).join(' ');
 }
 $('writerLoad').onclick=()=>$('writerParts').click();
 $('writerParts').onchange=async()=>{
  if(busy)return;busy=true;$('writerLoad').disabled=true;$('writerGenerate').disabled=true;resetCandidate();
  try{const files=[...$('writerParts').files];status('正在核验模型分包…');await g.BingliWriter.loadParts(files,{onProgress:p=>status(typeof p==='string'?p:p.message||'正在本机载入模型…')});status('本地模型已就绪。生成草稿后可整理文字。');$('writerGenerate').disabled=false;}
  catch(e){status('模型未载入：'+e.message+'。上方病历整理仍可使用。');}
  finally{busy=false;$('writerLoad').disabled=false;$('writerParts').value='';review();}
 };
 $('writerGenerate').onclick=async()=>{
  if(busy)return;original=S(note.value);if(!original){status('请先生成或填写病历草稿。');return;}
  selectionStart=note.selectionStart;selectionEnd=note.selectionEnd;targetText=selectionEnd>selectionStart?note.value.slice(selectionStart,selectionEnd):original;if(targetText.length>1000){status('请先在正文中选中需要整理的一段（1000字以内），再点“整理选中段落”。');return;}
  busy=true;resetCandidate();sourceStamp=stamp();$('writerCandidateArea').hidden=false;$('writerCandidate').value='';$('writerGenerate').disabled=true;$('writerLoad').disabled=true;$('writerCancel').hidden=false;status('正在本机整理，请保留窗口…');
  try{
   let examples=[];
   if($('writerUseExamples').checked&&g.BingliExamples)examples=await g.BingliExamples.context(targetText,{type:$('qType').value,cancer:$('qCancer').value,limit:1});
   // A small model copied an unrelated reference case during a real isolation
   // test. Only allowlisted presentation preferences may reach its prompt.
   const preferenceText=examples.map(e=>e.preference).join('；'),styles=[];
   if(/连续成段|连贯段落/.test(preferenceText))styles.push('每项分析用连贯段落表达');
   if(/先.{0,12}(?:判断|考虑).{0,12}(?:检查|计划|处理)/.test(preferenceText))styles.push('段内先写已有判断，再写原文已有的检查或处理计划');
   if(/简洁|精炼/.test(preferenceText))styles.push('措辞简洁');
   if(/保留.{0,6}(?:标题|编号)/.test(preferenceText))styles.push('保留原标题和编号');
   const input={recordType:$('qType').value,draft:targetText,facts:'所有事实以待整理正文为准。',judgments:'只润色当前草稿，保留其事实、数值、日期、否定及医师判断，不添加诊断、症状、检查、药物、分期或未实施的治疗。'+(styles.length?'表达要求：'+styles.join('；'):'')};
   const result=await g.BingliWriter.generate(input,{maxTokens:2200,onToken:(token,full)=>{if(typeof full==='string')$('writerCandidate').value=full;else $('writerCandidate').value+=typeof token==='string'?token:'';}});
   if(result?.text!==undefined)$('writerCandidate').value=result.text;
   complete=!result?.cancelled&&!result?.truncated&&!result?.repetition&&Boolean(S($('writerCandidate').value));changes();
   status(result?.repetition?'候选出现重复，已停止整理，原正文保留。请缩小选中段落后重试。':result?.cancelled?'已停止，候选未完成，原正文保留。':result?.truncated?'候选达到生成长度上限，尚未完成。请缩小选中段落后重试。':styles.length?'候选已生成，沿用了“'+examples[0].title+'”的表达偏好。请对照原正文审核。':'候选已生成，请对照原正文审核。');
  }catch(e){complete=false;status('本次生成未完成：'+e.message+'。原正文保留。');}
  finally{busy=false;$('writerGenerate').disabled=false;$('writerLoad').disabled=false;$('writerCancel').hidden=true;review();}
 };
 $('writerCancel').onclick=()=>{g.BingliWriter.cancel();status('正在停止…');};
 $('writerCandidate').oninput=()=>{$('writerReviewed').checked=false;changes();review();};$('writerReviewed').onchange=review;
 $('writerKeep').onclick=()=>{$('writerCandidateArea').hidden=true;resetCandidate();status('原正文已保留。');};
 $('writerAccept').onclick=()=>{
  if($('writerAccept').disabled)return;
  if(stamp()!==sourceStamp||S(note.value)!==original){status('本次资料或原正文已有修改，候选未覆盖。请按新资料重新生成。');resetCandidate();return;}
  note.value=selectionEnd>selectionStart?note.value.slice(0,selectionStart)+$('writerCandidate').value+note.value.slice(selectionEnd):$('writerCandidate').value;note.dispatchEvent(new Event('input',{bubbles:true}));$('writerCandidateArea').hidden=true;resetCandidate();status('已采用候选。请完成正文审核后复制。');
 };
})(globalThis);
