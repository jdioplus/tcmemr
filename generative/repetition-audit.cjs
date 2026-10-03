const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),vm=require('vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT=__dirname,source=fs.readFileSync(path.join(ROOT,'writer.js'),'utf8'),out=path.join(ROOT,'test-results/repetition.json');
const result={testedAt:new Date().toISOString(),writerSha256:crypto.createHash('sha256').update(source).digest('hex'),checks:[],mode:'Pure helper and simulated runtime callbacks; no model quality claim.'};
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);console.log('PASS:',name);};
const paragraph='患者今日仍诉乏力，未诉发热及黑便，血红蛋白86g/L，较昨日92g/L下降；拟于明日复查血常规，原因尚待评估。';
const sandbox={window:{},console};vm.runInNewContext(source,sandbox);const detect=sandbox.window.BingliWriter.detectRepetition;
check('Three consecutive long paragraphs detected',!!detect([paragraph,paragraph,paragraph].join('\n')));
check('Inline repeat detected even after fourth copy begins',!!detect(paragraph.repeat(3)+paragraph.slice(0,9)));
check('Three completed lines plus prefix of fourth detected',!!detect([paragraph,paragraph,paragraph,paragraph.slice(0,9)].join('\n')));
check('Two copies do not trigger',detect(paragraph.repeat(2))===null);
check('Different chapter headings break consecutive repetition',detect('病情：\n'+paragraph+'\n拟诊讨论：\n'+paragraph+'\n复评：\n'+paragraph)===null);
check('Short normal repeated phrase does not trigger',detect('继续观察。继续观察。继续观察。')===null);
check('Punctuation dividers do not trigger',detect('-'.repeat(220))===null);
check('Distinct paragraphs with shared clinical words do not trigger',detect(paragraph+'\n'+paragraph.replace('86g/L','88g/L')+'\n'+paragraph.replace('明日','后日'))===null);
// This owned mock exercises the real writer.js loading/streaming/AbortController
// paths. It does not execute a model or substitute for native runtime regression.
const fakeModule=`// Reviewed runtime anchor, deliberately unused by this owned mock: new Worker(r,{type:"module"})
export class Wllama {
 constructor(){this.loaded=false;}
 isModelLoaded(){return this.loaded;}
 async loadModel(){this.loaded=true;}
 getLoadedContextInfo(){return{metadata:{'general.architecture':'owned-test-mock'}};}
 async formatChat(){return'prompt';}
 async tokenize(){return[1,2,3];}
 async createChatCompletion(messages,options){
  globalThis.__lastSampling=options.sampling;
  const fixture=globalThis.__writerMock;let text='',count=0;
  for(let i=0;i<fixture.text.length&&count<options.nPredict;i+=7){
   const piece=fixture.text.slice(i,i+7);text+=piece;count+=1;
   options.onNewToken(count,new TextEncoder().encode(piece),text);
   if(options.abortSignal.aborted){
    if(fixture.throwOnAbort)throw new DOMException('Stopped','AbortError');
    return text;
   }
  }
  return text;
 }
}`;
const bytes=Buffer.from('GGUF-owned-repetition-fixture'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
const assets={manifest:{model:{name:'owned-test-mock',bytes:bytes.length,sha256:sha},parts:[{name:'mock.gguf.part01-of-01.bin',bytes:bytes.length,sha256:sha}]},module:Buffer.from(fakeModule).toString('base64'),wasm:'AA=='};
const htmlPath=path.join(ROOT,'test-results/repetition-fixture.html');fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(htmlPath,'<!doctype html><meta charset="utf-8"><textarea id="original">原稿保持不变</textarea><script>window.BINGLI_WRITER_ASSETS='+JSON.stringify(assets)+';</script><script>'+source+'</script>');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome',headless:true});
 const context=await browser.newContext({offline:true}),http=[],errors=[];context.on('request',request=>{if(/^https?:/i.test(request.url()))http.push(request.url());});await context.route(/^https?:\/\//,route=>route.abort());const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 try{
  result.chrome=browser.version();await page.goto('file://'+htmlPath);
  await page.evaluate(async data=>{const file=new File([new Uint8Array(data)],'mock.gguf.part01-of-01.bin');await BingliWriter.loadParts([file]);},[...bytes]);
  result.normalAbortReturn=await page.evaluate(async paragraph=>{window.__writerMock={text:paragraph.repeat(6),throwOnAbort:false};const run=await BingliWriter.generate({draft:paragraph},{maxTokens:100});return{run,state:BingliWriter.status(),source:document.getElementById('original').value};},paragraph);
  check('Actual streaming callback stops a looping mock early',result.normalAbortReturn.run.repetition&&result.normalAbortReturn.run.cancelled&&result.normalAbortReturn.run.incomplete&&result.normalAbortReturn.run.usage.generatedTokens<100);
  result.sampling=await page.evaluate(()=>__lastSampling);
  check('Runtime receives documented repetition sampling keys',result.sampling.penalty_repeat===1.1&&result.sampling.penalty_last_n===64&&!Object.hasOwn(result.sampling,'repeat_penalty'));
  check('Repeated candidate has explicit finish reason and state reason',result.normalAbortReturn.run.usage.finishReason==='repetition'&&result.normalAbortReturn.state.stopReason==='repetition'&&result.normalAbortReturn.state.reason.includes('候选未完成'));
  check('Writer never edits original draft',result.normalAbortReturn.source==='原稿保持不变');
  result.throwAbort=await page.evaluate(async paragraph=>{window.__writerMock={text:[paragraph,paragraph,paragraph,paragraph].join('\n'),throwOnAbort:true};const run=await BingliWriter.generate({draft:paragraph},{maxTokens:100});return{run,state:BingliWriter.status()};},paragraph);
  check('AbortError completion also keeps repetition and incomplete flags',result.throwAbort.run.repetition&&result.throwAbort.run.incomplete&&result.throwAbort.run.cancelled&&result.throwAbort.run.usage.finishReason==='repetition');
  result.next=await page.evaluate(async paragraph=>{window.__writerMock={text:paragraph,throwOnAbort:false};const run=await BingliWriter.generate({draft:paragraph},{maxTokens:100});return{run,state:BingliWriter.status()};},paragraph);
  check('Next normal generation clears previous repetition state',!result.next.run.repetition&&!result.next.run.incomplete&&!result.next.run.cancelled&&result.next.state.reason==='');
  result.manualCancel=await page.evaluate(async paragraph=>{window.__writerMock={text:paragraph,throwOnAbort:true};const run=await BingliWriter.generate({draft:paragraph},{maxTokens:100,onToken:(piece,text,meta)=>{if(meta.count===3)BingliWriter.cancel();}});return{run,state:BingliWriter.status()};},paragraph);
  check('Manual stop is distinguished from loop detection',result.manualCancel.run.cancelled&&result.manualCancel.run.incomplete&&!result.manualCancel.run.repetition&&result.manualCancel.run.usage.finishReason==='cancelled');
  result.httpRequests=http;result.pageErrors=errors;check('Simulation runs file:// offline with zero HTTP and no page errors',http.length===0&&errors.length===0);result.pass=true;
 }catch(error){result.pass=false;result.error=error.stack;throw error;}finally{fs.writeFileSync(out,JSON.stringify(result,null,2));await browser.close();}
 console.log(JSON.stringify({pass:result.pass,checks:result.checks.length,result:out}));
})().catch(error=>{console.error(error);process.exitCode=1;});
