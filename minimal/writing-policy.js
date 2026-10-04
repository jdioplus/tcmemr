/* Fixed wording changes only. This policy does not verify medical meaning. */
(function(g){
 'use strict';
 const RULES=Object.freeze([
  {id:'today',from:'今天',to:'今日'},
  {id:'yesterday',from:'昨天',to:'昨日'},
  {id:'tomorrow',from:'明天',to:'明日'},
  {id:'patient-says',from:'患者说',to:'患者诉'},
  {id:'no-fever',from:'没有发热',to:'无发热'},
  {id:'no-chills',from:'没有寒战',to:'无寒战'},
  {id:'no-abdominal-pain',from:'没有腹痛',to:'无腹痛'},
  {id:'report-pending',from:'报告还没出来',to:'报告尚未回报'}
 ].map(Object.freeze));
 const OPENERS=new Map([['“','”'],['‘','’'],['"','"'],["'","'"],['「','」'],['『','』'],['【','】'],['《','》']]);
 const asText=value=>String(value??'');
 const lineEndings=value=>asText(value).replace(/\r\n/g,'\n');

 // An unclosed quotation/template protects the rest of the input. Its contents
 // are never guessed, repaired, or passed through wording substitutions.
 function protectedEnd(text,start){
  const stack=[OPENERS.get(text[start])];
  for(let i=start+1;i<text.length;i++){
   const character=text[i];
   if(character==='\\'&&(stack[stack.length-1]==='"'||stack[stack.length-1]==="'")){i++;continue;}
   if(character===stack[stack.length-1]){stack.pop();if(!stack.length)return i+1;}
   else if(OPENERS.has(character))stack.push(OPENERS.get(character));
  }
  return text.length;
 }

 function ruleMatches(rule,text,at){
  if(!text.startsWith(rule.from,at))return false;
  // Recognize only a narrow speech boundary. A blacklist of compounds would
  // miss expressions such as "患者说漏了"; unknown continuations stay verbatim.
  if(rule.id==='patient-says'&&!/^(?:$|[\s：:，,。！？!?；;“‘"'「『]|今天|昨天|明天|今日|昨日|明日|目前|现在|近日|近来|仍|已经|已|没有|无|有|感觉|感到|觉得|自觉)/.test(text.slice(at+rule.from.length)))return false;
  return true;
 }

 function standardize(value){
  const source=asText(value),edits=[];let text='';
  for(let at=0;at<source.length;){
   if(OPENERS.has(source[at])){
    const end=protectedEnd(source,at);text+=source.slice(at,end);at=end;continue;
   }
   const rule=RULES.find(item=>ruleMatches(item,source,at));
   if(rule){
    const end=at+rule.from.length;
    edits.push({ruleId:rule.id,from:rule.from,to:rule.to,start:at,end});
    text+=rule.to;at=end;
   }else{text+=source[at];at++;}
  }
  return {text,edits,changed:text!==source};
 }

 function assess(original,candidate){
  const before=lineEndings(original),after=lineEndings(candidate);
  if(before===after)return {safe:true,unchanged:true,code:'unchanged',reason:'候选与原文相同，无措辞变化。'};
  if(standardize(before).text===standardize(after).text){
   return {safe:true,unchanged:false,code:'allowed-wording',reason:'变化仅在固定措辞词表内；未进行医学语义验证。'};
  }
  return {safe:false,unchanged:false,code:'outside-wording-policy',reason:'候选包含固定措辞词表以外的变化，保留原文。'};
 }

 // GBNF quoted strings support these escapes. Never interpolate raw text as a
 // grammar expression: only this literal encoder or fixed grammar punctuation
 // may contribute to the generated rule.
 function grammarLiteral(value){
  let result='"';
  for(const character of value){
   const code=character.codePointAt(0);
   if(code>=0xd800&&code<=0xdfff)throw new Error('原文含孤立的 Unicode 代理字符，不能生成措辞约束；请保留原文。');
   if(character==='"')result+='\\"';
   else if(character==='\\')result+='\\\\';
   else if(character==='\n')result+='\\n';
   else if(character==='\r')result+='\\r';
   else if(character==='\t')result+='\\t';
   else if(code<0x20||(code>=0x7f&&code<=0x9f)||code===0x2028||code===0x2029)result+='\\u'+code.toString(16).padStart(4,'0');
   else result+=character;
  }
  return result+'"';
 }

 function buildGrammar(value){
  const original=asText(value),result=standardize(original),parts=[];let at=0;
  for(const edit of result.edits){
   if(edit.start>at)parts.push(grammarLiteral(original.slice(at,edit.start)));
   parts.push('('+grammarLiteral(edit.from)+' | '+grammarLiteral(edit.to)+')');
   at=edit.end;
  }
  if(at<original.length||!parts.length)parts.push(grammarLiteral(original.slice(at)));
  return {grammar:'root ::= '+parts.join(' ')+'\n',changed:result.changed,editCount:result.edits.length};
 }

 const api=Object.freeze({standardize,assess,buildGrammar});
 g.BingliWritingPolicy=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
