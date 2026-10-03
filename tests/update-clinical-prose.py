"""Prepare the focused TCM prose revision on an explicitly supplied HTML file.

This script is not run automatically. The caller chooses the target file.
Usage: python3 tests/update-clinical-prose.py /path/to/input.html
       python3 tests/update-clinical-prose.py /path/to/input.html --include-first-tcm

Only tcmAnalysis is replaced by default. --include-first-tcm also reuses it for
the first-note TCM discussion and removes corpus treatment from its plan fallback.
No Western assessment, symptom reasoning, Hb interpretation or first-note layout
is changed. Clinical conclusions remain drafts from entered facts and opinions.
"""
from pathlib import Path
import argparse
import re


TCM_ANALYSIS = r'''  // Concise source-bound TCM prose; corpus symptoms and treatments are not patient facts.
  function tcmAnalysis(p,e,options) {
    p=p||{};e=e||{};options=options||{};
    const match=resolveCancer(p,e),cancer=match.cancer,warnings=[...match.warnings],parts=[],syndrome=S(e.syndrome),profile=matchedProfile(p,e),four=[];
    const compact=v=>S(v).replace(/[\s，,。；;：:]/g,'');
    const evidence=S(e.tcmEvidence).replace(/^(?:本次)?(?:辨证依据|四诊依据|四诊所见)\s*[:：]\s*/,'').replace(/[。；;]+$/,'');
    const mainSymptoms=unique(positiveSegments(recordedSymptoms(e).symptoms)).filter(x=>!compact(evidence).includes(compact(x))&&!/^(?:舌|苔|脉)/.test(x));
    const addFour=(key,prefix)=>{const value=S(e[key]);if(value){const text=typeof signText==='function'?signText(key,value):prefix+value.replace(new RegExp('^'+prefix),'');if(!compact(evidence).includes(compact(text)))four.push(text);}};
    addFour('tongue','舌');addFour('coat','苔');addFour('pulse','脉');
    const disease=S(e.tcmDisease)||S(p.tcmDisease),facts=tcmFacts(e),has=k=>facts.some(x=>x[0]===k);
    const actualEvidence=[...mainSymptoms,evidence,...four].filter(Boolean).join('，');
    if(disease)parts.push(end('中医诊断：'+disease));
    if(actualEvidence)parts.push(end(actualEvidence));
    const support=profile&&syndrome?suggestSyndromes({...e,cancer,limit:57}).find(x=>syndromeKey(x.syndrome)===syndromeKey(syndrome)):null;
    const supported=profile&&confirmed(e.syndromeStatus)&&support?.support.length>0;
    const coreMechanism=supported?S(profile.mechanism).split(/[。；;]/).map(x=>x.split(/[,，]/).filter(c=>!/(?:故|因而|从而|因此|则|可见|常见|表现为|症见|出现|可兼|可伴|可有|可使|可致|须|需|是否|不能|不宜)/.test(c)).join('，')).filter(Boolean).slice(0,2).join('；'):'';
    if(syndrome){
      parts.push(end((confirmed(e.syndromeStatus)?'辨证为':'辨证考虑')+syndrome)+(coreMechanism?end(coreMechanism):''));
      if(!confirmed(e.syndromeStatus))warnings.push('所填证型尚未确认，请医师核对本次辨证意见');
      if(!profile)warnings.push('本病种与所填证型未匹配语料，请核对具体病机；未替换为其他证型');
      else {
        if(!support?.support.length)warnings.push('所填证型与当前四诊的对应依据需核对');
        if(support?.support.length&&S(profile.treatment))warnings.push('语料治法参考：'+S(profile.treatment)+'；不代表本次医师治疗决定');
      }
    }else{
      parts.push('【本次证型待医师确定】。');
      const candidates=cancer?suggestSyndromes({...e,cancer,limit:3}):[];
      if(candidates.length)parts.push(end('辨证可从'+unique(candidates.map(x=>x.syndrome)).join('、')+'等证候考虑'));
      const needs=[];
      if(!S(e.tongue))needs.push('舌质');if(!S(e.coat))needs.push('舌苔');if(!S(e.pulse))needs.push('脉象');
      if(needs.length)parts.push(end('结合'+needs.join('、')+'进一步辨证'));
      warnings.push('本次证型尚未填写，请医师确认');
    }
    if(!syndrome&&!profile){
      if(has('乏力')&&has('纳差'))parts.push('乏力与纳差并见，辨证需着重脾胃纳运与正气虚实。');
      else if(has('口干咽燥')||has('舌少津'))parts.push('辨证需着重津液亏耗及寒热虚实。');
    }
    if(e.includeClassics===true&&supported&&profile?.quote?.text){
      const q=profile.quote;parts.push('《'+q.book+(q.chapter?'·'+q.chapter:'')+'》云：“'+S(q.text).replace(/[。；;]$/,'')+'。”');
      warnings.push('经典引文出处请核对：'+[q.book,q.chapter,q.url].filter(Boolean).join(' · '));
    }
    if(e.includeDiseaseClassics===true){
      const d=diseases().find(x=>x.cancer===cancer),q=d?.quotes?.[0];
      const clinicalText=positiveSegments(recordedSymptoms(e).symptoms).join('；');
      const applicable=supported&&facts.length>0&&(cancer!=='胃癌'||/反胃|呕吐|食入.*反出/.test(clinicalText));
      if(q?.text&&applicable){parts.push('《'+q.book+(q.chapter?'·'+q.chapter:'')+'》载：“'+S(q.text).replace(/[。；;]$/,'')+'。”');warnings.push('疾病相关引文出处请核对：'+[q.book,q.chapter,q.url].filter(Boolean).join(' · '));}
      if(q?.text&&!applicable)warnings.push('疾病经典与本次病候的对应尚待核对，本次正文未引用');
      if(S(d?.limits))warnings.push('经典引用边界：'+S(d.limits));
    }
    if(supported&&!S(e.tcmPlan)&&S(profile.treatment))parts.push(end('治法可参考'+S(profile.treatment)));
    if(!options.discussionOnly){
      if(S(e.tcmPlan))parts.push(end('中医治疗：'+S(e.tcmPlan)));
      if(S(e.prescriptionAnalysis))parts.push(end('方药分析：'+S(e.prescriptionAnalysis)));
      if(!S(e.tcmPlan)&&!S(e.prescriptionRaw))warnings.push('本次中医治疗安排请医师填写；未采用语料参考治法代替实际方案');
    }
    if(!evidence&&!facts.length)warnings.push('请补充本次辨证所依据的具体症状与四诊');
    if(!S(e.tongue))warnings.push('本次舌质未录入');if(!S(e.coat))warnings.push('本次舌苔未录入');if(!S(e.pulse))warnings.push('本次脉象未录入');
    return {text:paragraphs(parts),warnings:unique(warnings)};
  }
'''


