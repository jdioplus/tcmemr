/* Inline or load this file after the clinical page. No external dependencies. */
(function (g) {
  'use strict';
  const text = value => value == null ? '' : String(value);
  let renderSerial = 0;
  const styles = `
  #qDecisionReview{margin:18px 0}
  #qDecisionReview [hidden]{display:none!important}
  .v63-review-intro h3{margin:0 0 6px;font-size:18px}
  .v63-review-intro p{margin:0 0 12px;font-size:13px;color:#61736b}
  .v63-review-card{margin:12px 0;padding:16px;border:1px solid #d4e2d9;border-radius:10px;background:#f7faf8}
  .v63-review-card h4{font-size:16px;margin:0 0 8px;color:#254b36}
  .v63-review-context{font-size:13px;line-height:1.7;color:#586c5f;margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}
  .v63-review-field{display:flex;flex-direction:column;gap:6px;font-size:13px;margin-top:12px}
  .v63-review-field select,.v63-review-field textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box;background:#fff;border:1px solid #c6d8cb;border-radius:7px;padding:9px 10px;color:#20372a;font:inherit}
  .v63-review-field textarea{min-height:76px;line-height:1.7;resize:vertical}
  .v63-review-card fieldset{border:0;padding:0;margin:14px 0 0;min-width:0}
  .v63-review-card legend{padding:0;margin:0 0 7px;font-size:13px;font-weight:600;color:#405e4a}
  .v63-review-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px}
  .v63-review-option{display:flex!important;flex-direction:row!important;align-items:flex-start;gap:8px!important;font-size:13px;line-height:1.65;min-width:0;overflow-wrap:anywhere}
  .v63-review-option input{margin:4px 0 0!important;flex:none;width:auto!important;accent-color:#245f46}
  .v63-review-primary-detail{font-size:13px;line-height:1.7;margin:8px 0 0;color:#335d46;white-space:pre-wrap;overflow-wrap:anywhere}
  @media(max-width:600px){.v63-review-card{padding:13px}.v63-review-options{grid-template-columns:minmax(0,1fr)}}
  @media print{#qDecisionReview{display:none!important}}
  `;

  function element(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = text(content);
    return el;
  }
  function entries(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter(value => {
      const id = text(value && value.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);return true;
    }).map(value => ({id:text(value.id),label:text(value.label)||text(value.id),text:text(value.text)}));
  }
  function selected(values, allowed) {
    return [...new Set((Array.isArray(values) ? values : []).map(text))].filter(id => allowed.has(id));
  }
  function ensureStyle() {
    if (document.getElementById('v63DecisionReviewStyle')) return;
    const style = element('style');style.id = 'v63DecisionReviewStyle';style.textContent = styles;
    document.head.appendChild(style);
  }

  // Rendering is read-only with respect to the host's clinical state. Only a
  // user input event calls onChange; initial/restored choices never imply a new
  // physician decision or automatically modify the note.
  function render(cards, onChange, currentSelections = {}) {
    const host = document.getElementById('qDecisionReview');
    if (!host) return;
    ensureStyle();renderSerial += 1;
    const active = document.activeElement;
    const focusedCard = host.contains(active) ? active.closest('[data-decision-card]') : null;
    const focus = focusedCard ? {
      card:focusedCard.dataset.decisionCard,
      control:active.dataset.reviewControl,
      option:active.dataset.reviewOption || '',
      start:active.tagName==='TEXTAREA'?active.selectionStart:null,
      end:active.tagName==='TEXTAREA'?active.selectionEnd:null
    } : null;
    const openCards=new Set([...host.querySelectorAll('details[open][data-decision-card]')].map(x=>x.dataset.decisionCard));
    host.replaceChildren();host.setAttribute('role','region');host.setAttribute('aria-label','本次判断与进一步检查');
    const seenCards = new Set();
    const validCards = (Array.isArray(cards) ? cards : []).filter(card => {
      const id = text(card && card.id);
      if (!id || seenCards.has(id)) return false;
      seenCards.add(id);return true;
    });
    host.hidden = validCards.length === 0;
    if (!validCards.length) return;


    validCards.forEach((card, index) => {
      const id = text(card.id), options = entries(card.options), checks = entries(card.checks);
      const optionIds = new Set(options.map(option=>option.id)), checkIds = new Set(checks.map(check=>check.id));
      const existing = currentSelections && Object.prototype.hasOwnProperty.call(currentSelections,id) ? currentSelections[id] || {} : {};
      const state = {
        primary:optionIds.has(text(existing.primary))?text(existing.primary):'',
        secondary:card.allowSecondary===false?[]:selected(existing.secondary,optionIds),
        checks:selected(existing.checks,checkIds),
        extra:text(existing.extra)
      };
      state.secondary = state.secondary.filter(option=>option!==state.primary);
      const cardEl = element('details','v63-review-card');cardEl.dataset.decisionCard = id;cardEl.open=openCards.has(id);
      const title = element('summary','', (card.title||'本次判断')+(state.primary?' · '+(options.find(o=>o.id===state.primary)?.label||'已选择'):' · 点击选择'));title.id='v63ReviewTitle_'+renderSerial+'_'+index;
      cardEl.setAttribute('aria-labelledby',title.id);cardEl.appendChild(title);
      if (text(card.contextNote)) cardEl.appendChild(element('p','v63-review-context',card.contextNote));
      const primaryLabel = element('label','v63-review-field');
      primaryLabel.appendChild(element('span','','主要判断（单选）'));
      const primary = element('select');primary.dataset.reviewPrimary='';primary.dataset.reviewControl='primary';
      const empty = element('option','','请选择本次主要判断');empty.value='';primary.appendChild(empty);
      options.forEach(option=>{const row=element('option','',option.label);row.value=option.id;primary.appendChild(row);});
      primary.value=state.primary;primaryLabel.appendChild(primary);cardEl.appendChild(primaryLabel);
      const detail = element('p','v63-review-primary-detail');detail.setAttribute('aria-live','polite');cardEl.appendChild(detail);

      const secondaryField = element('fieldset');secondaryField.appendChild(element('legend','','兼顾因素（可多选）'));
      const secondaryGrid = element('div','v63-review-options'), secondaryRows = new Map();
      const checksField = element('fieldset');checksField.appendChild(element('legend','','进一步检查（可多选）'));
      const checksGrid = element('div','v63-review-options');
      function notify() {
        if (typeof onChange === 'function') onChange(id,{primary:state.primary,secondary:[...state.secondary],checks:[...state.checks],extra:state.extra});
      }
      function checkbox(item, kind, grid) {
        const label=element('label','v63-review-option'),input=element('input');input.type='checkbox';
        input.dataset.reviewControl=kind;input.dataset.reviewOption=item.id;
        input.dataset[kind==='secondary'?'reviewSecondary':'reviewCheck']=item.id;
        input.checked=state[kind].includes(item.id);
        if(item.text)label.title=item.text;
        label.append(input,element('span','',item.label));grid.appendChild(label);
        input.addEventListener('change',()=>{
          if(kind==='secondary'&&item.id===state.primary){input.checked=false;return;}
          state[kind]=input.checked?[...new Set([...state[kind],item.id])]:state[kind].filter(value=>value!==item.id);
          notify();
        });
        return {label,input};
      }
      if(card.allowSecondary!==false)options.forEach(option=>secondaryRows.set(option.id,checkbox(option,'secondary',secondaryGrid)));
      checks.forEach(check=>checkbox(check,'checks',checksGrid));
      secondaryField.appendChild(secondaryGrid);checksField.appendChild(checksGrid);
      checksField.hidden=checks.length===0;cardEl.append(secondaryField,checksField);
      function refreshPrimary() {
        state.secondary=state.secondary.filter(option=>option!==state.primary);
        let visible=0;
        for(const [optionId,row]of secondaryRows){row.label.hidden=optionId===state.primary;row.input.checked=state.secondary.includes(optionId);if(!row.label.hidden)visible+=1;}
        secondaryField.hidden=visible===0;
        const selectedOption=options.find(option=>option.id===state.primary);detail.textContent=selectedOption?.text||'';detail.hidden=!detail.textContent;
      }
      primary.addEventListener('change',()=>{state.primary=optionIds.has(primary.value)?primary.value:'';refreshPrimary();notify();});
      const extraLabel=element('label','v63-review-field');extraLabel.appendChild(element('span','','补充依据与本次安排'));
      const extra=element('textarea');extra.rows=2;extra.value=state.extra;extra.placeholder='填写本次实际依据或需补充的安排';extra.dataset.reviewExtra='';extra.dataset.reviewControl='extra';
      extra.addEventListener('input',()=>{state.extra=extra.value;notify();});extraLabel.appendChild(extra);cardEl.appendChild(extraLabel);
      refreshPrimary();host.appendChild(cardEl);
    });
    if(focus){
      const target=[...host.querySelectorAll('[data-review-control]')].find(el=>el.closest('[data-decision-card]')?.dataset.decisionCard===focus.card&&el.dataset.reviewControl===focus.control&&(el.dataset.reviewOption||'')===focus.option);
      if(target&&!target.closest('[hidden]')){target.focus({preventScroll:true});if(target.tagName==='TEXTAREA'&&focus.start!==null)target.setSelectionRange(focus.start,focus.end);}
    }
  }
  g.V63ReviewUI=Object.freeze({render});
})(globalThis);
