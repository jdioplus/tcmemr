from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
s = path.read_text()
if 'v6-quick-tool-open' in s:
    raise SystemExit('Workflow already installed')

def replace(old, new, count=1):
    global s
    if s.count(old) != count:
        raise SystemExit(f'Expected {count} matches: {old[:100]} (found {s.count(old)})')
    s = s.replace(old, new)

# Keep every original input and action; reorganize optional information.
start = s.index('<section id="prescriptionPane"')
form_start = s.index('<div class="form-section"><h3>处方与本例信息</h3>', start)
form_end = s.index('<div class="form-section"><h3>药味识别与核对</h3>', form_start)
old = s[form_start:form_end]
def field(id):
    match = re.search(r'<label class="field(?: wide)?">(?:(?!</label>).)*?id="'+id+r'".*?</label>', old, re.S)
    if not match:
        raise SystemExit('Missing prescription field: '+id)
    return match.group()
new = '''<div class="form-section"><h3>本次中药处方</h3>
<p id="rxQuickContext" class="scope-note" hidden></p>
<div class="formgrid">'''+field('rxRaw').replace('rows="7"','rows="5"')+'''</div>
<details class="workflow-options"><summary>处方剂型与日期（可选）</summary><div class="formgrid">'''+field('rxDosageForm')+field('rxDate')+'''</div></details>
<details class="workflow-options" id="rxCaseDetails"><summary>本次病情与四诊（可共用病程资料）</summary><div class="formgrid">'''+''.join(field(id) for id in ['rxCancer','rxSyndrome','rxSymptoms','rxTongue','rxCoat','rxPulse','rxClinicianGoal'])+'''</div><div class="genbar"><button type="button" id="rxReadGenerator">读取详细病程编辑资料</button></div></details>
<details class="workflow-options"><summary>与上次处方比较（可选）</summary><div class="formgrid">'''+field('rxPrevious')+field('rxPreviousDosageForm')+'''</div></details>
<div class="genbar"><button type="button" class="primary" id="rxAnalyze">分析处方</button><button type="button" id="rxUseQuick">使用本次病程资料</button><button type="button" id="rxClear">清空</button></div>
<details class="workflow-options"><summary>教学示例</summary><button type="button" id="rxExample">填入教学示例</button></details>
</div>
'''
replace(old,new)
replace('<h2>中药复方 · 治法与组方分析</h2>', '<h2>中药处方分析</h2>')
replace('粘贴处方 → 核对药名、剂量与炮制 → 结合本例四诊生成方解。程序按内置常用药资料归纳配伍作用；不从处方反推患者已有症状，不自动认定君臣佐使或经典方名。','粘贴处方，生成方解；核对后可直接带回本次病程。')
replace('<button type="button" id="rxCopy" disabled>', '<button type="button" id="rxInsertQuick" class="primary" disabled>带回本次病程</button><button type="button" id="rxCopy" disabled>')
replace('<button type="button" id="rxInsertGenerator" disabled>带入病程生成器</button><button type="button" id="rxInsertWorkbench" disabled>带入当前患者病案</button>', '<details class="workflow-options"><summary>其他去向</summary><button type="button" id="rxInsertGenerator" disabled>带入详细病程编辑</button><button type="button" id="rxInsertWorkbench" disabled>带入病案工作台</button></details>')
replace('<label class="field rx-label">与上次处方比较（可编辑，留空则不带入）', '<details class="workflow-options"><summary>处方变化（提供上次处方时生成）</summary><label class="field rx-label">与上次处方比较（可编辑，留空则不带入）')
replace('<p id="rxComparisonStatus" class="muted"></p>', '<p id="rxComparisonStatus" class="muted"></p></details>')

# Reports: one paste box, optional demographics/comparison, direct return.
rs=s.index('<section id="reportsPane"')
re_=s.index('<section id="stagingPane"',rs)
report=s[rs:re_]
fields=re.findall(r'<label class="field(?: wide)?">.*?</label>',report,re.S)
raw=next(x for x in fields if 'id="reportRaw"' in x)
options=''.join(x for x in fields if x != raw)
fs=report.index('<div class="form-section"><div class="formgrid">')
fe=report.index('<div class="genbar">',fs)
old=report[fs:fe]
replace(old,'<div class="form-section"><p id="reportQuickContext" class="scope-note" hidden></p><div class="formgrid">'+raw.replace('rows="10"','rows="6"')+'</div><details class="workflow-options"><summary>分析条件、病情背景与既往报告（可选）</summary><div class="formgrid">'+options+'</div></details>')
replace('<button type="button" id="reportExample">','<button type="button" id="reportUseQuick">使用本次病程资料</button><button type="button" id="reportExample">')
replace('<button type="button" id="insertReportResult">带入病程生成器</button>', '<button type="button" id="insertReportQuick" class="primary">带回本次病程</button><details class="workflow-options"><summary>其他去向</summary><button type="button" id="insertReportResult">带入详细病程编辑</button></details>')
replace('<h2>按证据填写关键条件，计算分期</h2>', '<h2>肿瘤分期</h2><p id="stageQuickContext" class="scope-note" hidden></p><button type="button" id="stageUseQuick">使用本次病程资料</button>')
replace('<button type="button" id="insertStageResult" disabled>带入病程生成器</button>', '<button type="button" id="insertStageQuick" class="primary" disabled>带回本次病程</button><details class="workflow-options"><summary>其他去向</summary><button type="button" id="insertStageResult" disabled>带入详细病程编辑</button></details>')

