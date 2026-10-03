/* Real models in the assembled page, synthetic text, offline browser context. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
(async()=>{
 const file=path.resolve(process.argv[2]||'test-results/integrated-ai/病历书写AI.html'),partsDir=path.resolve(process.argv[3]||'generative/parts'),out=path.resolve(process.argv[4]||'test-results/integrated-ai/runtime');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome',headless:true});const ctx=await browser.newContext({offline:true,viewport:{width:1400,height:1000}});const page=await ctx.newPage(),errors=[],network=[],checks=[];let result;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 try{
  await page.goto(pathToFileURL(file).href);assert.equal(await page.evaluate(()=>BingliWriter.status().loaded),false);
  const docs=[{id:'a',text:'患者乏力、进食减少，可结合血红蛋白及实际摄入量评估。'},{id:'b',text:'网页按钮位于右侧，窗口可以调整大小。'}];
  const semantic=await page.evaluate(docs=>BingliSemantic.search('乏力伴贫血和纳差',docs,{limit:1}),docs);assert.equal(semantic[0].id,'a');checks.push('Integrated local encoder returns relevant passage offline');
  const parts=fs.readdirSync(partsDir).filter(n=>/\.bin$/.test(n)).sort().reverse().map(n=>path.join(partsDir,n));
  await page.locator('#writerParts').setInputFiles(parts);await page.waitForFunction(()=>BingliWriter.status().loaded,{},{timeout:60000});checks.push('Actual model loads from unordered local parts through application UI');
  const original='患者今日乏力，无发热。血红蛋白86 g/L。医师考虑乏力与贫血有关，拟明日复查血常规。';await page.locator('#qNote').fill(original);await page.locator('#qNote').evaluate(el=>el.setSelectionRange(0,0));
  await page.locator('#writerGenerate').click();await page.waitForFunction(()=>document.getElementById('writerStatus').textContent.includes('候选已生成'),{},{timeout:180000});
  const candidate=await page.locator('#writerCandidate').inputValue();assert(candidate.includes('86'));assert(/无发热/.test(candidate));assert(/明日|明天/.test(candidate));assert.equal(await page.locator('#qNote').inputValue(),original);assert(await page.locator('#writerAccept').isDisabled());checks.push('Real Chinese candidate retains sample number, negative fever and future recheck, leaves original untouched');
  await page.locator('#writerReviewed').check();await page.locator('#writerAccept').click();assert.equal(await page.locator('#qNote').inputValue(),candidate);assert.equal(await page.locator('#qReviewed').isChecked(),false);checks.push('Reviewed candidate adoption still requires final note review');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const bytes=fs.readFileSync(file);result={pass:true,checks,errors,network,original,candidate,model:await page.evaluate(()=>BingliWriter.status()),file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),chrome:browser.version(),scope:'macOS isolated offline Chrome, synthetic case, no clinical qualification'};
 }catch(error){result={pass:false,checks,errors,network,error:error.stack};throw error;}
 finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
