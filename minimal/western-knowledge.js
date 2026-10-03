/* Browser-only, offline specialty review. No diagnosis, staging or treatment is
 * inferred from a cancer name; only selected options enter clinical prose. */
(function(g){
  'use strict';
  const S=v=>String(v??'').trim(),A=v=>Array.isArray(v)?v:[],U=v=>[...new Set(v)],end=v=>S(v).replace(/[。；;，,]+$/,'')+'。';
  const aliases={currentSymptoms:['symptoms'],pathology:['pathologyReport'],histology:['pathologyReport'],imaging:['imagingReport'],endoscopy:['imagingReport'],clinicianAssessment:['assessment'],clinicianResponse:['assessment'],responseAssessment:['assessment'],clinicalStage:['stage'],priorTreatment:['history'],currentPlan:['tumorPlan','supportPlan'],currentSupportPlan:['supportPlan'],treatmentIntent:['tumorPlan'],contrastImaging:['imagingReport'],pancreasImaging:['imagingReport'],biliaryImaging:['imagingReport'],pelvicMRI:['imagingReport']};
  const labels={symptoms:'本次症状',history:'治疗经过',stage:'分期记录',exam:'查体',assessment:'医师评估',pathologyReport:'病理',imagingReport:'影像',molecularReport:'分子检测',labRaw:'检验',tumorPlan:'抗肿瘤计划',supportPlan:'诊疗计划',westernDiagnosis:'西医诊断'};
  const missing=/^(?:【[^】]*(?:待补|待填|待查)[^】]*】|\[[^\]]*(?:待补|待填)[^\]]*\]|(?:未提供|未填写|未录入|不详|未知|待补|待查|待核|待检|待回报|未查|未检|暂无|无|空|NA|N\/A)(?:资料|结果|报告|信息)?)[。；;，,\s]*$/i;
  function fact(v){
    if(v===null||v===undefined||typeof v==='boolean')return '';
    if(Array.isArray(v))return v.map(fact).filter(Boolean).join('；');
    if(typeof v==='object')return '';
    const s=S(v).replace(/【[^】]*(?:待补|待填|待查)[^】]*】/g,'').trim();
    if(/^[^。；;\n]{0,35}[:：]\s*(?:未提供|未填写|未录入|未查|未检|未回报|待补|待查|待检|待回报|不详|未知)[。；;\s]*$/.test(s))return '';
    return !s||missing.test(s)?'':s;
  }
  function positive(e){
    if(g.V63Facts?.positive)return S(g.V63Facts.positive(e));
    return S(e.symptoms).split(/[。；;\n]/).filter(s=>!/(?:否认|未见|未诉|已无|不再|未再|无明显|没有|昨日|既往|明日|明天|若|如出现)/.test(s)).join('；');
  }
  function read(e,key,sx){
    return U([key,...A(aliases[key])]).map(k=>[k,k==='symptoms'?fact(sx):fact(e[k])]).filter(([,v])=>v);
  }
  function canonical(v){
    const s=S(v).replace(/[\s（）()]/g,'');
    if(/^(?:原发性)?肝癌|^肝细胞癌/.test(s))return '肝癌';
    if(/^胆道|^胆管癌|^胆囊癌/.test(s))return '胆道肿瘤';
    if(/^结直肠癌|^结肠癌|^直肠癌/.test(s))return '结直肠癌';
    if(/^胰腺癌/.test(s))return '胰腺癌';
    if(/^(?:非小细胞|小细胞)?肺癌$/.test(s))return '肺癌';
    if(/^肾细胞癌$/.test(s))return '肾癌';
    return s;
  }
  function bodyRead(source){
    const access=S(source?.access);
    if(/metadata.?only|仅(?:题录|标题|摘要)|未(?:实际|能)(?:读取|访问)|不可访问|access.?failed|inaccessible/i.test(access))return false;
    return source?.bodyConfirmed===true||/full.?text|body.?excerpts|正文|全文|PDF.*已读/i.test(access);
  }
  /* Older packs express activation in prose. These conservative gates prevent
   * a nonempty general plan from activating every stage-specific discussion. */
  const legacyGates={
    'gastric-intake':/纳差|纳少|食少|进食受限|摄入(?:减少|下降)|呕吐|体重(?:下降|减轻)|狭窄|梗阻/,
    'gastric-marker-review':/复发|进展|转移|不可切除|HER2|PD.L1|MSI|MMR|CLDN18|分子|基因|标志物/i,
    'esophageal-swallowing':/吞咽(?:困难|不畅|障碍)|进食(?:受限|困难|减少)|摄入(?:减少|下降)/,
    'esophageal-local-assessment':/局部(?:进展|晚期)|可切除|不可切除|T[34]|[ⅡⅢII]{2,3}期/i,
    'esophageal-pdl1-context':/PD.L1|免疫治疗|免疫检查点/i,
    'colorectal-postoperative':/术后|切除后|已(?:行|完成).*手术|pT[0-4]|切缘|淋巴结.*(?:枚|个)/i,
    'rectal-response':/新辅助|放化疗后|完全缓解|cCR|非手术管理|观察等待/i,
    'colorectal-molecular':/转移|M1|Ⅳ期|IV期|进展.*分子/i,
    'liver-postlocal':/消融后|介入后|栓塞后|TACE后|TARE后|已行.*(?:消融|介入|栓塞)/i,
    'liver-systemic-safety':/系统治疗|免疫治疗|靶向治疗|贝伐|仑伐|索拉|阿替利|信迪利|卡瑞利/i,
    'pancreatic-jaundice-intake':/黄疸|胆道.*扩张|胆管.*扩张|疼痛|腹痛|进食受限|摄入减少|引流/,
    'pancreatic-molecular-context':/不可切除|转移|BRCA|KRAS|MSI|NTRK|分子|基因/i,
    'biliary-obstruction':/黄疸|瘙痒|胆道.*扩张|胆管.*扩张|引流/,
    'biliary-molecular-context':/进展|转移|不可切除|HER2|FGFR2|IDH1|MSI|分子|基因/i
  };
  function activated(point,e,sx,evidence){
    const present=v=>fact(v).replace(/(?:否认|未见|未提示|未发现|不支持|已排除|未诊断)[^。；;，,\n]*/g,'');
    const observed=[sx,...Object.entries(e).filter(([k])=>k!=='symptoms'&&k!=='sourceRaw'&&k!=='clinicalSelections'&&k!=='cancer').map(([,v])=>present(v))].filter(Boolean).join('；');
    const terms=A(point.activationTerms),exclude=A(point.excludeTerms);
    if(terms.length&&!terms.some(t=>observed.includes(S(t))))return false;
    if(exclude.some(t=>observed.includes(S(t))))return false;
    if(point.id==='rectal-response'&&!/直肠/.test(S(e.cancer)+'；'+S(e.westernDiagnosis)))return false;
    if(point.id==='thyroid-dtc-follow'&&/未分化|髓样/.test(S(e.westernDiagnosis)+'；'+S(e.pathologyReport)))return false;
    const gate=legacyGates[point.id];
    if(gate&&!gate.test(observed))return false;
    // Symptom gates use current positive facts plus actual relevant findings.
    if(/^(?:gastric-intake|esophageal-swallowing|pancreatic-jaundice-intake|biliary-obstruction)$/.test(point.id)){
      const findings=evidence.filter(([k])=>!['history','supportPlan','tumorPlan'].includes(k)).map(([,v])=>v).join('；');
      if(gate&&!gate.test(findings))return false;
    }
    return true;
  }
  function clinicalText(value){
    return S(value).split(/(?<=[。!?！？])/).filter(s=>!/(?:可读原文|已有专项更新|可核实篇名|未采纳原文|不是将现代)/.test(s)).join('').trim();
  }
  function review(p={},e={}){
    const result={cards:[],warnings:[],sources:[]},pack=typeof WESTERN_UPDATES!=='undefined'?WESTERN_UPDATES:g.WESTERN_UPDATES,entries=A(pack?.entries);
    const cancer=canonical(e.cancer||p.cancer);if(!cancer||!entries.length)return result;
    if(e.cancer&&p.cancer&&canonical(e.cancer)!==canonical(p.cancer)){result.warnings.push('患者与本次癌种不一致，专病选项未生成。');return result;}
    const matched=entries.filter(x=>canonical(x.cancer)===cancer);if(!matched.length)return result;
    const sourceMap=new Map();for(const entry of entries)for(const source of A(entry.sources))if(source?.id)sourceMap.set(source.id,source);
    const sx=positive(e),options=[],checks=[],sourceIds=[],evidenceNames=[];
    for(const entry of matched)for(const point of A(entry.decisionPoints)){
      const evidence=A(point.evidenceKeys).flatMap(key=>read(e,key,sx));
      if(!evidence.length||!activated(point,e,sx,evidence))continue;
      const ids=A(point.sourceIds);if(!ids.length||!ids.every(id=>bodyRead(sourceMap.get(id)))){
        result.warnings.push('专病审核项“'+S(point.label)+'”缺少已核正文来源，未加入可选判断。');continue;
      }
      const prose=clinicalText(point.consideration);if(!prose)continue;
      if(options.some(o=>o.id===point.id))continue;
      options.push({id:point.id,label:S(point.label),text:end(prose),sourceIds:ids.slice()});
      sourceIds.push(...ids);evidenceNames.push(...evidence.map(([k])=>labels[k]||k));
      A(point.nextChecks).forEach((v,i)=>{const text=S(v);if(text&&!checks.some(c=>c.text===text))checks.push({id:point.id+'-check-'+(i+1),label:text,text});});
    }
    if(options.length)result.cards.push({id:'western-specialty',title:cancer+'专病评估',defaultText:'',options,checks,contextNote:'依据已录'+U(evidenceNames).join('、')+'提供评估方向。按本例选择判断；未选择时不加入正文。',allowSecondary:true});
    result.sources=U(sourceIds).map(id=>({...sourceMap.get(id)}));result.warnings=U(result.warnings);return result;
  }
  g.V65Western=Object.freeze({review,version:'1.0'});
  if(typeof module==='object'&&module.exports){module.exports=g.V65Western;
    if(require.main===module){
      const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
      const dir=path.resolve(__dirname,'../knowledge/western-updates');
      g.WESTERN_UPDATES={entries:fs.readdirSync(dir).filter(f=>f.endsWith('.json')).flatMap(f=>{const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));return d.entries||d.cancers||[];})};
      const decisions=require('../tests/decision-rules.js');
      assert.equal(review({cancer:'前列腺癌'},{}).cards.length,0);
      assert.equal(review({cancer:'前列腺癌',history:'去势治疗'},{}).cards.length,0);
      assert.equal(review({cancer:'前列腺癌'},{stage:'【分期待补】',molecularReport:'未提供'}).cards.length,0);
      assert.equal(review({cancer:'胃癌'},{cancer:'肺癌',imagingReport:'胸部病灶'}).cards.length,0);
      assert.equal(review({cancer:'肺癌'},{molecularReport:'EGFR：待查'}).cards.length,0);
      const thyroid=review({cancer:'甲状腺癌'},{pathologyReport:'合成：甲状腺未分化癌'});
      assert(!thyroid.cards.flatMap(c=>c.options).some(o=>o.id==='thyroid-dtc-follow'));
      const breast=review({cancer:'乳腺癌'},{imagingReport:'合成：未见转移。'});
      assert(!breast.cards.flatMap(c=>c.options).some(o=>o.id==='breast-response'));
      const a=review({cancer:'前列腺癌'},{history:'合成：既往去势治疗，现复评',labRaw:'合成：PSA连续两次下降'});
      assert.equal(a.cards.length,1);assert(a.sources.length>0);assert.equal(a.cards[0].defaultText,'');
      const empty=decisions.resolve(a.cards,{});assert.equal(empty.textById['western-specialty'],'');
      const c=a.cards[0],chosen=decisions.resolve(a.cards,JSON.stringify({'western-specialty':{primary:c.options[0].id,checks:[c.checks[0].id]}}));
      assert(chosen.textById[c.id].includes(c.options[0].text));assert(chosen.textById[c.id].includes('拟完善'));assert(!/https?:\/\/|2026已有|资料不足|不能认定/.test(chosen.textById[c.id]));
      const saved=g.WESTERN_UPDATES;g.WESTERN_UPDATES={entries:[{cancer:'测试癌',sources:[{id:'metadata',access:'metadata-only；仅题录'}],decisionPoints:[{id:'unsafe',label:'不可用',evidenceKeys:['assessment'],consideration:'测试判断',sourceIds:['metadata'],nextChecks:[]}]}]};
      assert.equal(review({cancer:'测试癌'},{assessment:'合成：已录评估'}).cards.length,0);g.WESTERN_UPDATES=saved;
      console.log('western specialty smoke: passed (synthetic rule checks, not clinical qualification)');
    }
  }
})(typeof globalThis!=='undefined'?globalThis:this);