def revised(source, include_first=False):
    if 'Concise source-bound TCM prose' in source:
        raise ValueError('TCM prose revision is already present; no file changed')
    start = source.index('  function tcmAnalysis(p,e) {')
    stop = source.index('  function symptomReasoning(e){', start)
    source = source[:start] + TCM_ANALYSIS + source[stop:]
    if include_first:
        first = source.index('  function firstNote(patient, encounter, prior, events) {')
        old_call = '    const tcmResult=tcmAnalysis(p,e);warnings.push(...tcmResult.warnings);'
        if old_call in source[first:]:
            at = source.index(old_call, first)
            source = source[:at] + old_call.replace('tcmAnalysis(p,e)', 'tcmAnalysis(p,e,{discussionOnly:true})') + source[at + len(old_call):]
        else:
            start = source.index('    const tcm=[];', first)
            stop = source.index('    const basis=[];', start)
            source = source[:start] + "    const tcmOutput=tcmAnalysis(p,e,{discussionOnly:true});warnings.push(...tcmOutput.warnings);\n    const tcm=[tcmOutput.text];\n" + source[stop:]
        plan = re.search(r'^    const tcmPlan=\[.*$', source[first:], re.M)
        if not plan:
            raise ValueError('First-note TCM plan anchor changed; no file changed')
        replacement = "    const tcmPlan=[S(e.tcmPlan)?end(e.tcmPlan):'【本次中医治疗安排请医师填写】。',S(e.prescriptionRaw)?'本次录入处方：'+end(e.prescriptionRaw):'',S(e.prescriptionAnalysis)?end('方药分析：'+S(e.prescriptionAnalysis)):''].filter(Boolean).join('');"
        at = first + plan.start()
        source = source[:at] + replacement + source[at + len(plan.group()):]
    return source


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--include-first-tcm', action='store_true')
    args = parser.parse_args()
    before = args.path.read_text()
    try:
        after = revised(before, args.include_first_tcm)
    except (ValueError, IndexError) as exc:
        raise SystemExit(str(exc))
    args.path.write_text(after)
    print('Updated TCM prose only' + (' and first-note TCM discussion/plan fallback' if args.include_first_tcm else '') + ': ' + str(args.path))
