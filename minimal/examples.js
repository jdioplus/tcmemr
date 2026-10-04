/* Explicitly imported writing examples are kept in memory and exported by the user. */
(function(g){
 'use strict';
 const host=document.getElementById('inputs');if(!host)return;
 const panel=document.createElement('details');panel.id='exampleLibrary';
 panel.innerHTML='<summary>我的书写范例</summary><p class="mini-help muted">收藏认可的脱敏范例，便于查阅。范例用于对照书写风格；当前 AI 只整理预设用语，范例中的患者内容不送入生成。关闭页面前可导出范例库，导入范例不改变模型权重。</p><label>范例标题<input id="exampleTitle" placeholder="如：胃癌主治查房"></label><label>范例正文（脱敏后）<textarea id="exampleText" rows="5"></textarea></label><label>希望沿用的写法<input id="examplePreference" placeholder="如：查房指示连续成段，先说明主要判断，再写进一步检查"></label><div class="actions"><button id="exampleAdd" type="button">收录范例</button><button id="exampleImport" type="button">导入 TXT／范例库</button><button id="exampleExport" type="button">导出范例库</button><input id="exampleFile" type="file" accept=".txt,.json" multiple hidden></div><p id="exampleStatus" class="status" role="status"></p><div id="exampleList"></div>';
 host.append(panel);
 const $=id=>document.getElementById(id),S=v=>String(v??'').trim();let examples=[];
 function render(){
  $('exampleList').replaceChildren();
  for(const entry of examples){const d=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p'),remove=document.createElement('button');summary.textContent=entry.title+' · '+entry.type;p.textContent=entry.text;p.style.whiteSpace='pre-wrap';remove.type='button';remove.textContent='移除';remove.onclick=()=>{examples=examples.filter(x=>x.id!==entry.id);render();};d.append(summary,p,remove);$('exampleList').append(d);}
  $('exampleStatus').textContent='当前窗口已有 '+examples.length+' 份范例。';
 }
 function entry(x){
  if(!x||typeof x!=='object'||typeof x.text!=='string'||!S(x.text)||x.text.length>40000)throw Error('每份范例须为非空文字，且不超过4万字');
  const type=S(x.type)||$('qType').value;if(![...$('qType').options].some(o=>o.value===type))throw Error('范例病程类型无法识别');
  return {id:'example-'+Date.now()+'-'+Math.random().toString(36).slice(2),type,cancer:S(x.cancer),title:S(x.title).slice(0,100)||'书写范例',text:S(x.text),preference:S(x.preference).slice(0,1000)};
 }
 function add(rows){if(examples.length+rows.length>200)throw Error('一个范例库最多200份，请分库保存');for(const row of rows)if(!examples.some(x=>x.text===row.text&&x.type===row.type))examples.push(row);render();}
 $('exampleAdd').onclick=()=>{try{add([entry({title:$('exampleTitle').value,text:$('exampleText').value,preference:$('examplePreference').value,type:$('qType').value,cancer:$('qCancer').value})]);$('exampleText').value='';}catch(e){$('exampleStatus').textContent=e.message;}};
 $('exampleImport').onclick=()=>$('exampleFile').click();
 $('exampleFile').onchange=async()=>{try{const rows=[];for(const file of $('exampleFile').files){if(file.size>8e6)throw Error('单份范例文件请控制在8MB以内');const text=await file.text();if(/\.json$/i.test(file.name)){const data=JSON.parse(text);if(data.format!=='bingli-examples'||data.version!==1||!Array.isArray(data.examples))throw Error('不是本版范例库文件');rows.push(...data.examples.map(entry));}else{const header=text.slice(0,150),type=/首次病程/.test(header)?'首次病程记录':/主治(?:中)?(?:医师)?查房/.test(header)?'主治中医师查房记录':/主任(?:中)?(?:医师)?查房/.test(header)?'主任中医师查房记录':/日常病程/.test(header)?'日常病程记录':$('qType').value;rows.push(entry({title:file.name.replace(/\.txt$/i,''),text,type,cancer:$('qCancer').value}));}}add(rows);}catch(e){$('exampleStatus').textContent='未导入：'+e.message;}finally{$('exampleFile').value='';}};
 $('exampleExport').onclick=()=>{const blob=new Blob([JSON.stringify({format:'bingli-examples',version:1,examples},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='我的脱敏病历范例库.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 async function context(query,{type,cancer,limit=1}={}){
  const rows=examples.filter(x=>!type||x.type===type),same=rows.filter(x=>x.cancer&&x.cancer===cancer),pool=same.length?same:rows;
  if(!pool.length)return [];
  if(g.BingliSemantic){try{const matches=await g.BingliSemantic.search(query,pool.map(x=>({id:x.id,text:x.text})),{limit});return matches.map(m=>pool.find(x=>x.id===m.id)).filter(Boolean);}catch(_){/* Examples still work through their explicit type/cancer labels. */}}
  return pool.slice(-limit);
 }
 render();g.BingliExamples=Object.freeze({context,count:()=>examples.length,entries:()=>JSON.parse(JSON.stringify(examples))});
})(globalThis);