# Contextual entry points beside the single main paste area.
replace(' </details><div class="q-grid q-diagnoses">', ''' </details><div class="q-tool-actions" aria-label="处理本次资料"><span>需要单独处理时：</span><button type="button" id="qToolReports">检查分析</button><button type="button" id="qToolPrescription">处方分析</button><button type="button" id="qToolStaging">肿瘤分期</button></div><p id="qToolStatus" class="q-hint" aria-live="polite"></p><div class="q-grid q-diagnoses">''')
replace('</style>', '''.workflow-options{margin:12px 0}.workflow-options>summary{cursor:pointer;color:var(--accent,#196574);font-weight:600;padding:8px 0}.workflow-options[open]>.formgrid{margin-top:10px}.q-tool-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 4px}.q-tool-actions>span{color:#627580;font-size:14px}.q-tool-actions button{padding:7px 12px;font-size:14px}.genbar>.workflow-options{margin:0}.scope-note[hidden]{display:none}@media(max-width:600px){.q-tool-actions{gap:6px}.q-tool-actions>span{flex-basis:100%}.q-tool-actions button{flex:1;padding:8px 4px}}\n</style>''')

# Quick-note state and context, without changing the encrypted storage transaction.
replace("busy=false,autoSigns={};", "busy=false,autoSigns={},toolResults={};")
replace("encounterId='';draft=null;dirty=false;autoSigns={};", "encounterId='';draft=null;dirty=false;autoSigns={};toolResults={};$('qToolStatus').textContent='';")
replace("function invalidate(id){if(id==='qToday')", "function invalidate(id){if(['qToday','qLabs','qLabDate','qSex','qAge'].includes(id))delete toolResults.reports;if(['qToday','qRx','qDosageForm','qTongue','qCoat','qPulse','qSyndrome','qSyndromeCustom','qSyndromeConfirmed','qCancer','qTcmDisease','qTcmCustom'].includes(id))delete toolResults.prescription;if(['qCancer','qWestern'].includes(id))delete toolResults.staging;if(id==='qToday')")
anchor=" globalThis.V6Quick={resetAfterRestore:"
new=r''' function getToolContext(){
  const parsed=V6QuickParse.extract(S($('qToday').value)),p=patient();
  return {token:fingerprint(),label:[p?.name||p?.alias||S($('qName').value)||'未登记患者',p?.hospitalNumber||S($('qHospital').value),$('qDate').value,$('qType').value].filter(Boolean).join(' · '),cancer:p?.cancer||$('qCancer').value,tcmDisease:tcmDisease(),syndrome:$('qSyndromeConfirmed').checked?syndrome():'',sex:p?.sex||$('qSex').value,age:p?.ageAtIndex||$('qAge').value,symptoms:parsed.symptoms,tongue:S($('qTongue').value)||parsed.tongue,coat:S($('qCoat').value)||parsed.coat,pulse:S($('qPulse').value)||parsed.pulse,labRaw:S($('qLabs').value)||parsed.labRaw,labDate:$('qLabDate').value,prescriptionRaw:S($('qRx').value)||parsed.prescriptionRaw,dosageForm:$('qDosageForm').value,date:$('qDate').value};
 }
 function openTool(kind){document.dispatchEvent(new CustomEvent('v6-quick-tool-open',{detail:{kind,context:getToolContext()}}));}
 function acceptToolResult(kind,result,token){
  if(!token||token!==fingerprint()){toast('本次患者或病程资料已变化，请先重新载入本次资料后再回填。');return false;}
  if(kind==='reports'){$('qLabs').value=result.raw||'';$('qLabDate').value=result.date||'';autoSigns.labRaw=result.raw||'';invalidate('qLabs');toolResults.reports={...result};}
  else if(kind==='prescription'){$('qRx').value=result.raw||'';$('qDosageForm').value=result.dosageForm||'unknown';autoSigns.prescriptionRaw=result.raw||'';invalidate('qRx');toolResults.prescription={...result};}
  else if(kind==='staging'){toolResults.staging={...result};invalidate('qToolStatus');}
  else return false;
  $('qToolStatus').textContent=({reports:'检查分析',prescription:'处方分析',staging:'分期结果'})[kind]+'已带回；生成病程时将使用核对后的结果。';
  showPane('quick');return true;
 }
 $('qToolReports').onclick=()=>openTool('reports');$('qToolPrescription').onclick=()=>openTool('prescription');$('qToolStaging').onclick=()=>openTool('staging');
 globalThis.V6Quick={getToolContext,acceptToolResult,openTool,resetAfterRestore:''' 
