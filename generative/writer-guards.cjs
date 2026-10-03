const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT=path.resolve(__dirname),SOURCE=path.join(ROOT,'writer-demo.html'),OUT=path.join(ROOT,'test-results/guards.json');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome',headless:true});
 const context=await browser.newContext({offline:true});const http=[];context.on('request',r=>{if(/^https?:/i.test(r.url()))http.push(r.url());});await context.route(/^https?:\/\//,r=>r.abort());
 const page=await context.newPage(),data=fs.readFileSync(SOURCE),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json')));
 const result={testedAt:new Date().toISOString(),chrome:browser.version(),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),checks:[]};
 const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS:',name);};
 try{
  await page.goto('file://'+SOURCE);await page.locator('#parts').setInputFiles(manifest.parts.map(p=>path.join(ROOT,'parts',p.name)));
  await page.evaluate(async()=>BingliWriter.loadParts(document.getElementById('parts').files));
  result.badSameSizePart=await page.evaluate(async()=>{const files=[...document.getElementById('parts').files],f=files[0];files[0]=new File([new Uint8Array([0]),f.slice(1)],f.name);let error='';try{await BingliWriter.loadParts(files);}catch(e){error=e.message;}return{error,state:BingliWriter.status()};});
  check('Same-size corrupt part rejected by SHA and loaded model remains available',result.badSameSizePart.error.includes('校验不通过')&&result.badSameSizePart.state.loaded);
  result.duplicatePart=await page.evaluate(async()=>{const files=[...document.getElementById('parts').files];files[1]=files[0];let error='';try{await BingliWriter.loadParts(files);}catch(e){error=e.message;}return{error,state:BingliWriter.status()};});
  check('Duplicate part number rejected',result.duplicatePart.error.includes('重复')&&result.duplicatePart.state.loaded);
  result.longInput=await page.evaluate(async()=>{const before=document.getElementById('original').value;let error='';try{await BingliWriter.generate('病'.repeat(10000),{maxTokens:2200});}catch(e){error=e.message;}return{error,state:BingliWriter.status(),sourceUnchanged:before===document.getElementById('original').value};});
  check('Overlong input rejected before inference without changing source',result.longInput.error.includes('材料过长')&&result.longInput.state.state==='ready'&&result.longInput.sourceUnchanged);
  result.timingAndConcurrent=await page.evaluate(async()=>{
   const run=BingliWriter.generate({recordType:'日常病程',facts:'以原文为准。',judgments:'保持事实及否定，仅整理语句。',draft:'今日乏力；无发热；Hb86g/L；明日复查血常规。'},{maxTokens:150,onToken:(piece,full,meta)=>{if(meta.count===5)BingliWriter.cancel();}});
   let concurrentError='';try{await BingliWriter.generate('另一段',{maxTokens:50});}catch(e){concurrentError=e.message;}
   return{result:await run,concurrentError,state:BingliWriter.status()};
  });
  check('Concurrent generation rejected, first generation remains stoppable',result.timingAndConcurrent.concurrentError.includes('正在处理')&&result.timingAndConcurrent.result.cancelled);
  check('First-token and decode timings measured from real inference',result.timingAndConcurrent.result.usage.firstTokenMs>0&&result.timingAndConcurrent.result.usage.decodeMs>0);
  result.httpRequests=http;check('All guards run offline with zero HTTP',http.length===0);result.pass=true;
  fs.writeFileSync(OUT,JSON.stringify(result,null,2));console.log(JSON.stringify({pass:true,checks:result.checks.length,timing:result.timingAndConcurrent.result.usage,result:OUT},null,2));
 }catch(e){result.pass=false;result.error=e.stack;fs.writeFileSync(OUT,JSON.stringify(result,null,2));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
