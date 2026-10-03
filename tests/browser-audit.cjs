const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const input = path.resolve(process.argv[2] || '123.html');
  const output = path.resolve(process.argv[3] || 'test-results/original');
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome'});
  try {
    const context = await browser.newContext({viewport:{width:1360,height:1000}});
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    // An isolated context ensures these synthetic records cannot enter the user's browser data.
    await page.goto(pathToFileURL(input).href);
    await page.locator('#v6Password').fill('Synthetic-test-only-2026');
    await page.locator('#v6PasswordConfirm').fill('Synthetic-test-only-2026');
    await page.locator('#v6Unlock').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    await page.locator('#v6CloseSettings').click();
    await page.locator('#qName').fill('合成测试甲');
    await page.locator('#qHospital').fill('TEST-001');
    await page.locator('#qSex').selectOption({label:'男'});
    await page.locator('#qAge').fill('60');
    await page.locator('#qCancer').selectOption({label:'胃癌'});
    await page.locator('#qWestern').fill('胃腺癌（合成病例）');
    await page.locator('#qTcmDisease').selectOption({label:'胃癌'});
    await page.locator('#qSyndrome').selectOption({label:'气虚血瘀证'});
    await page.locator('#qChiefComplaint').fill('腹胀伴乏力1周');
    await page.locator('#qDate').fill('2026-10-03');
    await page.getByText('记录时间与查房医师（可选）', {exact:true}).click();
    await page.locator('#qDoctor').fill('测试医师');
    const complete = '今日症状：腹胀、乏力，食纳不佳。查体：T 36.5℃，BP 120/75 mmHg，腹软，无反跳痛。舌质：淡紫；舌苔：薄白；脉象：弦涩。辅助检查：2026-10-03 血红蛋白 110 g/L，参考范围130-175 g/L。诊疗计划：按既定医嘱继续本次治疗，记录每日进食量，明日复查血常规。';
    const results = [];
    const confirmationVisible = await page.locator('#qSyndromeConfirmed').isVisible();
    async function confirmSyndrome(checked) {
      if (await page.locator('#qSyndromeConfirmed').isVisible()) {
        await page.locator('#qSyndromeConfirmed').setChecked(checked);
      } else {
        // V6.2 hides this control. Exercise its stored state to audit the generator.
        await page.evaluate(checked=>{
          const el=document.getElementById('qSyndromeConfirmed');
          el.checked=checked;el.dispatchEvent(new Event('change',{bubbles:true}));
        },checked);
      }
    }
    async function capture(name) {
      await page.locator('#qGenerate').click();
      const text = await page.locator('#qNote').inputValue();
      const warnings = await page.locator('#qWarnings').innerText();
      const status = await page.locator('#qStatus').innerText();
      const result = {name, text, warnings, status};
      fs.writeFileSync(path.join(output, name+'.txt'), text+'\n\n【页面提示】\n'+warnings+'\n'+status);
      results.push(result);
      return result;
    }
    await page.locator('#qToday').fill(complete);
    for (const [name,label] of [['first','首次病程记录'],['daily','日常病程记录'],['attending','主治中医师查房记录'],['chief','主任中医师查房记录']]) {
      await page.locator('#qType').selectOption({label});
      await confirmSyndrome(true);
      await capture(name);
    }
    await confirmSyndrome(false);
    const unconfirmed = await capture('unconfirmed-syndrome');
    await page.locator('#qToday').fill('今日不再腹痛，纳食较昨日改善。');
    const resolved = await capture('resolved-pain');
    await page.locator('#qToday').fill('今日症状：无不适。计划：如出现发热，复查血常规。既往史：曾咳嗽。');
    const conditional = await capture('conditional-plan');
    await page.locator('#qToday').fill('今日症状：口干，舌红，苔少，脉细数，无乏力，无纳差。');
    await page.locator('#qSyndrome').selectOption({label:'脾胃气虚证'});
    await confirmSyndrome(true);
    const mismatch = await capture('syndrome-mismatch');
    await page.locator('#qType').selectOption({label:'日常病程记录'});
    await page.locator('#qSyndrome').selectOption('');
    await page.locator('#qToday').fill('今日乏力。');
    const sparse = await capture('sparse');
    await page.locator('#qToday').fill(complete);
    await page.locator('#qSyndrome').selectOption({label:'气虚血瘀证'});
    await confirmSyndrome(true);
    const save = await capture('save-roundtrip');
    await page.locator('#qReviewed').check();
    await page.locator('#qSaveCopy').click();
    await page.waitForFunction(()=>document.getElementById('qStatus').textContent.includes('本次病程已加密保存'));
    const saved = await page.evaluate(()=>V5Workbench.getDB().encounters.map(e=>({patientId:e.patientId,noteText:e.noteText,syndromeStatus:e.syndromeStatus})));
    await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
    const mobileFits = await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    await page.reload();
    await page.locator('#v6Password').fill('Synthetic-test-only-2026');
    await page.locator('#v6Unlock').click();
    await page.locator('#quickPane').waitFor({state:'visible'});
    const reopened = await page.evaluate(()=>V5Workbench.getDB().encounters.map(e=>e.noteText));
    const checks = {
      confirmation_control_visible: confirmationVisible,
      four_types_generate: results.slice(0,4).every(r=>r.text.length>300),
      unconfirmed_respected: !unconfirmed.text.includes('经医师辨证'),
      resolved_pain_not_asserted: !resolved.text.includes('已录腹部胀痛'),
      conditional_plan_not_symptom: !conditional.text.includes('已录发热或寒战')&&!conditional.text.includes('已录呼吸相关症状'),
      mismatched_syndrome_warned: /证型.*(?:对应|冲突|不足)|(?:对应|冲突|不足).*证型/.test(mismatch.warnings),
      sparse_keeps_missing: sparse.text.includes('【')&&!/T 36.5|BP 120\/75|血红蛋白 110/.test(sparse.text),
      save_matches_output: saved.length===1 && saved[0].noteText===save.text,
      reopen_matches_output: reopened.length===1 && reopened[0]===save.text,
      mobile_fits: mobileFits,
      no_page_errors: errors.length===0
    };
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({input,checks,errors,results,saved},null,2));
    console.log(JSON.stringify({input,checks,errors,lengths:results.map(r=>[r.name,r.text.length,(r.text.match(/【[^】]+】/g)||[]).length])},null,2));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error.stack);process.exit(1)});
