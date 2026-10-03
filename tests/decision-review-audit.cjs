const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const args=process.argv.slice(2).filter(arg=>arg!=='--ui-only');
const input=path.resolve(args[0]||'123-v6.3.html');
const output=path.resolve(args[1]||'test-results/decision-review');
const uiPath=path.join(__dirname,'decision-review-ui.js');

async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome'});
 const checks=[],errors=[];let page;
 try{
  const context=await browser.newContext({viewport:{width:1360,height:1000}});context.setDefaultTimeout(10000);
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.setContent('<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="qDecisionReview"></div></body></html>');
  await page.addScriptTag({path:uiPath});
  await page.evaluate(()=>{
   globalThis.uiChanges=[];
   globalThis.syntheticCards=[{id:'fatigue',title:'乏力的本次判断',contextNote:'<img src=x onerror="globalThis.reviewXSS=true">是文字测试',options:[{id:'anemia',label:'贫血相关',text:'本次主要考虑贫血相关乏力。'},{id:'lowIntake',label:'低摄入',text:'本次主要考虑摄入不足相关乏力。'},{id:'dehydration',label:'脱水',text:'结合本次实际评估考虑脱水。'}],checks:[{id:'iron',label:'铁代谢',text:'拟完善铁代谢检查。'},{id:'cbc',label:'血常规',text:'拟复查血常规。'}]}];
   V63ReviewUI.render(syntheticCards,(id,state)=>uiChanges.push({id,state}));
  });
  const unitCard=page.locator('[data-decision-card="fatigue"]');
  assert.equal(await unitCard.locator('[data-review-primary]').inputValue(),'');
  assert.equal(await unitCard.locator('input:checked').count(),0);
  assert.equal(await page.evaluate(()=>uiChanges.length),0);
  assert.equal(await page.locator('#qDecisionReview img').count(),0);
  assert.equal(await page.evaluate(()=>globalThis.reviewXSS),undefined);
  await unitCard.locator('[data-review-primary]').selectOption('anemia');
  assert.equal(await unitCard.locator('[data-review-secondary="anemia"]').isVisible(),false);
  await unitCard.locator('[data-review-secondary="lowIntake"]').check();
  await unitCard.locator('[data-review-check="iron"]').check();
  await unitCard.locator('[data-review-extra]').fill('本次已核对实际摄入量。');
  let state=await page.evaluate(()=>uiChanges.at(-1).state);
  assert.deepEqual(state,{primary:'anemia',secondary:['lowIntake'],checks:['iron'],extra:'本次已核对实际摄入量。'});
  await unitCard.locator('[data-review-primary]').selectOption('lowIntake');
  state=await page.evaluate(()=>uiChanges.at(-1).state);
  assert.equal(state.primary,'lowIntake');assert.deepEqual(state.secondary,[]);assert.deepEqual(state.checks,['iron']);
  await unitCard.locator('[data-review-extra]').focus();
  await unitCard.locator('[data-review-extra]').evaluate(el=>el.setSelectionRange(2,5));
  const changesBefore=await page.evaluate(()=>uiChanges.length);
  await page.evaluate(()=>V63ReviewUI.render(syntheticCards,(id,state)=>uiChanges.push({id,state}),{fatigue:uiChanges.at(-1).state}));
  assert.equal(await page.evaluate(()=>uiChanges.length),changesBefore);
  assert.equal(await unitCard.locator('[data-review-primary]').inputValue(),'lowIntake');
  assert.equal(await unitCard.locator('[data-review-check="iron"]').isChecked(),true);
  assert.deepEqual(await unitCard.locator('[data-review-extra]').evaluate(el=>[el.selectionStart,el.selectionEnd]),[2,5]);
  await page.setViewportSize({width:390,height:844});
  const unitMobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.equal(unitMobile.scrollWidth,390);
  await page.screenshot({path:path.join(output,'ui-mobile.png')});
  await page.evaluate(()=>V63ReviewUI.render(syntheticCards,()=>{throw new Error('Rendering must not call onChange')},{}));
  assert.equal(await unitCard.locator('[data-review-primary]').inputValue(),'');
  assert.equal(await unitCard.locator('input:checked').count(),0);
  assert.equal(await unitCard.locator('[data-review-extra]').inputValue(),'');
  checks.push('Pure UI: no default judgment/callback, escaped text, main/secondary exclusion, check/extra values, restore/focus, clean new selections, mobile fit');

  if(!process.argv.includes('--ui-only')){
   await page.setViewportSize({width:1360,height:1000});
   await page.goto(pathToFileURL(input).href);
   await page.locator('#v6Password').fill('Synthetic-decision-only-2026');
   await page.locator('#v6PasswordConfirm').fill('Synthetic-decision-only-2026');
   await page.locator('#v6Unlock').click();await page.locator('#quickPane').waitFor({state:'visible'});
   if(await page.locator('#v6CloseSettings').isVisible())await page.locator('#v6CloseSettings').click();
   async function set(id,value,type='input'){
    await page.evaluate(({id,value,type})=>{const el=document.getElementById(id);if(!el)throw new Error('Missing '+id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event(type,{bubbles:true}));},{id,value,type});
   }
   await page.locator('#qName').fill('合成判断甲');await page.locator('#qHospital').fill('DECISION-TEST-001');
   await page.locator('#qSex').selectOption('男');await page.locator('#qAge').fill('50');
   await page.locator('#qCancer').selectOption('胃癌');await page.locator('#qWestern').fill('胃腺癌（合成病例）');
   await page.locator('#qTcmDisease').selectOption('胃癌');await page.locator('#qSyndrome').selectOption('脾胃气虚证');
   await page.locator('#qType').selectOption('日常病程记录');await page.locator('#qDate').fill('2026-10-03');
   await page.locator('#qToday').fill('今日症状：乏力，纳差，每日进食减少。查体：腹软，无反跳痛。舌质：淡；舌苔：薄白；脉象：弱。');
   await set('qSyndromeConfirmed',true,'change');await set('qLabs','血红蛋白 110 g/L，参考范围130-175 g/L。');await set('qLabDate','2026-10-03','change');
   await page.locator('#qGenerate').click();await page.locator('#qDecisionReview').waitFor({state:'visible'});
   const fatigue=page.locator('#qDecisionReview .v63-review-card').filter({has:page.locator('h4',{hasText:/乏力|疲乏/})}).first();
   await fatigue.waitFor({state:'visible'});
   const primary=fatigue.locator('[data-review-primary]');assert.equal(await primary.inputValue(),'');
   assert.equal(await fatigue.locator('input:checked').count(),0);
   const options=await primary.locator('option').evaluateAll(elements=>elements.map(el=>({id:el.value,label:el.textContent})));
   const anemia=options.find(option=>option.id&&/贫血/.test(option.label));assert.ok(anemia,'Need a physician-selectable anemia judgment');
   const secondaries=await fatigue.locator('[data-review-secondary]').evaluateAll(elements=>elements.map(el=>({id:el.dataset.reviewSecondary,label:el.closest('label').textContent})));
   const lowIntake=secondaries.find(option=>/低摄入|摄入不足|摄入减少|进食减少|纳差/.test(option.label));assert.ok(lowIntake,'Need an optional low-intake factor');
   const further=await fatigue.locator('[data-review-check]').evaluateAll(elements=>elements.map(el=>({id:el.dataset.reviewCheck,label:el.closest('label').textContent})));
   const iron=further.find(check=>/铁代谢|铁蛋白/.test(check.label));assert.ok(iron,'Need a selectable iron-study check');
   const manualMarker='人工保留段落：本次已核对纳食记录，继续记录实际摄入量。';
   await page.locator('#qNote').fill((await page.locator('#qNote').inputValue())+'\n\n'+manualMarker);
   await primary.selectOption(anemia.id);
   await fatigue.locator('[data-review-secondary]').filter({hasNot:page.locator('[hidden]')}).evaluateAll(()=>{});
   await fatigue.locator('[data-review-secondary]').evaluateAll((elements,id)=>elements.find(el=>el.dataset.reviewSecondary===id).click(),lowIntake.id);
   await fatigue.locator('[data-review-check]').evaluateAll((elements,id)=>elements.find(el=>el.dataset.reviewCheck===id).click(),iron.id);
   const extraMarker='本次判断补充：合成病例已核对乏力与进食量的时间关系。';
   await fatigue.locator('[data-review-extra]').fill(extraMarker);
   const note=await page.locator('#qNote').inputValue();
   assert.ok(note.includes(manualMarker),'Choosing a judgment must preserve unrelated manual note edits');
   assert.ok(note.includes(extraMarker),'Additional physician reasoning must enter the note');
   assert.ok(/贫血/.test(note)&&/摄入|进食/.test(note)&&/铁代谢|铁蛋白/.test(note),'Chosen judgment, factor and check must enter the draft');
   fs.writeFileSync(path.join(output,'selected-note.txt'),note);
   checks.push('Integrated choices: anemia primary, low-intake secondary, iron studies and additional reasoning update the note without replacing unrelated manual text');
   await page.locator('#qReviewed').check();await page.locator('#qSaveCopy').click();
   await page.waitForFunction(()=>V5Workbench.getDB().encounters.length===1);
   const saved=await page.evaluate(()=>{const db=V5Workbench.getDB();return{encounter:db.encounters[0],validation:V5Data.validateDB(db)};});
   assert.equal(saved.validation.valid,true,JSON.stringify(saved.validation.errors));
   function findChoice(value){
    if(typeof value==='string'&&/^\s*[{[]/.test(value)){try{return findChoice(JSON.parse(value));}catch(_){return null;}}
    if(!value||typeof value!=='object')return null;
    if(value.primary===anemia.id&&Array.isArray(value.secondary)&&value.secondary.includes(lowIntake.id)&&Array.isArray(value.checks)&&value.checks.includes(iron.id)&&value.extra===extraMarker)return value;
    for(const item of Object.values(value)){const found=findChoice(item);if(found)return found;}return null;
   }
   assert.ok(findChoice(saved.encounter),'Saved encounter must include actual physician choices, not only flattened prose');
   assert.ok(saved.encounter.noteText.includes(manualMarker)&&saved.encounter.noteText.includes(extraMarker));
   fs.writeFileSync(path.join(output,'saved-encounter.json'),JSON.stringify(saved,null,2));
   checks.push('Selected decision values and edited note persist in the validated encrypted-save workflow');
   await page.locator('#qNewPatient').click();await page.locator('#qName').fill('合成判断乙');await page.locator('#qHospital').fill('DECISION-TEST-002');
   await page.locator('#qCancer').selectOption('胃癌');await page.locator('#qToday').fill('今日症状：乏力，纳差。查体：腹软。');
   await page.locator('#qGenerate').click();
   const nextFatigue=page.locator('#qDecisionReview .v63-review-card').filter({has:page.locator('h4',{hasText:/乏力|疲乏/})}).first();
   assert.equal(await nextFatigue.locator('[data-review-primary]').inputValue(),'');
   assert.equal(await nextFatigue.locator('input:checked').count(),0);
   assert.equal(await nextFatigue.locator('[data-review-extra]').inputValue(),'');
   const nextNote=await page.locator('#qNote').inputValue();assert.ok(!nextNote.includes(manualMarker)&&!nextNote.includes(extraMarker));
   checks.push('A different quick patient starts with empty choices and receives no prior patient reasoning or manual paragraphs');
   await page.setViewportSize({width:390,height:844});
   const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(mobile.scrollWidth,390);
   await page.locator('#qDecisionReview').screenshot({path:path.join(output,'integrated-mobile.png')});
   checks.push('Integrated review cards remain usable at 390 px without horizontal overflow');
  }
  assert.deepEqual(errors,[]);const result={status:'PASS',checks,errors};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }catch(error){const result={status:'FAIL',checks,errors,failure:error.stack};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
