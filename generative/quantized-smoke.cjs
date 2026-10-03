const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'experiment-v1')),SOURCE=path.join(ROOT,'runtime-demo.html'),OUT=path.join(ROOT,'runtime-result.json'),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json')));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome',headless:true}),context=await browser.newContext({offline:true}),http=[],errors=[];
 context.on('request',request=>{if(/^https?:/i.test(request.url()))http.push(request.url());});await context.route(/^https?:\/\//,route=>route.abort());
 await context.addInitScript(()=>{window.__writes=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.__writes.push('Storage.setItem');return set.apply(this,args);};const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){window.__writes.push('IDB.open');return open.apply(this,args);};if(navigator.storage?.getDirectory){const get=navigator.storage.getDirectory.bind(navigator.storage);navigator.storage.getDirectory=(...args)=>{window.__writes.push('OPFS');return get(...args);};}});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const data=fs.readFileSync(SOURCE),result={testedAt:new Date().toISOString(),chrome:browser.version(),platform:'macOS; Windows not tested',source:SOURCE,htmlBytes:data.length,htmlSha256:crypto.createHash('sha256').update(data).digest('hex'),model:manifest.model,claim:'Deployment compatibility only; v1 failed independent writing quality and is not a release model.',checks:[]};
 const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS:',name);};
 try{
  await page.goto('file://'+SOURCE);check('No automatic model load or storage access on open',await page.evaluate(()=>BingliWriter.status().state==='unloaded'&&__writes.length===0));
  await page.locator('#parts').setInputFiles([...manifest.parts].reverse().map(part=>path.join(ROOT,part.name)));
  const start=Date.now();await page.evaluate(async()=>BingliWriter.loadParts(document.getElementById('parts').files));result.loadWallMs=Date.now()-start;result.loadedState=await page.evaluate(()=>BingliWriter.status());
  check('Actual exported GGUF verified, loaded and identified as qwen2',result.loadedState.loaded&&result.loadedState.architecture==='qwen2'&&result.loadedState.model===manifest.model.name);
  result.output=await page.evaluate(async()=>{const draft='今日乏力，无发热，无黑便。血红蛋白86 g/L，原因尚待评估，拟于明日复查血常规。';const before=document.getElementById('original').value;const run=await BingliWriter.generate({recordType:'日常病程记录',facts:'所有事实以待整理正文为准。',judgments:'只润色当前草稿，保留其事实、数值、日期、否定及医师判断，不添加诊断、症状、检查、药物、分期或未实施的治疗。',draft},{maxTokens:128});return{draft,...run,sourceUnchanged:before===document.getElementById('original').value,state:BingliWriter.status()};});
  check('Native WASM inference emits Chinese text',/[\u4e00-\u9fff]{3}/.test(result.output.text)&&result.output.usage.generatedTokens>3);
  check('Experimental output does not modify note',result.output.sourceUnchanged);
  result.httpRequests=http;result.pageErrors=errors;result.storageAccess=await page.evaluate(()=>__writes);
  check('file:// offline inference has zero HTTP or persistent storage access',http.length===0&&result.storageAccess.length===0);check('No unhandled page errors',errors.length===0);result.compatibilityPass=true;result.clinicalQualityPass=false;
 }catch(error){result.compatibilityPass=false;result.error=error.stack;result.httpRequests=http;result.pageErrors=errors;result.state=await page.evaluate(()=>BingliWriter.status()).catch(()=>null);throw error;}finally{fs.writeFileSync(OUT,JSON.stringify(result,null,2));await browser.close();}
 console.log(JSON.stringify({compatibilityPass:result.compatibilityPass,clinicalQualityPass:false,parts:manifest.parts.length,loadWallMs:result.loadWallMs,output:result.output.text,usage:result.output.usage,repetition:result.output.repetition,result:OUT},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
