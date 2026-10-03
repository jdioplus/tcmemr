const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Only synthetic data in a new, isolated Chrome context. No existing browser
// profile, local patient database, or patient files are opened by this audit.
async function main() {
  const input = path.resolve(process.argv[2] || '123-v6.3.html');
  const output = path.resolve(process.argv[3] || 'test-results/workflow');
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome'});
  const checks = [], errors = [];
  let page;
  try {
    const context = await browser.newContext({viewport:{width:1360,height:1000}});
    context.setDefaultTimeout(10000);
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(pathToFileURL(input).href);
    await page.locator('#v6Password').fill('Synthetic-workflow-only-2026');
    await page.locator('#v6PasswordConfirm').fill('Synthetic-workflow-only-2026');
    await page.locator('#v6Unlock').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    if (await page.locator('#v6CloseSettings').isVisible()) await page.locator('#v6CloseSettings').click();

    async function fill(id, value) { await page.locator('#'+id).fill(value); }
    async function select(id, value) { await page.locator('#'+id).selectOption(value); }
    async function menuClosed() {
      assert.equal(await page.locator('#v6ToolLinks').isVisible(), false);
      assert.equal(await page.locator('#v6MoreTools').getAttribute('aria-expanded'), 'false');
    }
    async function openTool(id, pane) {
      await page.locator('#v6MoreTools').click();
      assert.equal(await page.locator('#v6MoreTools').getAttribute('aria-expanded'), 'true');
      await page.locator('#'+id).click();
      await page.locator('#'+pane).waitFor({state:'visible'});
      await menuClosed();
    }
    async function generate() {
      await page.locator('#qGenerate').click();
      const text = await page.locator('#qNote').inputValue();
      assert.ok(text.length > 100, 'Expected a generated clinical draft');
      return text;
    }
    async function setIfHidden(id, value, type='input') {
      await page.evaluate(({id,value,type}) => {
        const el=document.getElementById(id);if(!el)throw new Error('Missing '+id);
        if(el.type==='checkbox')el.checked=value;else el.value=value;
        el.dispatchEvent(new Event(type,{bubbles:true}));
      }, {id,value,type});
    }

    await fill('qName', '合成流程甲');
    await fill('qHospital', 'WORKFLOW-TEST-001');
    await select('qSex', '男');
    await fill('qAge', '50');
    await select('qCancer', '胃癌');
    await fill('qWestern', '胃腺癌（合成病例）');
    await select('qTcmDisease', '胃癌');
    await select('qSyndrome', '肝胃不和证');
    await select('qType', '日常病程记录');
    await fill('qDate', '2026-10-03');
    await fill('qToday', '今日症状：胃脘胀痛，嗳气。查体：腹软，无反跳痛。舌质：淡红；舌苔：薄白；脉象：弦。');
    await setIfHidden('qSyndromeConfirmed', true, 'change');
    const reportRaw = '2026-10-03 血红蛋白 110 g/L，参考范围130-175 g/L。';
    const rxRaw = '黄芪 15g，党参 12g，白术 10g，茯苓 15g。';
    await setIfHidden('qLabs', reportRaw);
    await setIfHidden('qLabDate', '2026-10-03', 'change');
    await setIfHidden('qRx', rxRaw);
    await setIfHidden('qDosageForm', 'decoction', 'change');
    await setIfHidden('qPlan', '核对合成资料，记录进食量。');
    await menuClosed();

    await page.locator('#qToolReports').click();
    await page.locator('#reportsPane').waitFor({state:'visible'});
    await menuClosed();
    assert.equal(await page.locator('#reportRaw').inputValue(), reportRaw);
    assert.equal(await page.locator('#reportSex').inputValue(), '男');
    assert.equal(await page.locator('#reportAge').inputValue(), '50');
    assert.equal(await page.locator('#reportLabDate').inputValue(), '2026-10-03');
    await page.locator('#analyzeReport').click();
    assert.ok(await page.locator('#reportItems tr').count() > 0);
    const reportMarker = '人工修订检查分析：合成报告已核对，关注血红蛋白实际变化。';
    await fill('reportResult', (await page.locator('#reportResult').inputValue())+'\n'+reportMarker);
    await page.locator('#insertReportQuick').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    assert.equal(await page.locator('#qLabs').inputValue(), reportRaw);
    assert.ok((await generate()).includes(reportMarker), 'Report edits must survive regeneration');
    checks.push('Quick context prefilled report raw/age/sex/date; reviewed report edit survives return and generation');

    await page.locator('#qToolPrescription').click();
    await page.locator('#prescriptionPane').waitFor({state:'visible'});
    await menuClosed();
    assert.equal(await page.locator('#rxRaw').inputValue(), rxRaw);
    assert.equal(await page.locator('#rxCancer').inputValue(), '胃癌');
    assert.equal(await page.locator('#rxSyndrome').inputValue(), '肝胃不和证');
    assert.equal(await page.locator('#rxDosageForm').inputValue(), 'decoction');
    assert.ok((await page.locator('#rxSymptoms').inputValue()).includes('胃脘胀痛'));
    await page.locator('#rxAnalyze').click();
    assert.ok(await page.locator('#rxItems tr').count() > 0);
    const rxMarker = '人工修订方解：保留合成处方意图，按实际四诊复核。';
    await fill('rxAnalysis', (await page.locator('#rxAnalysis').inputValue())+'\n'+rxMarker);
    await page.locator('#rxReviewed').check();
    await page.locator('#rxInsertQuick').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    assert.equal(await page.locator('#qRx').inputValue(), rxRaw);
    const withRx = await generate();
    assert.ok(withRx.includes(rxMarker), 'Prescription edits must survive regeneration');
    assert.ok(withRx.includes(reportMarker), 'Returning a prescription must preserve the earlier report edit');
    checks.push('Quick prescription and four-diagnosis context prefilled; both edited tool analyses retained');

    await page.locator('#qToolStaging').click();
    await page.locator('#stagingPane').waitFor({state:'visible'});
    await menuClosed();
    assert.equal(await page.locator('#stageCancer').inputValue(), 'gastric');
    await fill('stageDate', '2026-10-03');
    await fill('stageEvidence', '合成初治资料：原发胃腺癌，侵犯胃周围组织，区域淋巴结临床评估阴性，完整远处评估未见转移。');
    await select('stageTiming', 'initial');
    await page.locator('#stageScopeConfirmed').check();
    for (const [field,value] of Object.entries({mode:'c',context:'primary',scopeConfirmed:'yes',depth:'T3',nodeStatus:'negative',metastasis:'M0'})) {
      await page.locator('#stageInputs [data-stage-field="'+field+'"]').selectOption(value);
    }
    await page.locator('#calculateStage').click();
    const stageText = await page.locator('#stageResult').inputValue();
    assert.ok(stageText.includes('cT3') && stageText.includes('cN0') && stageText.includes('IIB'));
    assert.equal(await page.locator('#insertStageQuick').isDisabled(), false);
    await page.locator('#insertStageQuick').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    const withStage = await generate();
    assert.ok(withStage.includes('cT3') && withStage.includes('IIB'), 'Current-encounter staging must reach the draft');
    assert.ok(withStage.includes(reportMarker) && withStage.includes(rxMarker));
    const wrongCancer = await page.evaluate(() => {
      const ctx=V6Quick.getToolContext();
      return V6Quick.acceptToolResult('staging',{cancer:'肺癌',stage:'肺癌，合成误配分期IV期',analysis:'不同癌种合成误配，必须拒绝。'},ctx.token);
    });
    assert.equal(wrongCancer,false,'Staging for a different cancer must not enter the current quick encounter');
    checks.push('Different-cancer staging is rejected before it can replace the current gastric stage');
    await page.locator('#qReviewed').check();
    await page.locator('#qSaveCopy').click();
    await page.waitForFunction(() => V5Workbench.getDB().encounters.length === 1);
    const saved = await page.evaluate(() => {const db=V5Workbench.getDB();return {encounter:db.encounters[0],validation:V5Data.validateDB(db)};});
    assert.equal(saved.validation.valid, true, JSON.stringify(saved.validation.errors));
    assert.ok(saved.encounter.noteText.includes('cT3') && saved.encounter.noteText.includes(reportMarker) && saved.encounter.noteText.includes(rxMarker));
    fs.writeFileSync(path.join(output,'saved-encounter.json'), JSON.stringify(saved,null,2));
    checks.push('Validated cT3 cN0 cM0 / IIB stage returns to quick draft and encrypted-save schema accepts it');
    await page.locator('#workbenchTab').click();
    await page.locator('#wbPatientList .wb-patient').first().click();
    await page.locator('[data-wb-tab="encounter"]').click();
    await page.locator('#wbEncounterSelect').selectOption(saved.encounter.id);
    await page.locator('#wbGenerateNote').click();
    const regenerated = await page.locator('#wbNoteText').inputValue();
    assert.ok(regenerated.includes('cT3') && regenerated.includes('IIB'),'Workbench regeneration must retain saved encounter staging');
    checks.push('Saved encounter staging survives loading and regenerating the same record in the workbench');
    await page.locator('#quickTab').click();

    await page.locator('#qToolReports').click();
    await page.locator('#reportsPane').waitFor({state:'visible'});
    await menuClosed();
    await page.locator('#analyzeReport').click();
    const staleMarker = '过期患者甲检查分析：不得写入患者乙。';
    await fill('reportResult', staleMarker);
    await page.locator('#quickTab').click();
    await page.locator('#qNewPatient').click();
    await fill('qName','合成流程乙');
    await fill('qHospital','WORKFLOW-TEST-002');
    await fill('qToday','今日无明显不适。');
    const beforeWrong = await page.locator('#qLabs').inputValue();
    // Deliberately dispatch the old tool's action without reopening it, so the
    // stale-origin guard is exercised even if a normal reopen clears results.
    await page.evaluate(() => document.getElementById('insertReportQuick').click());
    assert.equal(await page.locator('#qName').inputValue(),'合成流程乙');
    assert.equal(await page.locator('#qLabs').inputValue(),beforeWrong);
    assert.ok(!(await page.locator('#qNote').inputValue()).includes(staleMarker));
    checks.push('Old patient/record origin cannot overwrite a new quick patient');

    for (const [id,pane] of [['reportsTab','reportsPane'],['stagingTab','stagingPane'],['prescriptionTab','prescriptionPane'],['generatorTab','generatorPane']]) {
      await page.locator('#quickTab').click();
      await openTool(id,pane);
      assert.equal(await page.locator('#v6ToolContext').isVisible(),true);
      await page.locator('#v6ToolReturn').click();
      await page.locator('#quickPane').waitFor({state:'visible'});
    }
    await page.locator('#libraryTab').click();await page.locator('#libraryPane').waitFor({state:'visible'});await menuClosed();
    await page.locator('#workbenchTab').click();await page.locator('#workbenchPane').waitFor({state:'visible'});await menuClosed();
    await page.locator('[data-wb-tab="patient"]').click();
    await fill('wbName','合成工作台尚未保存资料');
    assert.equal(await page.evaluate(()=>V5Workbench.isDirty()),true);
    await page.locator('#quickTab').click();
    await page.locator('#qToolReports').click();
    await page.locator('#reportsPane').waitFor({state:'visible'});
    await fill('reportRaw',reportRaw);await page.locator('#analyzeReport').click();
    await page.locator('#insertReportQuick').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    assert.equal(await page.locator('#wbName').inputValue(),'合成工作台尚未保存资料');
    assert.equal(await page.evaluate(()=>V5Workbench.isDirty()),true);
    checks.push('All seven original panes remain reachable; quick tool return preserves unsaved workbench edits');

    await page.locator('#v6MoreTools').click();await page.keyboard.press('Escape');await menuClosed();
    await page.locator('#v6MoreTools').click();await page.locator('header.top h1').click();await menuClosed();
    await page.locator('#v6MoreTools').click();await page.locator('#v6CloseTools').click();await menuClosed();
    await page.screenshot({path:path.join(output,'desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#v6MoreTools').click();
    const mobile=await page.evaluate(()=>{const items=[...document.querySelectorAll('#v6MainNav>button,#v6MoreTools')].map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right}}),r=document.getElementById('v6ToolLinks').getBoundingClientRect();return{items,menu:{x:r.x,right:r.right},scrollWidth:document.documentElement.scrollWidth,width:innerWidth};});
    assert.equal(new Set(mobile.items.map(item=>Math.round(item.y))).size,1);
    assert.ok(mobile.items.every(item=>item.x>=0&&item.right<=390));
    assert.ok(mobile.menu.x>=0&&mobile.menu.right<=390);
    assert.equal(mobile.scrollWidth,390);
    await page.screenshot({path:path.join(output,'mobile.png')});
    checks.push('Escape/outside/close maintain collapsed state; 390 px mobile navigation and menu fit without overflow');
    assert.deepEqual(errors,[]);
    const result={status:'PASS',checks,errors,mobile};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } catch (error) {
    const result={status:'FAIL',checks,errors,failure:error.stack};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
    if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