replace(anchor,new)
replace("e.labAnalysis=(r.paragraphs||[]).join('\\n\\n');issues.push", "e.labAnalysis=toolResults.reports?.raw===e.labRaw?toolResults.reports.analysis:(r.paragraphs||[]).join('\\n\\n');issues.push")
replace("e.prescriptionAnalysis=r.text||'';issues.push", "e.prescriptionAnalysis=toolResults.prescription?.raw===e.prescriptionRaw?toolResults.prescription.analysis:r.text||'';issues.push")
replace("  const db=currentDB(),prior=", "  if(toolResults.staging){e.stage=toolResults.staging.stage;e.source+='\\n【本次分期及依据】\\n'+toolResults.staging.analysis;}\n  const db=currentDB(),prior=")
# Persist the encounter stage as an actual per-record fact (never alter the patient archive).
replace("'prescriptionAnalysis', 'tcmPlan', 'supportPlan'", "'prescriptionAnalysis', 'stage', 'tcmPlan', 'supportPlan'")
replace("S(e.tcmEvidence)+(four.length?'，结合'", "S(e.tcmEvidence).replace(/[。；;，,]+$/,'')+(four.length?'，结合'")

# Prescription: shared current context and reviewed result transfer.
replace("const actionIds=['rxCopy','rxInsertGenerator','rxInsertWorkbench'];", "const actionIds=['rxCopy','rxInsertGenerator','rxInsertWorkbench'];let quickOrigin='';")
replace("actionIds.forEach(id=>$(id).disabled=!enabled);", "actionIds.forEach(id=>$(id).disabled=!enabled);$('rxInsertQuick').disabled=!enabled||!quickOrigin;")
rx_anchor=" $('rxCopy').addEventListener('click',async()=>"
rx_new=r''' document.addEventListener('v6-quick-tool-open',event=>{
  if(event.detail?.kind!=='prescription')return;const ctx=event.detail.context;
  if((trim($('rxRaw').value)||hasOutput())&&quickOrigin!==ctx.token&&!window.confirm('载入本次病程的处方与四诊，替换本页未归档的资料？'))return;
  resetResult('已共用本次病程资料，粘贴或修改处方后点击分析。');quickOrigin=ctx.token;
  for(const id of inputIds)$(id).value=['rxDosageForm','rxPreviousDosageForm'].includes(id)?'unknown':'';
  $('rxRaw').value=ctx.prescriptionRaw||'';$('rxDosageForm').value=['decoction','granules'].includes(ctx.dosageForm)?ctx.dosageForm:'unknown';
  for(const [id,key]of Object.entries({rxCancer:'tcmDisease',rxSyndrome:'syndrome',rxSymptoms:'symptoms',rxTongue:'tongue',rxCoat:'coat',rxPulse:'pulse'}))$(id).value=ctx[key]||'';
  $('rxCancer').value=ctx.tcmDisease||ctx.cancer||'';$('rxQuickContext').hidden=false;$('rxQuickContext').textContent='共用本次病程：'+ctx.label;
  syncActions();api.showPane('prescription');
 });
 $('rxUseQuick').onclick=()=>globalThis.V6Quick?.openTool('prescription');
 $('rxInsertQuick').onclick=()=>{if(!requireReviewed())return;if(V6Quick.acceptToolResult('prescription',{raw:$('rxRaw').value,dosageForm:$('rxDosageForm').value,analysis:analysisText()},quickOrigin)){quickOrigin=V6Quick.getToolContext().token;api.toast('处方分析已带回，请生成更新病程正文');}};
 $('rxCopy').addEventListener('click',async()=>'''
replace(rx_anchor,rx_new)
replace("const detail=event.detail||{};if((trim($('rxRaw').value)||hasOutput())", "const detail=event.detail||{};quickOrigin='';$('rxQuickContext').hidden=true;if((trim($('rxRaw').value)||hasOutput())")
replace("$('rxExample').addEventListener('click',()=>{if", "$('rxExample').addEventListener('click',()=>{quickOrigin='';$('rxQuickContext').hidden=true;if")
replace("$('rxReadGenerator').addEventListener('click',()=>{const mapping", "$('rxReadGenerator').addEventListener('click',()=>{quickOrigin='';$('rxQuickContext').hidden=true;syncActions();const mapping")

