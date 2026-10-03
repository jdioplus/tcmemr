const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(__dirname);
const SOURCE = process.argv[2] || path.join(ROOT, 'writer-demo.html');
const OUT = path.join(ROOT, 'test-results');
(async () => {
  fs.mkdirSync(OUT, {recursive: true});
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome', headless: true});
  const context = await browser.newContext({offline: true, viewport: {width: 1280, height: 900}});
  const http = [], errors = [], requests = [];
  context.on('request', r => {requests.push(r.url()); if (/^https?:/i.test(r.url())) http.push(r.url());});
  await context.route(/^https?:\/\//, r => r.abort());
  await context.addInitScript(() => {
    window.__writerWrites = [];
    const set = Storage.prototype.setItem; Storage.prototype.setItem = function(...args) {window.__writerWrites.push('Storage.setItem');return set.apply(this,args);};
    const open = IDBFactory.prototype.open; IDBFactory.prototype.open = function(...args) {window.__writerWrites.push('IDB.open');return open.apply(this,args);};
    if (navigator.storage?.getDirectory) {const dir = navigator.storage.getDirectory.bind(navigator.storage);navigator.storage.getDirectory = (...args) => {window.__writerWrites.push('OPFS.getDirectory');return dir(...args);};}
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.text().startsWith('WRITER') || ['warning','error'].includes(m.type())) console.log(m.type(),m.text());});
  const source = fs.readFileSync(SOURCE);
  const result = {testedAt: new Date().toISOString(), source: SOURCE, bytes: source.length, sha256: crypto.createHash('sha256').update(source).digest('hex'), chrome: browser.version(), platform: 'macOS; Windows not tested', offline: true, model: JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json'))).model, checks: []};
  const check = (name, ok) => {assert.ok(ok, name);result.checks.push(name);console.log('PASS:',name);};
  const monitor = setInterval(() => page.evaluate(() => BingliWriter.status()).then(s => console.log('STATUS:', JSON.stringify(s))).catch(() => {}), 15000);
  try {
    await page.goto('file://' + SOURCE, {waitUntil: 'load'});
    await page.evaluate(() => addEventListener('bingli-writer-status', e => {const s=e.detail;if (s.state!=='generating' || s.generatedTokens%20===0) console.log('WRITER',s.state,s.progress?.message||'',s.generatedTokens||0,s.error); }));
    check('Opening HTML does not load model or access storage', await page.evaluate(() => BingliWriter.status().state==='unloaded' && __writerWrites.length===0));
    result.invalidParts = await page.evaluate(async () => {
      const before = BingliWriter.status();let error='';try {await BingliWriter.loadParts([new File(['x'],'qwen.part01-of-05.bin')]);}catch(e){error=e.message;}
      return {before,after:BingliWriter.status(),error};
    });
    check('Incomplete model selection rejected without changing unloaded state', result.invalidParts.error && result.invalidParts.after.state==='unloaded');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json')));
    await page.locator('#parts').setInputFiles([...manifest.parts].reverse().map(p => path.join(ROOT,'parts',p.name)));
    const t = Date.now();
    await page.locator('#load').click();
    await page.waitForFunction(() => ['ready','error'].includes(BingliWriter.status().state), null, {timeout: 90000});
    result.loadWallMs = Date.now()-t;
    result.loadedState = await page.evaluate(() => BingliWriter.status());
    check('Five parts sorted, per-part and whole SHA checked, real Qwen model loaded', result.loadedState.loaded && result.loadedState.architecture==='qwen2');
    const original = await page.locator('#original').inputValue();
    result.shortRewrite = await page.evaluate(async () => {
      const original = document.getElementById('original').value;const tokens=[];
      const r=await BingliWriter.generate(original,{maxTokens:220,onToken:(piece,full,meta)=>{tokens.push({piece,full:full.slice(-60),count:meta.count});document.getElementById('candidate').value=full;}});
      return {...r,callbacks:tokens.length,firstCallback:tokens[0],lastCallback:tokens.at(-1),original:document.getElementById('original').value,state:BingliWriter.status()};
    });
    check('Real model produces Chinese candidate with token callbacks', /[\u4e00-\u9fff]{3}/.test(result.shortRewrite.text) && result.shortRewrite.callbacks>5);
    check('Generating candidate does not mutate source text', result.shortRewrite.original===original);
    result.shortRewrite.observedPreservation = {has86:result.shortRewrite.text.includes('86'),has92:result.shortRewrite.text.includes('92'),hasNegativeFever:result.shortRewrite.text.includes('无发热'),hasNegativeVomiting:result.shortRewrite.text.includes('无呕吐'),hasUncertainJudgment: /考虑|可能|相关|进一步/.test(result.shortRewrite.text)};
    fs.writeFileSync(path.join(OUT,'baseline-short-rewrite.txt'), result.shortRewrite.text);
    result.cancelledRewrite = await page.evaluate(async () => BingliWriter.generate({recordType:'日常病程',facts:'2026-10-04。胃癌，患者无发热，无黑便。Hb 86 g/L。',judgments:'贫血原因待进一步评估。明日复查血常规。',draft:'胃癌患者今日无发热，无黑便；血红蛋白86 g/L，贫血原因待进一步评估，拟明日复查血常规。'},{maxTokens:150,onToken:(piece,full,meta)=>{if(meta.count===5)BingliWriter.cancel();}}));
    check('Stop returns incomplete candidate and retains loaded model', result.cancelledRewrite.cancelled && result.cancelledRewrite.usage.generatedTokens<=7 && await page.evaluate(() => BingliWriter.status().loaded));
    result.structuredRewrite = await page.evaluate(async () => BingliWriter.generate({recordType:'日常病程',facts:'今日为2026-10-04，患者无发热，无黑便。今日Hb 86 g/L，昨日Hb 92 g/L。舌脉资料未提供。',judgments:'医师考虑乏力与贫血和低摄入相关，贫血原因未确定，明日复查血常规和铁代谢。',draft:'2026-10-04，患者乏力，进食减少，无发热，无黑便。Hb86g/L，昨日92g/L。医师考虑与贫血和低摄入相关，病因待核，明日复查血常规、铁代谢。未提供舌脉。'},{maxTokens:220}));
    check('After stop, next structured generation succeeds', !result.structuredRewrite.cancelled && result.structuredRewrite.text.length>20);
    fs.writeFileSync(path.join(OUT,'baseline-structured-rewrite.txt'),result.structuredRewrite.text);
    result.structuredRewrite.observedPreservation = {date:result.structuredRewrite.text.includes('2026-10-04'),has86:result.structuredRewrite.text.includes('86'),has92:result.structuredRewrite.text.includes('92'),negativeFever:result.structuredRewrite.text.includes('无发热'),negativeMelena:result.structuredRewrite.text.includes('无黑便'),uncertainty:/待核|待.*评估|未确定|待.*明确|尚.*明确|进一步/.test(result.structuredRewrite.text),tomorrow:/明日/.test(result.structuredRewrite.text)};
    await page.screenshot({path:path.join(OUT,'desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    check('390-pixel layout fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(OUT,'mobile.png'),fullPage:true});
    result.storageAccess = await page.evaluate(()=>__writerWrites);
    result.httpRequests=http;result.requests=requests;result.pageErrors=errors;
    check('Offline inference makes zero HTTP requests',http.length===0);
    check('No automatic Storage, IndexedDB or OPFS access',result.storageAccess.length===0);
    check('No uncaught page errors',errors.length===0);
    result.pass=true;
    fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({pass:true,checks:result.checks.length,loadMs:result.loadWallMs,rewriteMs:result.shortRewrite.usage.elapsedMs,tokens:result.shortRewrite.usage.generatedTokens,http:0,output:result.shortRewrite.text,structured:result.structuredRewrite.text,result:path.join(OUT,'result.json')},null,2));
  } catch(error) {
    result.pass=false;result.failure=error.stack;result.httpRequests=http;result.pageErrors=errors;result.currentState=await page.evaluate(()=>BingliWriter.status()).catch(()=>null);result.requests=requests;
    await page.screenshot({path:path.join(OUT,'failure.png'),fullPage:true}).catch(()=>{});
    fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));throw error;
  } finally {clearInterval(monitor);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
