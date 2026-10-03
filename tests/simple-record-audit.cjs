/* Synthetic browser regression for the single-page offline writer. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const input=path.resolve(process.argv[2]||'病历书写简版.html');
const output=path.resolve(process.argv[3]||'test-results/simple-record');

async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome'});
 const checks=[],errors=[],network=[];let page;
 try{
  const context=await browser.newContext({viewport:{width:1360,height:1000},acceptDownloads:true});context.setDefaultTimeout(10000);
  await context.addInitScript(()=>{
   globalThis.auditStorageWrites=[];globalThis.auditDatabaseOpens=[];
   const originalSet=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){globalThis.auditStorageWrites.push({key:String(key),value:String(value)});return originalSet.call(this,key,value);};
   const originalOpen=IDBFactory.prototype.open;
   IDBFactory.prototype.open=function(name,version){globalThis.auditDatabaseOpens.push(String(name));return version===undefined?originalOpen.call(this,name):originalOpen.call(this,name,version);};
  });
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push({url:request.url(),method:request.method()});});
  await page.goto(pathToFileURL(input).href);
  await page.locator('#qToday').waitFor({state:'visible'});
  assert.equal(await page.locator('#v6Password,#v6PasswordConfirm,#v6Unlock,#v6SecuritySetup').count(),0,'Simple writer must open without security setup');
  assert.ok(await page.locator('#qGenerate').isVisible());assert.ok(await page.locator('#qNote').isVisible());
  checks.push('Single page opens directly with visible source, generate and draft controls, without password setup');

  async function selectIfPresent(id,label){
   const control=page.locator('#'+id);if(!await control.count())return;await control.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
   if(await control.evaluate(el=>el.tagName==='SELECT')){
    const values=await control.locator('option').evaluateAll(elements=>elements.map(el=>({value:el.value,label:el.textContent})));
    const option=values.find(item=>item.value===label||item.label===label)||values.find(item=>item.label.includes(label));
    assert.ok(option,'Missing '+id+' option '+label);await control.selectOption(option.value);
   }else await control.fill(label);
  }
  async function fillSource(){
   await selectIfPresent('qType','日常病程记录');
   await selectIfPresent('qCancer','胃癌');
   if(await page.locator('#qWestern').count())await page.locator('#qWestern').fill('胃腺癌（合成测试病例）');
   await selectIfPresent('qTcmDisease','胃癌');
   await selectIfPresent('qSyndrome','脾胃气虚证');
   if(await page.locator('#qSyndromeConfirmed').count())await page.locator('#qSyndromeConfirmed').check();
   if(await page.locator('#qDate').count())await page.locator('#qDate').fill(await page.locator('#qDate').getAttribute('type')==='datetime-local'?'2026-10-04T09:00':'2026-10-04');
   const source='今日症状：乏力，纳差，每日进食减少。查体：腹软，无反跳痛。舌质：淡；舌苔：薄白；脉象：弱。\n辅助检查：2026-10-04 血红蛋白 110 g/L，参考范围130-175 g/L。\n本次计划：评估实际摄入量，结合血象趋势讨论。';
   await page.locator('#qToday').fill(source);
   if(await page.locator('#qLabs').count())await page.locator('#qLabs').fill('血红蛋白 110 g/L，参考范围130-175 g/L。');
  }
  await fillSource();await page.locator('#qGenerate').click();
  await page.waitForFunction(()=>document.getElementById('qNote').value.length>100);
  const fatigue=page.locator('[data-decision-card="fatigue"]');await fatigue.waitFor({state:'visible'});
  assert.equal(await fatigue.locator('[data-review-primary]').inputValue(),'');
  assert.equal(await page.locator('#qDecisionReview input:checked').count(),0,'Default generation must not choose physician judgments');
  const anemia=page.locator('[data-decision-card="anemia"]');await anemia.waitFor({state:'visible'});
  checks.push('Synthetic fatigue, intake and low hemoglobin produce draft and initially unselected clinical review cards');

  const manual='人工保留段落：合成测试已核对实际进食量及活动耐量。';
  await page.locator('#qNote').fill((await page.locator('#qNote').inputValue())+'\n\n'+manual);
  await fatigue.locator('summary').click();await anemia.locator('summary').click();await fatigue.locator('[data-review-primary]').selectOption('anemia');
  await fatigue.locator('[data-review-secondary="intake"]').check();
  await anemia.locator('[data-review-check="iron"]').check();
  const extra='本次判断补充：已核对合成病例乏力与进食量的时间关系。';
  await fatigue.locator('[data-review-extra]').fill(extra);
  let note=await page.locator('#qNote').inputValue();
  assert.ok(note.includes(manual),'Selecting clinical judgments must preserve an unrelated manual paragraph');
  assert.ok(note.includes(extra));assert.ok(note.includes('乏力主要考虑与贫血有关'));
  assert.ok(/摄入减少可能参与/.test(note));assert.ok(/拟完善.*铁蛋白.*转铁蛋白饱和度/.test(note));
  fs.writeFileSync(path.join(output,'selected-note.txt'),note);
  checks.push('Anemia primary, reduced-intake factor, iron studies and extra reasoning update only relevant note content and retain manual text');

  const serialized=page.locator('#clinicalSelections');
  if(await serialized.count()){
   const choices=JSON.parse(await serialized.inputValue());assert.equal(choices.fatigue.primary,'anemia');assert.ok(choices.fatigue.secondary.includes('intake'));assert.ok(choices.anemia.checks.includes('iron'));assert.equal(choices.fatigue.extra,extra);
  }
  const inMemory=await page.evaluate(()=>BingliMini.getState());
  const choices=JSON.parse(inMemory.encounter.clinicalSelections);assert.equal(choices.fatigue.primary,'anemia');assert.ok(choices.fatigue.secondary.includes('intake'));assert.ok(choices.anemia.checks.includes('iron'));assert.equal(choices.fatigue.extra,extra);
  await page.locator('#qGenerate').click();
  assert.equal(await fatigue.locator('[data-review-primary]').inputValue(),'anemia');
  assert.equal(await fatigue.locator('[data-review-secondary="intake"]').isChecked(),true);assert.equal(await anemia.locator('[data-review-check="iron"]').isChecked(),true);
  assert.equal(await fatigue.locator('[data-review-extra]').inputValue(),extra);
  checks.push('Regenerating the same source retains actual choices in the current in-memory record');

  for(const recordType of ['日常病程记录','首次病程记录','主治中医师查房记录','主任中医师查房记录']){
   await page.locator('#qType').selectOption(recordType);await page.locator('#qGenerate').click();
   const typedNote=await page.locator('#qNote').inputValue();assert.ok(typedNote.includes(recordType));
   assert.ok(typedNote.includes('110 g/L')&&typedNote.includes('脾胃气虚证'));
   if(/首次/.test(recordType))assert.ok(typedNote.includes('因“')&&typedNote.includes('拟诊讨论：'));
   if(/查房/.test(recordType))assert.ok(typedNote.includes('查房指示：')&&typedNote.includes('病机'));
   fs.writeFileSync(path.join(output,recordType+'.txt'),typedNote);
  }
  checks.push('Daily, first, attending-round and chief-round types all produce their own note headings and preserve actual source facts');
  await page.locator('#qType').selectOption('日常病程记录');await page.locator('#qGenerate').click();

  await page.getByText('古籍查阅与引文选用',{exact:true}).click();await page.locator('#bookSearch').fill('脾胃');
  const book=page.locator('#bookList .book-entry').first();await book.waitFor({state:'visible'});
  const quotation=await book.locator('p').first().textContent();assert.ok(quotation.length>5);
  await book.locator('input[type="checkbox"]').check();
  const quotedNote=await page.locator('#qNote').inputValue();assert.ok(quotedNote.includes(quotation.replace(/[。；;]+$/,'')));
  await page.getByText('保存或打开草稿文件',{exact:true}).click();
  const draftDownload=page.waitForEvent('download');await page.locator('#saveDraft').click();const draft=await draftDownload;
  const draftPath=path.join(output,'saved-draft.json');await draft.saveAs(draftPath);
  const saved=JSON.parse(fs.readFileSync(draftPath,'utf8'));assert.equal(saved.format,'bingli-mini');assert.equal(saved.selectedBooks.length,1);
  assert.equal(JSON.parse(saved.clinicalSelections).fatigue.primary,'anemia');assert.equal(saved.noteText,quotedNote);
  await page.locator('#qReviewed').check();const textDownload=page.waitForEvent('download');await page.locator('#downloadNote').click();const exported=await textDownload;
  const textPath=path.join(output,'exported-note.txt');await exported.saveAs(textPath);assert.equal(fs.readFileSync(textPath,'utf8'),quotedNote);
  await page.locator('#qClear').click();await page.locator('#draftFile').setInputFiles(draftPath);
  await page.waitForFunction(()=>document.getElementById('qStatus').textContent.includes('草稿已打开'));
  assert.equal(await page.locator('#qNote').inputValue(),quotedNote);
  assert.equal(await fatigue.locator('[data-review-primary]').inputValue(),'anemia');assert.equal(await anemia.locator('[data-review-check="iron"]').isChecked(),true);
  assert.equal(await book.locator('input[type="checkbox"]').isChecked(),true);assert.equal(await page.locator('#qReviewed').isChecked(),false);assert.equal(await page.locator('#qCopy').isDisabled(),true);
  checks.push('Ancient-text search/selection enters the note, selected quotation and choices survive a local draft-file round trip, and downloaded TXT exactly matches reviewed text');
  const beforeBad={source:await page.locator('#qToday').inputValue(),note:await page.locator('#qNote').inputValue(),state:await page.evaluate(()=>BingliMini.getState())};
  const badDraft={...saved,inputs:{...saved.inputs,qToday:'损坏草稿中的另一例合成资料'},clinicalSelections:'{'};
  await page.locator('#draftFile').setInputFiles({name:'bad-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(badDraft))});
  await page.waitForFunction(()=>document.getElementById('qStatus').textContent.includes('未打开草稿'));
  assert.equal(await page.locator('#qToday').inputValue(),beforeBad.source,'Rejected draft must leave the current source unchanged');
  assert.equal(await page.locator('#qNote').inputValue(),beforeBad.note,'Rejected draft must leave the current note unchanged');
  assert.deepEqual(await page.evaluate(()=>BingliMini.getState()),beforeBad.state,'Rejected draft must leave current clinical choices and state unchanged');
  checks.push('Malformed decision JSON is rejected without partially replacing source, note or clinical selections');

  if(!await page.locator('#qPlan').isVisible())await page.getByText('本次治疗、复评与宣教安排',{exact:true}).click();
  await page.locator('#qPlan').fill('继续现有化疗。明日复查血常规。');await page.locator('#qGenerate').click();
  const treatment=page.locator('[data-decision-card="treatment"]');await treatment.waitFor({state:'visible'});
  assert.equal(await treatment.locator('[data-review-secondary]').count(),0,'Treatment decision must not allow a second opposite primary choice');
  await treatment.locator('summary').click();await treatment.locator('[data-review-primary]').selectOption('defer');
  const conflictedNote=await page.locator('#qNote').inputValue();assert.ok(conflictedNote.includes('本次拟暂缓当前治疗'));assert.ok(conflictedNote.includes('继续现有化疗。明日复查血常规。'),'Choosing defer must not swallow the originally entered follow-up plan');
  await page.locator('#qReviewed').check();assert.equal(await page.locator('#qConflict').isVisible(),true);assert.equal(await page.locator('#qCopy').isDisabled(),true);assert.equal(await page.locator('#downloadNote').isDisabled(),true);
  await page.locator('#qPlan').fill('暂缓现有化疗。明日复查血常规。');await page.locator('#qGenerate').click();await page.locator('#qReviewed').check();
  assert.equal(await treatment.locator('[data-review-primary]').inputValue(),'defer');assert.equal(await page.locator('#qConflict').isVisible(),false);assert.equal(await page.locator('#qCopy').isEnabled(),true);
  assert.ok((await page.locator('#qNote').inputValue()).includes('明日复查血常规'));
  checks.push('Treatment choices have one primary decision, retain the entered recheck plan, block export for a continue/defer conflict, and unblock after the doctor plan is corrected and regenerated');
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(mobile.scrollWidth,390);
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  checks.push('Entire simple writer and review cards fit a 390px phone viewport without horizontal overflow');

  const reset=page.locator('#qClear');
  assert.equal(await reset.count(),1,'Simple writer must provide a clear/new-record button');await reset.click();
  assert.equal(await page.locator('#qNote').inputValue(),'');
  await fillSource();await page.locator('#qGenerate').click();await fatigue.waitFor({state:'visible'});
  assert.equal(await fatigue.locator('[data-review-primary]').inputValue(),'');assert.equal(await page.locator('#qDecisionReview input:checked').count(),0);
  assert.equal(await fatigue.locator('[data-review-extra]').inputValue(),'');
  note=await page.locator('#qNote').inputValue();assert.ok(!note.includes(manual)&&!note.includes(extra));
  checks.push('Clear/new record removes prior choices, reasoning and manual paragraphs before a new draft');

  assert.deepEqual(network,[],'Default offline writing must make no HTTP requests');
  const persistence=await page.evaluate(()=>({writes:auditStorageWrites,databases:auditDatabaseOpens}));
  assert.deepEqual(persistence.writes,[],'Simple page must not automatically persist clinical content to Web Storage');assert.deepEqual(persistence.databases,[],'Simple page must not open a patient database');
  assert.deepEqual(errors,[]);
  checks.push('Default offline workflow makes no network requests, stores no clinical content in Web Storage and opens no IndexedDB');
  const testedBytes=fs.readFileSync(input);
  const testedFile={path:input,bytes:testedBytes.length,sha256:createHash('sha256').update(testedBytes).digest('hex'),testedAt:new Date().toISOString(),platform:'macOS isolated Chrome; Windows runtime not tested'};
  const result={status:'PASS',checks,errors,network,testedFile};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }catch(error){const result={status:'FAIL',checks,errors,network,failure:error.stack};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
