/* Source-bound diagnostic analysis. Physician choices and note layout belong to
 * the caller. A corpus mechanism is an interpretation, not an observed sign. */
(function (g) {
  'use strict';
  const S=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'',
    A=v=>Array.isArray(v)?v:[], U=a=>[...new Set(a.filter(Boolean))],
    end=v=>{const s=S(v);return s?(/[。！？!?]$/.test(s)?s:s.replace(/[；;，,]+$/,'')+'。'):'';},
    join=a=>a.filter(Boolean).join('\n\n'), key=v=>S(v).replace(/\s+/g,'').replace(/证$/,''),
    confirmed=v=>['confirmed','verified','已核实','已确认','医师确认','confirmed_by_physician',true].includes(v);
  const DIRECTIONS={
    '肺癌':['肺','病理类型、胸内及远处病变范围、体能与心肺储备','小细胞与非小细胞等组织学类型，原发肺病变与继发受累的来源对应'],
    '胃癌':['胃，与脾之运化及肝之疏泄相关','原发病灶、具体淋巴结站位、腹膜及远处病变，可切除性与营养和器官功能','胃原发病变的组织学性质，以及相关病灶与原发病变的来源对应'],
    '结肠癌与直肠癌':['大肠，与脾胃纳运及气血相关','原发部位、局部及远处病变，直肠病变的盆腔范围与胃肠通畅','结肠与直肠原发部位、组织学性质及其他部位病灶的来源对应'],
    '食管癌':['食道及脾胃','病变部位、组织学类型、邻近气道关系与病变范围，吞咽及进食通路','鳞癌与腺癌等组织学类型，吞咽不适与局部病变的对应'],
    '原发性肝癌':['肝，与脾胃及水湿气血相关','规范病理或影像依据、病灶数目和分布、血管及肝外受累，肝功能储备','原发性肝病变的具体类型与其他来源肝病灶，结合规范影像或病理依据核对'],
    '胰腺癌':['脾胃及相关肝胆气机','诊断依据、病灶与重要血管关系及远处病变，胆道通畅与治疗耐受','胰腺原发病变的性质与来源，结合取材及影像对应核对'],
    '胆道恶性肿瘤':['肝胆，与脾胃运化相联系','胆囊或肝内外胆管的具体部位、病变范围，胆道通畅、胆红素与肝功能','胆囊及肝内外胆管的原发部位，肿瘤相关与其他胆道病变的依据对应'],
    '乳腺癌':['乳络及相应脏腑气血','原发及其他部位病灶，ER、PR、HER2等已录信息，既往治疗与器官耐受','复发或其他部位病灶的来源与受体状态，结合取材及既往病理核对'],
    '甲状腺癌':['颈前及相关气血津液','具体病理类型、颈部侵犯及淋巴结和远处病变，既往手术与相应指标','分化型、髓样或未分化等组织学类型及其相应随访依据'],
    '鼻咽癌':['鼻咽及相关肺胃津液气血','病理、鼻咽及颈部影像、远处评估，既往放疗与当前局部情况','局部病灶变化与治疗后改变，结合放疗时点及同部位影像核对'],
    '肾癌':['肾及相应气血','组织亚型、局部及远处病变，肾功能、体能和既往治疗耐受','组织亚型与病灶来源，结合取材及影像对应核对'],
    '卵巢癌':['盆腹腔及相关肝脾肾、冲任气血','病理类型、手术残余病灶、腹膜与远处病变，既往治疗及实际间隔','原发卵巢病变的组织学类型与其他来源盆腹腔病灶'],
    '宫颈癌':['胞宫及相关气血','病理、盆腔侵犯、淋巴结及远处评估，既往局部治疗与器官功能','宫颈原发病变的性质与盆腔病灶的来源对应'],
    '子宫内膜癌':['胞宫及相关气血','组织学类型、分级、肌层及宫外受累，适用的已录分子分型与既往治疗','子宫内膜原发病变的类型与宫外病灶来源，结合实际病理核对'],
    '前列腺癌':['下焦及相关肾、膀胱气化','病理分级、PSA趋势、病变分布与既往治疗；适用时核对睾酮及进展证据','当前疾病状态与既往治疗背景，结合连续指标和结构性病变核对'],
    '膀胱癌':['膀胱及相关肾气化','取材肌层是否充分、病理级别与肌层浸润，既往局部治疗和肾功能','肌层浸润与非肌层浸润的病理依据，结合实际取材范围核对']
  };
  function profiles(){try{return typeof TCM_PROFILES!=='undefined'?A(TCM_PROFILES):A(g.TCM_PROFILES);}catch(_){return [];}}
  function diseases(){try{return typeof TCM_DISEASES!=='undefined'?A(TCM_DISEASES):A(g.TCM_DISEASES);}catch(_){return [];}}
  function positive(value){
    if(g.V63Facts?.positive)return S(g.V63Facts.positive({symptoms:S(value)}));
    // Conservative fallback when the original clinical engine has not loaded.
    let negative=false,history=false,planned=false;const out=[];
    S(value).split(/([。；;\n，,、])/).forEach(part=>{
      if(/^[。；;\n]$/.test(part)){negative=history=planned=false;return;}if(!S(part)||/^[，,、]$/.test(part))return;
      let s=S(part);if(/^(?:今日|今天|本次|目前|现在)/.test(s))negative=history=planned=false;
      s=s.replace(/^(?:患者|本次|目前|今日|自诉|现诉|查见|主诉)[：:\s]*/,'');
      if(/^(?:既往|曾|以前|此前|昨日|昨天|去年)/.test(s))history=true;
      if(/^(?:如|若|拟|计划|建议|明日|明天|后日|次日)/.test(s))planned=true;
      if(/^(?:但|仍有|伴有|有)/.test(s))negative=false;
      if(/^(?:否认|无|不伴|不再|未再|已无|现无|未见|未诉)/.test(s))negative=true;
      if(!negative&&!history&&!planned&&!/待查|待核|不详|未查|未评估|可能|疑似|考虑|是否|已消失/.test(s))out.push(s);
    });return out.join('；');
  }
  function sign(field,value){const prefix={tongue:'舌',coat:'苔',pulse:'脉'}[field],s=positive(value);return s?prefix+s.replace(field==='tongue'?/^舌(?:质|象|体)?/:field==='coat'?/^(?:舌苔|苔)|苔$/g:/^脉(?:象)?/,''):'';}
  function coreMechanism(value){
    const stop=/故(?:可见|可有|可伴)?|则|可见|可伴|可有|可使|可致|见(?=咳|干咳|乏力|气短|干燥)|须|需|应据|是否|不能|不宜/;
    return S(value).split(/[。；;]/).filter(s=>!/^\s*(?:本证)?病位|^\s*中医病机.*涉及/.test(s)).map(s=>s.split(/[，,]/).filter(c=>!/^\s*(?:舌|苔|脉)|可作.*佐证/.test(c)).map(c=>c.split(stop)[0].trim()).filter(c=>c&&!/^(?:本证重在|现有症状|具体偏|结合症状|固定头痛|痰与瘀应)/.test(c)).join('，')).filter(Boolean).slice(0,3).join('；');
  }
  function cancerOf(p,e,warnings){
    if(g.V5Clinical?.resolveCancer){const r=g.V5Clinical.resolveCancer(p,e);warnings.push(...A(r.warnings));return S(r.cancer);}
    const cs=U([p.cancer,e.cancer,e.tcmDisease,p.tcmDisease].map(S).filter(c=>DIRECTIONS[c]));
    if(cs.length>1)warnings.push('病种字段冲突，请核对原发病种及是否存在多原发肿瘤');return cs.length===1?cs[0]:'';
  }
  function symptomCategory(cancer,text){
    if(cancer==='胃癌')return U([/胃脘[^；，]*[痛疼]|脘痛|胃痛/.test(text)?'胃脘痛':'',/胃脘胀|脘痞|痞满/.test(text)?'痞满':'',/反胃|食入.*反出|食入即吐/.test(text)?'反胃':'']);
    if(cancer==='肺癌')return U([/咳嗽|干咳/.test(text)?'咳嗽':'',/喘|呼吸困难/.test(text)?'喘证':'']);
    if(cancer==='食管癌')return /吞咽困难|食不能下|吞咽梗阻/.test(text)?['噎膈']:[];
    if(['原发性肝癌','胰腺癌','胆道恶性肿瘤'].includes(cancer))return /黄疸|身目黄染/.test(text)?['黄疸']:[];
    if(['肾癌','前列腺癌','膀胱癌'].includes(cancer))return U([/尿潴留|排尿困难|小便难解/.test(text)?'癃闭':'',/血尿|尿血/.test(text)?'溺血':'']);
    return [];
  }
  function build(p={},e={},context={}){
    const warnings=[],cancer=cancerOf(p,e,warnings),direction=DIRECTIONS[cancer],rules=context.skillRules||{},tcmRules=rules.tcm||{},
      sx=Object.prototype.hasOwnProperty.call(context,'positiveText')?S(context.positiveText):positive(e.symptoms),
      evidence=positive(S(e.tcmEvidence).replace(/^(?:本次)?(?:辨证依据|四诊依据|四诊所见)\s*[:：]\s*/,'')),four=['tongue','coat','pulse'].map(k=>sign(k,e[k])).filter(Boolean),
      actual=U([sx,evidence,...four].flatMap(v=>v.split(/[；;，,。]/).map(S))),actualText=actual.join('；'),western=[],groups={},disease=S(e.tcmDisease)||S(p.tcmDisease),syndrome=S(e.syndrome),
      profile=profiles().find(x=>x.cancer===cancer&&key(x.syndrome)===key(syndrome)),diseaseEntry=diseases().find(x=>x.cancer===cancer);
    const diagnosis=S(e.westernDiagnosis)||S(p.westernDiagnosis)||cancer;
    western.push(diagnosis?end('本案西医诊断为：'+diagnosis):'【西医主要诊断待医师填写】。');
    const bases=U([S(p.diagnosisBasis),S(e.diagnosisBasis)]);if(bases.length)western.push(end('诊断依据：'+bases.join('；')));
    const pathology=U([S(p.pathology),S(e.pathologyReport)]);if(pathology.length)western.push(end('病理依据：'+pathology.join('；')));
    if(S(e.imagingReport))western.push(end('影像依据：'+S(e.imagingReport)));
    if(!bases.length&&!pathology.length&&!S(e.imagingReport)){warnings.push('西医主要诊断的具体依据及日期待填写');}
    if(S(p.history))western.push(end('既往及肿瘤诊疗经过：'+S(p.history)));
    if(S(e.molecularReport))western.push(end('分子检测：'+S(e.molecularReport)));
    const stage=S(e.stage)||S(p.stage);if(stage)western.push(end('临床分期：'+stage));
    if(S(e.assessment))western.push(end('本次评估：'+S(e.assessment)));
    if(S(e.westernDifferential)||S(e.differential))western.push(end('西医鉴别诊断：'+(S(e.westernDifferential)||S(e.differential))));
    else if(direction)warnings.push('专病评估关注：'+direction[1]+'；鉴别关注：'+direction[2]);
    if(disease)groups.disease=end('中医辨病：'+disease);
    else {groups.disease='【中医病名待医师填写】。';warnings.push('中医病名尚未填写');}
    const categories=symptomCategory(cancer,sx),allowed=categories.filter(x=>!diseaseEntry||S(diseaseEntry.historicalCategory).includes(x));
    if(allowed.length)groups.disease=(groups.disease||'')+end('结合本次'+sx+'，可从'+allowed.join('、')+'的病候辨察');
    const site=profile?S(profile.mechanism).split(/[；;。]/).find(x=>/病位|病机.*涉及/.test(x)):direction?.[0];
    if(site)groups.disease=(groups.disease||'')+end(/病位|病机.*涉及/.test(site)?site:'病位及脏腑联系：'+site);
    if(actual.length)groups.evidence=end('本次辨证依据：'+actual.join('；'));
    else {groups.evidence='【本次辨证依据待补：主要症状、舌质、舌苔及脉象】。';warnings.push('本次四诊依据待填写');}
    let candidates=[];
    if(g.V5Clinical?.suggestSyndromes&&cancer)candidates=A(g.V5Clinical.suggestSyndromes({...e,symptoms:sx,tcmEvidence:evidence,cancer,limit:57}));
    const support=candidates.find(x=>key(x.syndrome)===key(syndrome)),supported=Boolean(support?.support?.length),isConfirmed=confirmed(e.syndromeStatus);
    if(syndrome){groups.syndrome=end((isConfirmed?'辨证为':'辨证考虑')+syndrome);if(!isConfirmed)warnings.push('所录证型尚待医师确认');}
    else {
      const names=U(candidates.map(x=>x.syndrome)).slice(0,2);groups.syndrome=names.length?end('依据本次四诊，辨证可从'+names.join('、')+'等证候考虑'):'【本次证型待医师确定】。';warnings.push('本次证型尚未确认');
    }
    const interpretation=[];
    if(profile&&syndrome){
      const core=coreMechanism(profile.mechanism);if(core&&supported)interpretation.push(end((isConfirmed?'本证病机为':'结合本次四诊，病机考虑为')+core));
      if(!supported)warnings.push('所录证型与本次四诊的支持关系待医师核对');
    }else if(syndrome)warnings.push('本病种与所录证型尚未匹配，请填写具体病机及鉴别意见');
    for(const [dimension,t] of Object.entries(tcmRules.mechanismTemplates||{})){
      if(!t||!S(t.mechanism)||!isConfirmed||!A(t.syndromeTerms).some(term=>key(syndrome).includes(key(term))))continue;
      // Match only observed evidence. Neither the syndrome name nor a lab value
      // supplies an absent TCM sign; pale-red is not a pale tongue.
      const source=actualText.replace(/舌淡红/g,''),matches=A(t.requiredFacts).map(S).filter(term=>term&&source.includes(term));
      if(!matches.length||t.matchMode==='all'&&matches.length<A(t.requiredFacts).length){warnings.push(dimension+'部分可重点核对：'+A(t.reviewItems).map(S).filter(Boolean).join('、'));continue;}
      const matchedFacts=actual.filter(fact=>matches.some(term=>fact.replace(/舌淡红/g,'').includes(term)));
      interpretation.push(end(U(matchedFacts).join('、')+'与'+dimension+'证候相符，'+S(t.mechanism)));
    }
    groups.mechanism=join(interpretation);
    if(S(e.tcmAssessment))groups.mechanism=join([groups.mechanism,end('医师中医分析：'+S(e.tcmAssessment))]);
    if(S(e.tcmPlan))groups.treatmentPrinciple=end('中医治疗：'+S(e.tcmPlan));
    else if(profile&&supported&&isConfirmed&&S(profile.treatment))groups.treatmentPrinciple=end('治宜'+S(profile.treatment));
    if(S(e.prescriptionAnalysis))groups.formulaRationale=end('方药分析：'+S(e.prescriptionAnalysis));
    if(e.includeClassics===true&&profile&&supported&&isConfirmed&&S(profile.quote?.text)){
      const q=profile.quote;groups.classics='《'+S(q.book)+(S(q.chapter)?'·'+S(q.chapter):'')+'》云：“'+S(q.text).replace(/[。；;]+$/,'')+'。”';
    }
    let differential=S(e.tcmDifferential);
    if(!differential&&profile&&S(profile.tcmDifferential))differential='证候鉴别要点：'+S(profile.tcmDifferential).replace(/本证/g,'该证候');
    if(!differential&&!syndrome&&candidates.length){const c=candidates[0];differential='证候鉴别需核对：'+S(c.evidenceHint).split(/不能|不宜|不得|仅凭|此论|此句|此言|须另/)[0].trim();}
    if(!differential&&syndrome)differential='【证候鉴别待补：相近证候及本次区分依据】';
    const ordered=U(['disease',...A(tcmRules.workflow).map(x=>S(x.id)),...['evidence','syndrome','mechanism','treatmentPrinciple','formulaRationale','classics']]);
    // Source skill fields drive checks as well as the prose order.
    const evidenceFields=A(tcmRules.evidenceFields).length?tcmRules.evidenceFields:[{id:'tongue',label:'舌质'},{id:'coat',label:'舌苔'},{id:'pulse',label:'脉象'}];
    for(const field of evidenceFields){if(['tongue','coat','pulse'].includes(field.id)&&!sign(field.id,e[field.id]))warnings.push('本次'+(S(field.label)||field.id)+'待补充');}
    if(g.V5Clinical?.tcmAnalysis){try{const original=g.V5Clinical.tcmAnalysis(p,{...e,symptoms:sx,tcmEvidence:evidence,includeClassics:false,includeDiseaseClassics:false},{discussionOnly:true});warnings.push(...A(original.warnings));}catch(_){warnings.push('原有中医核对函数未执行，请核对本次辨证资料');}}
    const follow=[];if(S(e.followPlan))follow.push(end(S(e.followPlan)));if(S(e.treatment?.monitoring))follow.push(end('治疗观察及复查：'+S(e.treatment.monitoring)));
    const focus={fatigue:'体力及活动耐量',intake:'实际摄入量及体重变化',abdomen:'腹部症状及排便排气',respiratory:'呼吸症状及氧合',fever:'体温及血象变化',bleeding:'出血部位、量及血红蛋白趋势',constipation:'排便性状及腹部症状',urinary:'尿量及排尿情况',anemia:'血红蛋白趋势',sodium:'血钠及容量状态',magnesium:'血镁及相关电解质',potassium:'血钾及心电情况',inflammation:'体温、症状及炎症指标趋势',liver:'肝功能趋势及实际用药'};
    const needs=U(A(context.decisionCards).map(c=>focus[c.id]));if(needs.length)follow.push(end('结合本次问题，复评重点为'+needs.join('、')));
    if(!S(e.followPlan)&&!S(e.treatment?.monitoring))warnings.push('具体复评项目及时间待医师填写');
    if(/查房|attending|chief|主任|主治/i.test(S(e.recordType)))for(const check of A(rules.dailyRounds?.reviewChecks)){
      // Apply the adapted round checks only when the related event exists;
      // absence of a consultation or overnight event is not an invented problem.
      if(check.id==='overnightSource'&&/无|平稳/.test(S(e.overnightEvents))&&!S(e.overnightSource))warnings.push('夜间无特殊事件的表述需核对实际记录来源');
      if(check.id==='trajectory'&&/好转|稳定|加重|进展/.test(sx)&&!S(e.assessment)&&!S(e.priorResults))warnings.push('病情趋势表述请对照前次资料或本次医师判断');
      if(check.id==='activeProblemPlan'&&needs.length&&!S(e.supportPlan)&&!S(e.tumorPlan)&&!S(e.tcmPlan))warnings.push('本次实际问题的处理计划待医师填写');
      if(check.id==='changeReason'&&S(e.treatmentChanges)&&!S(e.changeReasons)&&!S(e.treatment?.basis))warnings.push('已录治疗调整的具体理由待填写');
      if(check.id==='pendingResult'&&S(e.pendingResults)&&!S(e.followPlan))warnings.push('已录待回结果的复评安排待填写');
    }
    return {westernText:join(western),tcmText:ordered.map(id=>groups[id]).filter(Boolean).join(''),tcmDifferential:end(differential),followText:join(follow),warnings:U(warnings)};
  }
  g.V64Analysis=Object.freeze({build,version:'1.0'});
  if(typeof module==='object'&&module.exports){
    module.exports=g.V64Analysis;
    // Runs the real legacy clinical engine with synthetic data; no browser,
    // patient storage, HTML mutation or clinical qualification is implied.
    if(require.main===module){
      const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'123-v6.3.html'),'utf8');
      const constants=['TCM_PROFILES','TCM_DISEASES'].map(n=>html.match(new RegExp('const '+n+'=(\\[.*?\\]);'))?.[0]).join('\n');
      const first=html.lastIndexOf('(function',html.indexOf('  function analyzeProblems')),last=html.indexOf('})(globalThis);',first)+'})(globalThis);'.length,ctx=vm.createContext({console});
      vm.runInContext(constants+html.slice(first,last),ctx);vm.runInContext(fs.readFileSync(__filename,'utf8'),ctx);
      const rulePath=path.join(root,'knowledge/skill-adaptations/rules.json'),skillRules=fs.existsSync(rulePath)?JSON.parse(fs.readFileSync(rulePath,'utf8')):{};
      const p={cancer:'胃癌',westernDiagnosis:'胃腺癌',tcmDisease:'胃脘痛',diagnosisBasis:'合成：2026-09-20胃窦取材病理示腺癌'},e={date:'2026-10-04',recordType:'主治中医师查房记录',symptoms:'今日乏力、纳差、胃脘隐痛。',tongue:'紫暗',coat:'薄白',pulse:'弦涩',syndrome:'气虚血瘀证',syndromeStatus:'confirmed',includeClassics:true,imagingReport:'合成：胃窦壁增厚，部分腹腔淋巴结增大。',followPlan:'合成：明日复评进食及体力'},context={positiveText:'乏力；纳差；胃脘隐痛',decisionCards:[{id:'fatigue'},{id:'intake'}],skillRules};
      const a=ctx.V64Analysis.build(p,e,context),body=[a.westernText,a.tcmText,a.tcmDifferential,a.followText].join('\n');
      assert(a.westernText.includes('取材病理示腺癌')&&a.warnings.some(w=>w.includes('具体淋巴结站位')));assert(!/IV期|M1|Ⅳ期/.test(a.westernText));
      assert(a.tcmText.includes('舌紫暗')&&a.tcmText.includes('脉弦涩')&&a.tcmText.includes('胃络瘀阻'));assert(a.tcmText.includes('益气健脾')&&a.tcmText.includes('《金匮要略'));assert(a.tcmDifferential.includes('单纯脾胃气虚'));
      assert(!/饮食不节|化疗后|已经给予|资料不足|不能确定|不能认定|未采纳|瘀点与脉涩可作/.test(body));
      if(Object.keys(skillRules).length)assert(a.tcmText.includes('血行失常，瘀血内阻')&&a.tcmText.includes('气虚则机能减退'));
      const absent=ctx.V64Analysis.build(p,{...e,symptoms:'今日已无乏力，不再纳差。',tongue:'',coat:'',pulse:''},{...context,positiveText:'',decisionCards:[]});assert(!absent.tcmText.includes('《金匮要略')&&!absent.tcmText.includes('治法可参考')&&!absent.tcmText.includes('本次辨证依据：乏力'));
      const conflict=ctx.V64Analysis.build(p,{...e,cancer:'肺癌'},context);assert(conflict.warnings.some(w=>w.includes('冲突'))&&!conflict.tcmText.includes('《金匮要略'));
      const uncertain=ctx.V64Analysis.build(p,{...e,syndromeStatus:'unconfirmed'},context);assert(!uncertain.tcmText.includes('血行失常，瘀血内阻')&&!uncertain.tcmText.includes('《金匮要略'));
      console.log(JSON.stringify({synthetic:true,purpose:'纯生成函数样本检查；不代表病案临床合格',passed:true,skillMechanismsApplied:Boolean(Object.keys(skillRules).length),sample:a},null,2));
    }
  }
})(globalThis);