# Reports and staging: preserve the old destinations and add a guarded direct return.
replace("const reportContext=()=>", "let reportOrigin='',stageOrigin='';\n const reportContext=()=>")
report_anchor=" $('#analyzeReport').addEventListener('click',()=>"
report_new=r''' $('#reportUseQuick').onclick=()=>globalThis.V6Quick?.openTool('reports');
 document.addEventListener('v6-quick-tool-open',event=>{
  if(event.detail?.kind!=='reports')return;const ctx=event.detail.context;
  if((clean($('#reportRaw').value)||clean($('#reportResult').value))&&reportOrigin!==ctx.token&&!window.confirm('载入本次病程的检查与病情，替换本页未归档的资料？'))return;
  invalidateReport();reportOrigin=ctx.token;
  for(const [id,value]of Object.entries({reportRaw:ctx.labRaw,reportLabDate:ctx.labDate,reportSex:ctx.sex,reportAge:ctx.age,reportContext:ctx.symptoms,reportPrevious:'',reportPregnant:''}))$('#'+id).value=value||'';
  $('#reportQuickContext').hidden=false;$('#reportQuickContext').textContent='共用本次病程：'+ctx.label;showPane('reports');
 });
 $('#insertReportQuick').onclick=()=>{if(!clean($('#reportResult').value))return toast('请先生成并核对检查分析');if(V6Quick.acceptToolResult('reports',{raw:$('#reportRaw').value,date:$('#reportLabDate').value,analysis:$('#reportResult').value},reportOrigin)){reportOrigin=V6Quick.getToolContext().token;toast('检查分析已带回，请生成更新病程正文');}};
 $('#analyzeReport').addEventListener('click',()=>'''
replace(report_anchor,report_new)
replace("$('#reportExample').addEventListener('click',()=>{if", "$('#reportExample').addEventListener('click',()=>{reportOrigin='';$('#reportQuickContext').hidden=true;if")
replace("$('#openReportTool').addEventListener('click',()=>{invalidateReport();", "$('#openReportTool').addEventListener('click',()=>{reportOrigin='';$('#reportQuickContext').hidden=true;invalidateReport();")
replace("$('#insertStageResult').disabled=true;", "$('#insertStageResult').disabled=true;$('#insertStageQuick').disabled=true;")
replace("$('#insertStageResult').disabled=", "$('#insertStageResult').disabled=",count=s.count("$('#insertStageResult').disabled=")) if False else None
# The existing calculation is the source of truth for enabling stage transfer.
stage_enable=re.findall(r"\$\('#insertStageResult'\)\.disabled=([^;]+);",s)
for expr in set(stage_enable):
    if expr!='true':
        replace("$('#insertStageResult').disabled="+expr+";", "$('#insertStageResult').disabled="+expr+";$('#insertStageQuick').disabled="+expr+"||!stageOrigin;")
stage_anchor=" $('#copyStageResult').addEventListener"
stage_new=r''' $('#stageUseQuick').onclick=()=>globalThis.V6Quick?.openTool('staging');
 document.addEventListener('v6-quick-tool-open',event=>{
  if(event.detail?.kind!=='staging')return;const ctx=event.detail.context;
  if((clean($('#stageEvidence').value)||clean($('#stageResult').value))&&stageOrigin!==ctx.token&&!window.confirm('载入本次病程资料，替换本页未归档的分期条件？'))return;
  $('#clearStage').click();stageOrigin=ctx.token;$('#stageScopeConfirmed').checked=false;
  const defs=Object.values(STAGING_DEFS).filter(x=>x.cancer===ctx.cancer);if(defs.length===1){$('#stageCancer').value=defs[0].id;$('#stageCancer').dispatchEvent(new Event('change'));}
  $('#stageEvidence').value=ctx.labRaw||'';$('#stageQuickContext').hidden=false;$('#stageQuickContext').textContent='共用本次病程：'+ctx.label;showPane('staging');
 });
 $('#insertStageQuick').onclick=()=>{if(!lastStage?.stage||!lastDefinition)return;if(V6Quick.acceptToolResult('staging',{stage:lastStage.summary,analysis:$('#stageResult').value},stageOrigin)){stageOrigin=V6Quick.getToolContext().token;toast('分期结果及依据已带回，请生成更新病程正文');}};
 $('#copyStageResult').addEventListener'''
replace(stage_anchor,stage_new)
path.write_text(s)
print('Updated workflow:',path)
