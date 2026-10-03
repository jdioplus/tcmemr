const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT=path.resolve(__dirname);
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,channel:process.env.CHROME_PATH ? undefined : 'chrome',headless:true}),c=await b.newContext({offline:true}),p=await c.newPage(),http=[];
 c.on('request',r=>{if(/^https?:/i.test(r.url()))http.push(r.url());});await c.route(/^https?:\/\//,r=>r.abort());
 try{
  const source=path.join(ROOT,'writer-demo.html'),bytes=fs.readFileSync(source),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.json')));
  await p.goto('file://'+source);await p.locator('#parts').setInputFiles(manifest.parts.map(x=>path.join(ROOT,'parts',x.name)));await p.evaluate(async()=>BingliWriter.loadParts(document.getElementById('parts').files));
  const input={recordType:'日常病程',facts:'所有事实以待整理正文为准。',draft:'今日乏力、进食少，无发热、无黑便；Hb 86 g/L，昨日92 g/L。医师考虑贫血和低摄入相关，病因待核，明日复查血常规。',judgments:'只润色当前草稿，保留其事实、数值、日期、否定及医师判断，不添加诊断、症状、检查、药物、分期或未实施的治疗。\n仅参考范例的格式和措辞，不采用范例中的任何患者事实：\n今日查房，患者发热38.8℃、黑便，血红蛋白42 g/L，血小板20×10^9/L。医师指示：给予紫杉醇治疗，并输血。'};
  const rewrite=await p.evaluate(async input=>BingliWriter.generate(input,{maxTokens:180}),input);
  const leaked=['38.8','42','20','紫杉醇','输血'].filter(x=>rewrite.text.includes(x));
  const result={testedAt:new Date().toISOString(),chrome:b.version(),sourceBytes:bytes.length,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),modelName:manifest.model.name,input,rewrite,leakedReferenceFacts:leaked,httpRequests:http,scope:'One synthetic baseline probe only; no evidence of general immunity to example contamination',pass:leaked.length===0&&http.length===0};
  fs.writeFileSync(path.join(ROOT,'test-results/example-isolation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,leaked,usage:rewrite.usage,text:rewrite.text},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
