/* Pure decision cards. The caller resolves symptom time/negation; dated lab
 * items must match the encounter day. Undated results are described as recorded. */
(function (g) {
  'use strict';
  const S=v=>String(v??'').trim(), end=v=>S(v).replace(/[。；;，,]+$/,'')+'。';
  const tuple=(id,label,text)=>({id,label,text});
  const opts=a=>a.map(x=>tuple(...x));
  const checks=a=>a.map(([id,label])=>tuple(id,label,label));
  const aliases={hb:/^(?:hb|hgb|hemoglobin|血红蛋白)$/,na:/^(?:na|钠|血钠)$/,mg:/^(?:mg|镁|血镁)$/,k:/^(?:k|钾|血钾)$/,crp:/^(?:crp|hscrp|c反应蛋白|超敏c反应蛋白)$/,saa:/^(?:saa|血清淀粉样蛋白a)$/,ast:/^(?:ast|谷草转氨酶|天门冬氨酸氨基转移酶)$/,alt:/^(?:alt|谷丙转氨酶|丙氨酸氨基转移酶)$/};
  const units={hb:['g/l','g/dl'],na:['mmol/l','meq/l'],mg:['mmol/l','mg/dl'],k:['mmol/l','meq/l'],crp:['mg/l','mg/dl'],saa:['mg/l'],ast:['u/l','iu/l','ukat/l'],alt:['u/l','iu/l','ukat/l']};
  const norm=v=>S(v).toLowerCase().replace(/[\s-]/g,'').replace(/／/g,'/').replace(/[μµ]/g,'u');
  function datePart(value){
    const m=S(value).match(/^\d{4}-\d{2}-\d{2}(?=$|[T\s])/);if(!m)return '';
    const d=new Date(m[0]+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===m[0]?m[0]:'';
  }
  function labs(items,recordDate){
    const buckets={};
    for(const item of Array.isArray(items)?items:[]){
      if(!item||typeof item!=='object')continue;
      if(S(item.date)&&(!datePart(item.date)||datePart(item.date)!==datePart(recordDate)))continue;
      const key=Object.keys(aliases).find(k=>aliases[k].test(norm(item.key))||aliases[k].test(norm(item.label)));
      if(key)(buckets[key]??=[]).push(item);
    }
    const result={};
    for(const [key,values] of Object.entries(buckets)){
      if(values.length!==1)continue;
      const i=values[0],flag=S(i.flag).toUpperCase(),value=S(i.value??i.number),unit=norm(i.normalizedUnit||i.unit);
      if(!['L','H'].includes(flag)||!units[key].includes(unit)||!/^([<>≤≥]\s*)?\d+(?:\.\d+)?$/.test(value))continue;
      if(i.invalid||i.ambiguous||i.conflict||i.interpretable===false||i.unitValid===false||i.unitRecognized===false)continue;
      result[key]={...i,flag};
    }
    return result;
  }
  function build(p={},e={},context={}){
    const text=S(context.positiveText),l=labs(context.labItems,e.date),cards=[];
    const low=k=>l[k]?.flag==='L',high=k=>l[k]?.flag==='H';
    const labPrefix=k=>datePart(l[k]?.date)?'本次':'血检示';
    const hbMeaning='血红蛋白降低';
    const intake=/纳差|纳少|纳呆|食少|食欲不振|食量下降|纳寐欠佳|进食减少|食纳不佳/.test(text);
    function add(id,title,defaultText,options,items,note){cards.push({id,title,defaultText,options:opts(options),checks:checks(items),contextNote:note||'请按本次资料选择判断和拟完善项目。'});}
    if(/乏力|倦怠|疲乏/.test(text)){
      const reasons=[low('hb')?'贫血':'',intake?'摄入减少':''].filter(Boolean);
      const d=reasons.length?'乏力考虑'+reasons.join('及')+'可能参与，可结合'+(low('hb')?'血红蛋白趋势':'活动耐量')+(intake?'及实际摄入量':'')+'进一步判断。':'本次乏力，需结合活动耐量及近期病情变化评估原因。';
      const o=[['disease','病情相关','乏力考虑与本次病情相关。'],['treatment','治疗相关可能','乏力考虑治疗相关可能，需结合实际治疗时序判断。'],['intake','摄入减少可能','乏力考虑摄入减少可能参与，拟结合实际摄入量评估。'],['dehydration','容量不足／脱水可能','乏力考虑容量不足或脱水可能，拟结合出入量、容量体征及电解质评估。'],['electrolyte','电解质异常可能','乏力考虑电解质异常可能，拟结合相关检验进一步判断。']];
      if(low('hb'))o.unshift(['anemia','贫血相关','乏力主要考虑与贫血有关。']);
      add('fatigue','乏力分析',d,o,[['cbc','血常规及血红蛋白趋势'],['nutrition','实际摄入量及体重变化'],['chemistry','电解质及肝肾功能']]);
    }
    if(intake)add('intake','纳食减少分析','纳食减少，后续重点评估实际摄入量与胃肠耐受。',[
      ['digestive','胃肠症状影响','纳食减少考虑胃肠症状影响可能。'],['treatment','治疗影响可能','纳食减少考虑治疗影响可能，需结合实际用药及治疗时序判断。'],['nutrition','营养风险','纳食减少需进一步评估营养风险。']], [['amount','实际摄入量及体重变化'],['oral','口腔情况及吞咽能力'],['route','胃肠通畅及可用进食通路']]);
    if(/腹胀|腹痛|腹部.*(?:胀|痛)|脘.*(?:胀|痛)/.test(text))add('abdomen','腹部症状分析','本次腹部不适，需结合痛胀特点、腹部体征及排便排气情况判断。',[
      ['tumor','肿瘤相关可能','腹部症状考虑肿瘤相关可能，需与病灶资料对应。'],['functional','胃肠功能影响','腹部症状考虑胃肠功能影响可能。'],['obstruction','通道问题待评估','腹部症状需进一步评估胃肠通道问题。']], [['exam','腹部查体及排便排气情况'],['image','腹部影像'],['trend','疼痛变化及进食关系']]);
    if(/气短|气喘|气急|呼吸困难|胸闷|咳嗽|咳痰/.test(text))add('respiratory','呼吸症状分析','本次呼吸相关症状，需结合起病情况与氧合评估原因。',[
      ['infection','感染相关可能','呼吸症状考虑感染相关可能。'],['tumor','肿瘤相关可能','呼吸症状考虑肿瘤相关可能，需与胸部资料对应。'],['treatment','治疗相关可能','呼吸症状考虑治疗相关可能，需核对实际治疗背景。'],['cardiac','心肺因素待评估','呼吸症状需进一步评估心肺相关因素。']], [['oxygen','血氧及呼吸频率'],['chest','胸部影像'],['infection','血常规及适用病原学检查']]);
    if(/发热|寒战/.test(text))add('fever','发热或寒战分析','本次发热或寒战，需结合体温变化与感染线索评估。',[
      ['infection','感染相关可能','发热或寒战考虑感染相关可能。'],['reaction','治疗反应可能','发热或寒战考虑治疗反应可能，需结合实际治疗时序判断。'],['tumor','肿瘤相关可能','发热考虑肿瘤相关可能，仍需结合感染评估。']], [['cbc','血常规及中性粒细胞'],['culture','适用病原学检查及培养'],['vitals','体温及生命体征趋势']]);
    if(/黑便|便血|呕血|咯血|血尿|阴道(?:流血|出血)/.test(text))add('bleeding','出血表现分析','本次出血相关表现，需结合出血部位、量及变化评估。',[
      ['tumor','病灶出血可能','出血考虑病灶相关可能，需核对来源。'],['mucosa','黏膜损伤可能','出血考虑黏膜损伤可能。'],['medicine','药物相关可能','出血考虑药物影响可能，需核对实际用药。']], [['amount','出血部位、量及变化'],['cbc','血常规及血小板'],['clotting','凝血功能及相关用药']]);
    if(/便秘|大便干结|排便困难|排便难解/.test(text))add('constipation','排便不畅分析','排便不畅，需结合排便间隔、粪便性状及排气情况判断。',[
      ['intake','摄入相关可能','排便不畅考虑摄入及活动因素可能。'],['medicine','药物相关可能','排便不畅考虑药物影响可能，需核对实际用药。'],['obstruction','通道问题待评估','排便不畅需进一步评估通道问题。']], [['history','排便间隔、粪便性状及排气'],['exam','腹部及适用肛诊检查'],['image','必要的腹部影像']]);
    if(/尿潴留|小便难解|排尿困难|少尿/.test(text))add('urinary','排尿或尿量分析','本次排尿或尿量异常，需结合实际尿量及下腹情况评估。',[
      ['outlet','出口梗阻可能','排尿异常考虑出口梗阻可能。'],['retention','尿潴留待评估','排尿异常需进一步评估尿潴留。'],['renal','容量或肾功能因素','尿量异常考虑容量或肾功能因素可能。']], [['volume','实际尿量及出入量'],['residual','残余尿及泌尿系统超声'],['renal','肾功能及电解质']]);
    if(low('hb'))add('anemia','贫血原因讨论',labPrefix('hb')+hbMeaning+'，贫血原因可结合血象趋势及相关检查进一步判断。',[
      ['iron','缺铁可能','贫血考虑缺铁相关可能。'],['inflammation','炎症相关可能','贫血考虑炎症相关可能。'],['treatment','治疗相关可能','贫血考虑治疗影响可能，需核对实际治疗背景。'],['bloodloss','失血可能','贫血考虑失血相关可能，需结合实际出血资料。']], [['trend','血常规及网织红细胞'],['iron','铁蛋白、转铁蛋白饱和度'],['bloodloss','适用的出血来源评估']]);
    if(l.na)add('sodium','血钠异常讨论',labPrefix('na')+'血钠'+(low('na')?'偏低':'偏高')+'，可结合容量状态及后续趋势评估。',[
      ['volume','容量因素','血钠异常考虑容量因素可能。'],['loss','摄入或丢失因素','血钠异常考虑摄入或丢失因素可能。'],['medicine','药物因素','血钠异常考虑药物因素可能，需核对实际用药。']], [['repeat','血钠趋势、血糖及肾功能'],['osm','血及尿渗透压'],['fluid','出入量及容量状态']]);
    if(l.mg)add('magnesium','血镁异常讨论',labPrefix('mg')+'血镁'+(low('mg')?'偏低':'偏高')+'，可结合肾功能及相关电解质评估。',[
      ['intake','摄入或丢失因素','血镁异常考虑摄入或丢失因素可能。'],['renal','肾功能因素','血镁异常考虑肾功能因素可能。'],['medicine','药物因素','血镁异常考虑药物因素可能，需核对实际用药。']], [['repeat','血镁、血钾及血钙'],['renal','肾功能'],['ecg','心电图']]);
    if(l.k)add('potassium','血钾异常讨论',labPrefix('k')+'血钾'+(low('k')?'偏低':'偏高')+'，可结合心电及复查趋势评估。',[
      ['loss','摄入或丢失因素','血钾异常考虑摄入或丢失因素可能。'],['renal','肾功能因素','血钾异常考虑肾功能因素可能。'],['medicine','药物因素','血钾异常考虑药物因素可能，需核对实际用药。']], [['ecg','心电图'],['repeat','血钾、血镁及肾功能'],['sample','标本情况及复查结果']]);
    if(high('crp')||high('saa'))add('inflammation','炎症指标讨论','已录炎症指标升高，可结合体温、症状与后续趋势判断其临床意义。',[
      ['infection','感染相关可能','炎症指标升高考虑感染相关可能。'],['tumor','肿瘤炎症可能','炎症指标升高考虑肿瘤相关炎症可能。'],['reaction','组织损伤或治疗反应','炎症指标升高考虑组织损伤或治疗反应可能。']], [['trend','炎症指标及血常规趋势'],['source','局部感染线索及适用病原学检查']]);
    if(high('ast')||high('alt'))add('liver','肝酶异常讨论','已录肝酶升高，可结合其余肝功能与既往趋势评估。',[
      ['medicine','药物相关可能','肝酶升高考虑药物相关可能，需核对实际用药。'],['hepatic','肝脏病变可能','肝酶升高考虑肝脏病变相关可能。'],['other','非肝来源待评估','肝酶升高需结合相关检查评估非肝来源。']], [['liver','ALT、AST、胆红素、ALP及GGT'],['trend','肝功能基线及实际用药'],['other','适用的肝脏影像或其他来源检查']]);
    const decision=S(e.treatment?.decision),hasPlan=[e.tumorPlan,e.supportPlan,e.tcmPlan].some(v=>S(v)),round=/查房|attending|chief|主任|主治/i.test(S(e.recordType));
    if(decision||hasPlan||round){add('treatment','治疗决定',decision?end(decision):'治疗方案及继续或调整依据待医师填写。',[
      ['continue','拟继续','本次拟继续现有治疗方案，具体安排按医师意见执行。'],['adjust','拟调整','本次拟调整治疗方案，调整内容与依据由医师补充。'],['defer','拟暂缓','本次拟暂缓当前治疗，待相关问题评估后再讨论。'],['review','先复评再决定','本次拟先复评病情、疗效及耐受性，再确定后续治疗安排。']], [['function','血常规及肝肾功能'],['response','既往疗效、末次治疗及残余毒性'],['goals','治疗目标、体能及患者意愿']],'选项表示本次拟定决定，不代表已经实施。');
      cards[cards.length-1].allowSecondary=false;}
    return cards;
  }
  function resolve(cards,raw){
    const warnings=[],selections={},textById={};let input={};
    try{input=typeof raw==='string'?(S(raw)?JSON.parse(raw):{}):(raw??{});}catch(_){warnings.push('判断选择JSON无效，未采用其中选择。');}
    if(!input||typeof input!=='object'||Array.isArray(input)){input={};warnings.push('判断选择应为按卡片ID组织的对象。');}
    const list=Array.isArray(cards)?cards:[],ids=new Set(list.map(c=>c.id));
    for(const id of Object.keys(input))if(!ids.has(id))warnings.push('已忽略非本次问题卡的选择：'+id);
    for(const card of list){
      const rawState=Object.prototype.hasOwnProperty.call(input,card.id)?input[card.id]:{};
      const state=rawState&&typeof rawState==='object'&&!Array.isArray(rawState)?rawState:{};
      if(rawState!==state)warnings.push(card.title+'的选择格式无效，已保留默认讨论。');
      const optionMap=new Map(card.options.map(o=>[o.id,o.text])),checkMap=new Map(card.checks.map(c=>[c.id,c.text]));
      const primary=typeof state.primary==='string'&&optionMap.has(state.primary)?state.primary:'';
      if(state.primary&&!primary)warnings.push(card.title+'的主要判断无效，未采用该选项。');
      function chosen(value,map,field){
        if(value!==undefined&&!Array.isArray(value)){warnings.push(card.title+'的'+field+'应为数组。');return [];}
        const a=Array.isArray(value)?value:[],valid=a.filter(x=>typeof x==='string'&&map.has(x));
        if(valid.length!==a.length)warnings.push(card.title+'的'+field+'包含无效选项，已忽略。');
        return [...new Set(valid)];
      }
      const secondary=card.allowSecondary===false?[]:chosen(state.secondary,optionMap,'兼顾因素').filter(x=>x!==primary);
      if(card.allowSecondary===false&&Array.isArray(state.secondary)&&state.secondary.length)warnings.push(card.title+'不使用兼顾因素，已忽略所存选项。');
      const selectedChecks=chosen(state.checks,checkMap,'拟完善项目');
      const extra=typeof state.extra==='string'?S(state.extra):'';
      if(state.extra!==undefined&&typeof state.extra!=='string')warnings.push(card.title+'的补充内容应为文本。');
      selections[card.id]={primary,secondary,checks:selectedChecks,extra};
      const parts=[primary?optionMap.get(primary):card.defaultText,...secondary.map(x=>optionMap.get(x))];
      if(selectedChecks.length)parts.push('拟完善'+selectedChecks.map(x=>checkMap.get(x)).join('、')+'。');
      if(extra)parts.push(end(extra));
      textById[card.id]=parts.filter(Boolean).join('');
    }
    return {selections,textById,warnings};
  }
  g.V63Decisions=Object.freeze({build,resolve,version:'1.1'});
  if(typeof module==='object'&&module.exports){
    module.exports=g.V63Decisions;
    if(require.main===module){
      const assert=require('node:assert/strict');
      const hb={key:'hb',value:'98',unit:'g/L',flag:'L'};
      const a=build({}, {recordType:'日常病程记录'}, {positiveText:'乏力、纳少',labItems:[hb]});
      assert(a.find(x=>x.id==='fatigue').defaultText.includes('贫血及摄入减少'));
      assert(a.some(x=>x.id==='anemia'));
      assert(!build({}, {}, {positiveText:'',labItems:[{key:'hb',value:'110'}]}).some(x=>x.id==='anemia'));
      assert(!build({}, {}, {positiveText:'',labItems:[hb,hb]}).some(x=>x.id==='anemia'));
      assert.equal(build({}, {}, {positiveText:'',labItems:[]}).length,0);
      assert(build({}, {recordType:'主任中医师查房记录'}, {positiveText:'',labItems:[]}).some(x=>x.id==='treatment'));
      const chosen=resolve(a,JSON.stringify({fatigue:{primary:'anemia',secondary:['intake','anemia'],checks:['cbc'],extra:''},anemia:{primary:'iron',checks:['iron']}}));
      assert(chosen.textById.fatigue.includes('乏力主要考虑与贫血有关。'));
      assert(chosen.textById.anemia.includes('拟完善铁蛋白、转铁蛋白饱和度。'));
      assert.deepEqual(chosen.selections.fatigue.secondary,['intake']);
      assert(resolve(a,'not-json').warnings.length>0);
      const dated={...hb,date:'2026-10-04',classificationBasis:'report-range'},day={date:'2026-10-04T09:00',recordType:'日常病程记录'};
      assert(!build({},day,{positiveText:'乏力',labItems:[{...dated,date:'2026-09-20'}]}).some(c=>c.id==='anemia'));
      const mixed=build({},day,{positiveText:'乏力',labItems:[{...dated,date:'2026-09-20'},dated]});
      assert(mixed.find(c=>c.id==='anemia').defaultText.startsWith('本次血红蛋白降低'));
      const threshold=build({},day,{positiveText:'',labItems:[{...dated,classificationBasis:'clinical-threshold',low:null,high:null}]}).find(c=>c.id==='anemia');
      assert(threshold.defaultText.includes('血红蛋白降低'));assert(!threshold.defaultText.includes('报告范围'));
      assert(build({},day,{positiveText:'',labItems:[hb]}).find(c=>c.id==='anemia').defaultText.startsWith('血检示'));
      const planCards=build({},{...day,supportPlan:'继续原安排；明日复查血常规。'},{positiveText:'',labItems:[]}),t=planCards.find(c=>c.id==='treatment');
      assert.equal(t.allowSecondary,false);assert(!t.defaultText.includes('明日复查'));
      const onlyPrimary=resolve(planCards,{treatment:{primary:'defer',secondary:['continue'],checks:[]}});
      assert.deepEqual(onlyPrimary.selections.treatment.secondary,[]);assert(!onlyPrimary.textById.treatment.includes('拟继续'));
      console.log('decision rules smoke: passed');
    }
  }
})(typeof globalThis!=='undefined'?globalThis:this);
