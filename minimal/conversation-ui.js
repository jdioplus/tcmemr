(function(g){
 'use strict';
 const $=id=>document.getElementById(id),core=g.BingliConversation,app=g.BingliMini;
 if(!core||!app||!$('conversationPanel'))return;
 let history=[],target='',unassigned='',proposal=null,analysisTarget='';
 const log=$('conversationLog'),questions=$('conversationQuestions');
 function status(t){$('conversationStatus').textContent=t;}
 function add(role,text){history.push({role,text});while(history.length>120||history.reduce((n,x)=>n+x.text.length,0)>200000)history.shift();renderLog();}
 function renderLog(){log.replaceChildren();for(const m of history){const row=document.createElement('div');row.className='conversation-message '+m.role;const who=document.createElement('strong');who.textContent=m.role==='user'?'你':'病历助手';row.append(who,document.createTextNode(m.text));log.append(row);}log.scrollTop=log.scrollHeight;}
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
 function selectTarget(id,carry=''){
  target=id;unassigned='';$('conversationCancelTarget').hidden=false;
  $('conversationTarget').textContent='正在修改：'+core.fields[id]+'。填写这一项的完整内容，将先显示更新预览。';
  if(carry){target='';present({kind:'update',fields:{[id]:[app.getInputs()[id],carry].filter(Boolean).join('\n')}});}
  else{$('conversationInput').value=id==='qSyndromeCustom'?(app.getInputs().qSyndromeCustom||app.getInputs().qSyndrome.replace('__custom','')):app.getInputs()[id]||'';$('conversationInput').focus();}
 }
 function targets(){if($('conversationSyndrome'))$('conversationSyndrome').textContent='当前证型：'+(app.getInputs().qSyndrome==='__custom'?app.getInputs().qSyndromeCustom:app.getInputs().qSyndrome||'待填写');questions.replaceChildren();if(unassigned){status('这条内容应放入哪一项？选择后会显示更新预览。');for(const id of ['qSymptoms','qLabRaw','qExam','qAssessment','qPlan','qTcmEvidence'])questions.append(button(core.fields[id],()=>selectTarget(id,unassigned)));return;}
  if(app.getInputs().qToday){for(const q of core.questions(app.getInputs()))questions.append(button(q.label,()=>selectTarget(q.id)));}
  $('conversationUndo').disabled=!app.canUndo();
 }
 function cancelTarget(){target='';unassigned='';analysisTarget='';$('conversationTarget').textContent='';$('conversationCancelTarget').hidden=true;targets();}
 function closeProposal(){proposal=null;app.discardUpdate();$('conversationProposal').hidden=true;$('conversationChanges').replaceChildren();$('conversationPreview').value='';}
 function present(request){
  if(request.kind==='analysis'){
   const result=app.conversationAnalysis(request.tool,request.raw);if(result.need){analysisTarget=result.acceptsRaw?request.tool:'';add('assistant',result.need);$('conversationCancelTarget').hidden=!analysisTarget;$('conversationTarget').textContent=analysisTarget?'下一条将作为分析原文；可点取消返回资料补充。':'';status(analysisTarget?'可直接在下一条消息粘贴相关资料。':'请先补充并审核本次资料。');return;}
   cancelTarget();add('assistant','来源：'+result.source+'（本次未调用大模型）。\n\n'+(result.text||'未匹配到可分析项目，请核对原文。')+(result.warnings?.length?'\n\n本次核对：\n'+result.warnings.join('\n'):''));
   if(result.sources?.length)add('assistant','依据：'+result.sources.map(x=>[x.title||x.name||x.id,x.version,x.url].filter(Boolean).join(' · ')).join('\n'));
   if(result.field&&result.raw!==app.getInputs()[result.field]){const raw=result.raw;questions.replaceChildren(button('将原文补入本次资料',()=>{questions.replaceChildren();const before=app.getInputs()[result.field];present({kind:'update',fields:{[result.field]:[before,raw].filter(Boolean).join('\n')}});}),button('暂不写入病历',targets));}
   if(['oncology','staging'].includes(request.tool))reviewDetails.open=true;
   return;
  }
  if(request.kind==='help'){add('assistant',request.message);return;}
  if(request.kind==='choose'){unassigned=request.message;targets();return;}
  if(request.kind!=='update')return;
  if(!app.getInputs().qToday&&request.fields.qType&&!request.raw){$('qType').value=request.fields.qType;$('qType').dispatchEvent(new Event('change',{bubbles:true}));add('assistant','已选择'+request.fields.qType+'。请粘贴本次资料。');return;}
  try{
   proposal=app.previewUpdate(request);$('conversationProposal').hidden=false;$('conversationPreview').value=proposal.text;$('conversationChanges').replaceChildren();
   for(const c of proposal.changes){if(['qSyndromeConfirmed','qIncludeClassics'].includes(c.id))continue;const row=document.createElement('div');row.className='conversation-change';const label=document.createElement('strong');label.textContent=(core.fields[c.id]||{qToday:'原始资料',qType:'病程类型',qCancer:'癌种',qSyndrome:'证型',qSyndromeCustom:'证型',qDate:'记录时间'}[c.id]||c.id)+'\n';const before=document.createElement('del');before.textContent=c.before?'原：'+c.before+'\n':'';const after=document.createElement('ins');after.textContent='新：'+c.after;row.append(label,before,after);$('conversationChanges').append(row);}
   $('conversationChangeSummary').textContent=proposal.hasChanges?'更新后的草稿如下，其他已手动修改且不受本次更新影响的段落会保留。':'与当前资料和正文相同，没有改动。';
   $('conversationConflict').textContent=proposal.conflicts.length?'涉及的段落已被你手动修改，自动合并已停止。请在“表格填写”或右侧正文核对这次改动，当前正文已保留。':'';
   $('conversationApply').disabled=!proposal.hasChanges||Boolean(proposal.conflicts.length);status(proposal.conflicts.length?'存在手动修改冲突，未覆盖当前正文。':'请核对本次更新，再点“采用本次更新”。');cancelTarget();
  }catch(e){closeProposal();status(e.message);}
 }
 function send(){const text=$('conversationInput').value.trim();if(!text)return;if(proposal){status('请先采用或放弃当前预览，再发送下一条。');return;}if(text.length>30000){status('请将资料分成每次3万字以内再发送。');return;}add('user',text);$('conversationInput').value='';const request=core.plan(text,app.getInputs(),target);if(analysisTarget&&request.kind!=='analysis'){const kind=analysisTarget;analysisTarget='';present({kind:'analysis',tool:kind,raw:text});}else present(request);}
 $('conversationSend').onclick=send;
 $('conversationInput').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();send();}});
 $('conversationApply').onclick=()=>{if(!proposal||$('conversationApply').disabled)return;try{app.adoptUpdate(proposal.token);closeProposal();add('assistant','已更新右侧草稿。你可以继续补充资料、选择下方判断，或直接修改正文。');targets();status('已采用；最终复制前请审核正文。');}catch(e){closeProposal();status(e.message);}};
 $('conversationDiscard').onclick=()=>{closeProposal();cancelTarget();status('已放弃本次更新，当前资料和正文保留。');};
 $('conversationCancelTarget').onclick=cancelTarget;
 $('conversationUndo').onclick=()=>{try{app.undoUpdate();closeProposal();cancelTarget();add('assistant','已撤回上次对话更新。');targets();}catch(e){status(e.message);}};
 function reset(messages=[]){closeProposal();app.resetConversation();cancelTarget();history=messages;renderLog();$('conversationInput').value='';status('');if(!history.length)add('assistant','先粘贴这次已有的资料，我会按所选病程格式整理。随后可继续补充或修改，也可以输入“分析化验单：…”“分析处方：…”或“分析肿瘤”。');targets();}
 window.addEventListener('bingli:new-record',()=>reset());
 window.addEventListener('bingli:loaded',e=>reset(e.detail.conversation));
 window.addEventListener('bingli:updated',targets);
 window.addEventListener('bingli:inputs-changed',()=>{targets();if(proposal){$('conversationApply').disabled=true;status('资料已改变，请放弃本次预览并重新发送。');}});
 window.addEventListener('bingli:tool-result',e=>{add('assistant',({reports:'化验单分析',prescription:'处方分析',staging:'分期结果'}[e.detail.kind]||'工具结果')+'已带回本次资料。点击“更新草稿”预览其对正文的影响。');targets();});
 const shortcuts=$('conversationShortcuts');
 shortcuts.append(button('更新草稿',()=>{if(proposal){status('请先处理当前更新预览。');return;}present({kind:'update',fields:{},label:'更新草稿'});}),button('修改某项',()=>{$('conversationFieldPicker').hidden=!$('conversationFieldPicker').hidden;}));
 const picker=$('conversationField');for(const [id,label]of Object.entries(core.fields))picker.add(new Option(label,id));$('conversationChooseField').onclick=()=>selectTarget(picker.value);
 shortcuts.append(button('另写一例',()=>app.clear()));
 const reviewDetails=document.createElement('details');const reviewSummary=document.createElement('summary');reviewSummary.textContent='选择临床判断与检查安排';reviewDetails.append(reviewSummary);const syndromeSummary=document.createElement('p');syndromeSummary.id='conversationSyndrome';reviewDetails.append(syndromeSummary);const confirmed=$('qSyndromeConfirmed').closest('label');if(confirmed)reviewDetails.append(confirmed);reviewDetails.append($('reviewGuide'),$('qDecisionReview'));$('conversationReviewHost').append(reviewDetails);
 function mode(table){$('conversationPanel').hidden=table;$('structuredInputs').hidden=!table;$('structuredInputs').open=table;$('modeConversation').setAttribute('aria-pressed',String(!table));$('modeTable').setAttribute('aria-pressed',String(table));$('modeConversation').classList.toggle('primary',!table);$('modeTable').classList.toggle('primary',table);(table?$('tableReviewHost'):$('conversationReviewHost')).append(reviewDetails);}
 $('modeConversation').onclick=()=>mode(false);$('modeTable').onclick=()=>mode(true);mode(false);reset();
 g.BingliConversationUI=Object.freeze({history:()=>history.map(x=>({...x}))});
})(globalThis);
