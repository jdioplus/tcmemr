#!/usr/bin/env python3
"""Apply the compact navigation to a standalone HTML copy.

Usage: python3 tests/update-navigation.py INPUT.html [--output OUTPUT.html]
Without --output, update the supplied file in place. Clinical data and engines
are preserved; each old navigation anchor must match exactly once.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


MARKER = "/* Compact four-entry navigation. */"

NAVIGATION = '''<nav id="v6MainNav" class="tabs v6-main-nav" aria-label="主要功能">
<button type="button" id="quickTab" aria-current="page" aria-controls="quickPane">病程书写</button>
<button type="button" id="workbenchTab" aria-controls="workbenchPane">患者病案</button>
<button type="button" id="libraryTab" aria-controls="libraryPane">语料库</button>
<div id="v6ToolsMenu"><button id="v6MoreTools" type="button" aria-expanded="false" aria-controls="v6ToolLinks">辅助工具 <span aria-hidden="true">▾</span></button>
<div id="v6ToolLinks" aria-label="辅助工具" hidden>
<div class="v6-tools-heading"><span>辅助工具</span><button type="button" id="v6CloseTools" aria-label="关闭辅助工具菜单">关闭</button></div>
<button type="button" id="reportsTab" aria-controls="reportsPane">检查分析</button>
<button type="button" id="stagingTab" aria-controls="stagingPane">肿瘤分期</button>
<button type="button" id="prescriptionTab" aria-controls="prescriptionPane">中药处方分析</button>
<button type="button" id="generatorTab" aria-controls="generatorPane">详细病程编辑</button>
</div></div></nav>
<div id="v6ToolContext" class="v6-tool-context" hidden><span>当前工具：<strong id="v6CurrentTool"></strong></span><button type="button" id="v6ToolReturn">返回病程书写</button></div>'''

STYLES = '''
/* Compact four-entry navigation. */
#v6App .v6-main-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:stretch;position:relative}
#v6App .v6-main-nav>button,#v6ToolsMenu>#v6MoreTools{width:100%;min-height:42px;white-space:normal;font-size:14px}
#v6ToolsMenu{position:relative;min-width:0}
#v6ToolsMenu>#v6MoreTools{height:100%}
#v6MainNav button[aria-current=page]{background:#1a6470;color:#fff;border-color:#1a6470}
#v6MoreTools[aria-expanded=true]{box-shadow:0 0 0 2px #bedbd8}
#v6ToolLinks{position:absolute;top:calc(100% + 8px);right:0;display:grid;grid-template-columns:minmax(0,1fr);gap:5px;width:260px;max-width:calc(100vw - 24px);padding:10px;border:1px solid #ceddda;border-radius:10px;background:#fff;box-shadow:0 10px 30px #183b3422;z-index:35}
#v6ToolLinks>button{text-align:left;width:100%;font-size:14px;padding:11px 12px}
.v6-tools-heading{display:flex;align-items:center;justify-content:space-between;padding:1px 3px 7px;color:#60727b;font-size:12px}
.v6-tools-heading>button{padding:4px 8px;font-size:12px}
.v6-tool-context{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 14px;margin-top:12px;border:1px solid #dce6df;border-radius:8px;background:#edf5f1;font-size:13px;color:#335d46}
.v6-tool-context button{padding:7px 11px;font-size:13px;background:#fff}
@media(max-width:520px){#v6App .v6-main-nav{gap:5px}#v6App .v6-main-nav>button,#v6ToolsMenu>#v6MoreTools{padding:8px 5px;font-size:13px}.v6-tool-context{padding:10px 11px}}
@media print{.v6-tool-context{display:none!important}}
'''

SHOW_PANE = ''' function setToolMenuOpen(open,{restoreFocus=false,focusMenu=false}={}){
  const menu=$('#v6ToolLinks'),toggle=$('#v6MoreTools');menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
  if(open&&focusMenu)(menu.querySelector('button[aria-current="page"]')||menu.querySelector('button[aria-controls]'))?.focus();
  else if(!open&&restoreFocus)toggle.focus();
 }
 function showPane(which){
  const panes=['quick','library','generator','reports','staging','workbench','prescription'];if(!panes.includes(which))return;
  const menuFocus=$('#v6ToolLinks').contains(document.activeElement);
  for(const pane of panes){const active=pane===which,button=$('#'+pane+'Tab');$('#'+pane+'Pane').hidden=!active;if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  document.body.classList.toggle('wb-mode',which==='workbench'||which==='quick');document.body.classList.toggle('quick-mode',which==='quick');document.body.classList.toggle('library-mode',which==='library');
  $('#sidebar').hidden=which!=='library';$('#openNav').hidden=which!=='library';if(which!=='library')closeNav();
  const names={reports:'检查分析',staging:'肿瘤分期',prescription:'中药处方分析',generator:'详细病程编辑'},tool=Object.prototype.hasOwnProperty.call(names,which);
  $('#v6ToolContext').hidden=!tool;$('#v6CurrentTool').textContent=tool?names[which]:'';
  if(tool)$('#v6MoreTools').setAttribute('aria-current','page');else $('#v6MoreTools').removeAttribute('aria-current');
  setToolMenuOpen(false);if(which==='quick'&&globalThis.V6Quick)V6Quick.refreshPatients();
  if(menuFocus)(tool?$('#v6ToolReturn'):$('#'+which+'Tab')).focus({preventScroll:true});
 }'''

OLD_MORE_BINDING = "$('#v6MoreTools').onclick=()=>{const el=$('#v6ToolLinks');el.hidden=!el.hidden;$('#v6MoreTools').setAttribute('aria-expanded',String(!el.hidden));};"

MORE_BINDING = '''$('#v6MoreTools').onclick=()=>setToolMenuOpen($('#v6ToolLinks').hidden,{focusMenu:true});
 $('#v6CloseTools').onclick=()=>setToolMenuOpen(false,{restoreFocus:true});
 $('#v6ToolReturn').onclick=()=>showPane('quick');
 document.addEventListener('click',e=>{if(!$('#v6ToolLinks').hidden&&!$('#v6ToolsMenu').contains(e.target))setToolMenuOpen(false);});
 document.addEventListener('focusin',e=>{if(!$('#v6ToolLinks').hidden&&!$('#v6ToolsMenu').contains(e.target))setToolMenuOpen(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#v6ToolLinks').hidden){e.preventDefault();setToolMenuOpen(false,{restoreFocus:true});}});
 '''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected one anchor, found {count}; no file written")
    return text.replace(old, new, 1)


def transform(text: str) -> str:
    if MARKER in text:
        raise ValueError("Compact navigation is already installed; no file written")

    nav_pattern = r'<div class="tabs" role="tablist"><button type="button" id="quickTab".*?</div></div>(?=</header>)'
    matches = list(re.finditer(nav_pattern, text, re.DOTALL))
    if len(matches) != 1:
        raise ValueError(f"Navigation: expected one anchor, found {len(matches)}; no file written")
    text = text[: matches[0].start()] + NAVIGATION + text[matches[0].end() :]

    pane_pattern = r'^ function showPane\(which\)\{[^\n]*\}$'
    pane_matches = list(re.finditer(pane_pattern, text, re.MULTILINE))
    if len(pane_matches) != 1:
        raise ValueError(f"showPane: expected one anchor, found {len(pane_matches)}; no file written")
    text = text[: pane_matches[0].start()] + SHOW_PANE + text[pane_matches[0].end() :]
    text = replace_once(text, OLD_MORE_BINDING, MORE_BINDING, "Auxiliary menu binding")
    text = replace_once(text, "</style>", STYLES + "</style>", "Styles")
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    parser.add_argument("--output", type=Path, help="Write a copy instead of replacing input")
    args = parser.parse_args()
    try:
        result = transform(args.html.read_text(encoding="utf-8"))
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    destination = args.output or args.html
    destination.write_text(result, encoding="utf-8")
    print(f"Updated navigation: {destination}")


if __name__ == "__main__":
    main()
