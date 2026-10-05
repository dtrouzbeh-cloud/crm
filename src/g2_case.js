/* =====================================================================
   VAKALAR + VAKA SİHİRBAZI
   ===================================================================== */
const caseBadge = c => `<span class="bdg ${({pool:"warn",diagnosed:"info",sent:"ok"})[c.status]||""}">${t("cs_"+c.status)}</span>`;
let caseTab = "pool";
function viewCases(){
  const tabs = ["pool","diagnosed","sent","all"];
  const ls = S.cases.filter(c=>caseTab==="all" || c.status===caseTab).sort((a,b)=>b.created-a.created);
  return pageHead(t("nav_cases"), t("cases_sub")) + `<div class="tabs" style="margin-bottom:14px">${tabs.map(k=>`<button class="${caseTab===k?"on":""}" data-act="caseTab" data-v="${k}">${t(k==="all"?"all":"cs_"+k)} <span class="bdg">${k==="all"?S.cases.length:S.cases.filter(c=>c.status===k).length}</span></button>`).join("")}</div>
  ${ls.length ? `<div class="grid g3">${ls.map(c=>{ const l = lead(c.leadId), q = S.quotes.find(x=>x.caseId===c.id && x.status!=="superseded");
    return `<div class="card" style="overflow:hidden"><div class="mini-chart" style="background:var(--subtle);padding:6px 8px 0;cursor:pointer" data-act="go" data-to="#/case/${c.id}/${c.step||1}">${chartSVG(toothStates(c, c.items.length?"plan":"sit"), {dots:true})}</div>
    <div class="bd col" style="gap:8px"><div class="row">${av(l.name)}<div class="grow"><b>${esc(l.name)}</b><div class="tiny muted">${flag(l.country)} ${l.age?l.age+" · ":""}${rel(c.created)}</div></div>${caseBadge(c)}</div>
    ${l.medNote?`<div class="tiny" style="color:var(--err)">${I("alert").replace("<svg","<svg style='width:12px;height:12px'")} ${esc(l.medNote)}</div>`:""}
    <div class="row small muted"><span class="grow">${c.dentist?`${av(c.dentist,1)} ${esc(user(c.dentist).name)}`:t("no_dentist")}</span>${c.items.length?`<span>${t("n_items",{n:c.items.length})} · ${t("n_visits",{n:c.visits})}</span>`:""}</div>
    ${q?`<div class="row small">${qBadge(q.status)}<span class="grow"></span><b class="num">${money(q.opts[0].calc.total,q.cur)}</b></div>`:""}
    <div class="row">${c.status==="pool" && !c.dentist && can("dx") ? `<button class="btn sm" data-act="claim" data-id="${c.id}">${t("take_case")}</button>`:""}<a class="btn sm pri" href="#/case/${c.id}/${c.step||1}" style="margin-inline-start:auto">${t("open")} →</a></div></div></div>`; }).join("")}</div>` : `<div class="card">${emptyBox("tooth", t("no_cases"))}</div>`}`;
}
ACT.caseTab = el => { caseTab = el.dataset.v; route(); };
ACT.claim = el => { const c = kase(el.dataset.id); c.dentist = S.me; save(); toast(t("claimed")); location.hash = `#/case/${c.id}/${c.sitDone?2:1}`; };

/* ---------- workspace state ---------- */
let W = null;
function ws(c){
  if(!W || W.caseId!==c.id) W = {caseId:c.id, sel:new Set(), brush:"missing", txSel:null, bSel:null, brand:null, jaws:["u"], qty:1, curV:1, items:clone(c.items), visits:c.visits, dirty:false, undo:[], q:"", pickTab:"tx", optIdx:0, newIds:new Set()};
  return W;
}
function commitWS(c){ if(W && W.caseId===c.id && W.dirty){ c.items = clone(W.items); c.visits = W.visits; W.dirty = false; W.newIds.clear(); save(); return true; } return false; }
const wcase = c => Object.assign({}, c, {items:W.items, visits:W.visits});

function caseHeader(c, step){
  const l = lead(c.leadId), meds = MED.filter(m=>l.med && l.med[m]);
  const priced = c.status!=="pool";
  const steps = [[1,"step_sit"],[2,"step_plan"],[3,"step_price"],[4,"step_send"]];
  const lock = s => (s>=3 && (!priced || !can("price"))) || (s===2 && !can("dx") && !c.items.length);
  return `<div class="row wrap" style="gap:10px;margin-bottom:12px"><a href="#/cases" class="btn ghost sm">${I("back","flip")}${t("nav_cases")}</a>
    <div class="grow row wrap" style="gap:10px">${av(l.name)}<div><div class="row"><h1 style="font-size:19px">${esc(l.name)}</h1>${caseBadge(c)}</div>
    <div class="tiny muted row wrap" style="gap:8px"><a href="#/lead/${l.id}">${t("lead")} #${l.id}</a><span>${flag(l.country)} ${l.age?l.age+" "+t("yrs"):""}</span>${meds.length?`<span class="bdg err">${I("alert").replace("<svg","<svg style='width:12px;height:12px'")} ${esc(l.medNote||meds.map(m=>t("med_"+m)).join(", "))}</span>`:""}</div></div></div>
    <label class="row small muted" style="gap:6px">${t("dentist")}<select class="inp sm" id="dentSel" style="width:auto" ${can("dx")||can("approve")?"":"disabled"}><option value="">—</option>${S.users.filter(u=>u.role==="dentist"||u.role==="admin").map(u=>`<option value="${u.id}" ${c.dentist===u.id?"selected":""}>${esc(u.name)}</option>`).join("")}</select></label>
    ${!c.dentist && can("dx") ? `<button class="btn sm" data-act="claim" data-id="${c.id}">${t("take_case")}</button>`:""}
  </div>
  <div class="stepper" style="margin-bottom:14px">${steps.map(([n,k])=>`<a href="#/case/${c.id}/${n}" class="${n===step?"on":""} ${n<step||(n===1&&c.sitDone)||(n===2&&priced)||(n===3&&c.status==="sent")?"done":""} ${lock(n)?"lock":""}"><i>${(n<step)?"✓":n}</i>${t(k)}</a>`).join("")}</div>`;
}

function viewCase(id, step){
  const c = kase(id); if(!c) return emptyBox("tooth", t("not_found"));
  step = +step || c.step || 1;
  if(step>=3 && (c.status==="pool" || !can("price"))) step = 2;
  c.step = Math.max(c.step||1, step);
  ws(c);
  const body = step===1 ? viewSit(c) : step===2 ? viewPlan(c) : step===3 ? viewPrice(c) : viewReview(c);
  return caseHeader(c, step) + body;
}

/* ---------- ADIM 1: mevcut durum ---------- */
function sitChart(c){ const st = toothStates(c, "sit"); return `<div id="cw">${chartSVG(st, {sel:W.sel})}</div><span class="jawlbl" style="top:14px">${t("jaw_u").toUpperCase()}</span><span class="jawlbl" style="bottom:12px">${t("jaw_l").toUpperCase()}</span>`; }
function viewSit(c){
  const l = lead(c.leadId);
  return `<div class="ws">
    <div class="col">
      <div class="chartbox" id="chart" data-mode="sit">${sitChart(c)}</div>
      <div class="legend" id="legend">${legendHTML(toothStates(c,"sit"))}</div>
      <div class="alert info">${I("info")}<span>${t("sit_tip")}</span></div>
    </div>
    <div class="col" style="gap:14px">
      <div class="card"><div class="hd"><h2 class="grow">${t("sit_title")}</h2><span class="bdg">${Object.keys(c.situation).length} ${t("teeth_marked")}</span></div><div class="bd col">
        <div class="brush">${SIT.map(([k,col])=>`<button class="chip ${W.brush===k?"on":""}" data-act="brush" data-v="${k}"><i style="background:${col};border:1px solid rgba(0,0,0,.15)"></i>${t("sit_"+k)}</button>`).join("")}</div>
        <div class="tiny muted" style="margin-top:4px">${t("findings")}</div>
        <div class="brush">${FINDINGS.map(([k,col])=>`<button class="chip ${W.brush===k?"on":""}" data-act="brush" data-v="${k}"><i style="background:${col}"></i>${t("lg_"+k)}</button>`).join("")}</div>
        <div class="row"><button class="btn sm ghost" data-act="sitJaw" data-v="u">${t("all_upper_as")}</button><button class="btn sm ghost" data-act="sitJaw" data-v="l">${t("all_lower_as")}</button><span class="grow"></span><button class="btn sm ghost danger" data-act="sitClear">${t("clear")}</button></div>
      </div></div>
      <div class="card"><div class="hd"><h2 class="grow">${t("patient_info")}</h2></div><div class="bd col small">
        <div><span class="muted">${t("issue")}:</span> ${esc(l.issue||"—")}</div>
        <div><span class="muted">${t("anamnesis")}:</span> ${MED.filter(m=>l.med&&l.med[m]).map(m=>`<span class="bdg err">${t("med_"+m)}</span>`).join(" ") || t("none")} ${l.medNote?`<div class="tiny muted">${esc(l.medNote)}</div>`:""}</div>
        <div class="row wrap" style="gap:6px"><span class="muted">${t("files")}:</span><span class="bdg">📷 ${t("photos")} · 0</span><span class="bdg">🩻 X-ray · 0</span><span class="tiny faint">(${t("soon")})</span></div>
      </div></div>
      <div class="row"><button class="btn" data-act="sitSkip">${t("skip")}</button><span class="grow"></span><button class="btn pri" data-act="sitNext">${t("save_continue")} →</button></div>
    </div></div>`;
}
function paintSit(c, tt, mode){
  const cur = c.situation[tt] || {}, b = W.brush;
  if(b==="sinusSark" || b==="kemikAz"){
    if(b==="sinusSark" && (jawOf(tt)!=="u" || tt%10<4)) return;
    if(b==="kemikAz" && (jawOf(tt)!=="l" || tt%10<4)) return;
    const f = Object.assign({}, cur.f); if(mode==="erase") delete f[b]; else f[b] = true;
    const n = Object.assign({}, cur, {f}); if(!Object.keys(f).length) delete n.f; if(!n.s && !n.f) delete c.situation[tt]; else c.situation[tt] = n; return;
  }
  if(mode==="erase" || b==="intact"){ if(cur.f) c.situation[tt] = {f:cur.f}; else delete c.situation[tt]; }
  else c.situation[tt] = Object.assign({}, cur, {s:b});
}
ACT.brush = el => { W.brush = el.dataset.v; document.querySelectorAll('[data-act="brush"]').forEach(b=>b.classList.toggle("on", b.dataset.v===W.brush)); };
ACT.sitJaw = el => { const c = kase(route.params[0]); (el.dataset.v==="u"?UPPER:LOWER).forEach(tt=>paintSit(c, tt, "paint")); save(); refreshChart(c); };
ACT.sitClear = async () => { const c = kase(route.params[0]); if(await confirmBox(t("clear"), t("clear_sit_q"), t("clear"), true)){ c.situation = {}; save(); route(); } };
ACT.sitSkip = () => { const c = kase(route.params[0]); c.sitDone = true; c.sitSkipped = true; save(); location.hash = `#/case/${c.id}/2`; };
ACT.sitNext = () => { const c = kase(route.params[0]); c.sitDone = true; c.sitSkipped = false; save(); toast(t("saved")); location.hash = `#/case/${c.id}/2`; };

function refreshChart(c){
  const box = document.getElementById("chart"); if(!box) return;
  if(box.dataset.mode==="sit"){ document.getElementById("cw").innerHTML = chartSVG(toothStates(c,"sit"), {sel:W.sel}); document.getElementById("legend").innerHTML = legendHTML(toothStates(c,"sit")); return; }
  const wc = wcase(c), st = toothStates(wc, "plan");
  const pre = W.bSel ? new Set(bundle(W.bSel).teeth) : new Set();
  document.getElementById("cw").innerHTML = chartSVG(st, {sel:W.sel, preview:pre, spans:spansFor(wc, W.items)});
  document.getElementById("legend").innerHTML = legendHTML(st);
  const sb = document.getElementById("selbar"); if(sb) sb.innerHTML = selbarHTML();
  const ab = document.getElementById("addBtn"); if(ab) ab.outerHTML = addBtnHTML();
}
/* çizim etkileşimi: dokun / sürükle */
function wireChart(c){
  const box = document.getElementById("chart"); if(!box) return;
  let down = false, mode = null, touched = new Set();
  const hitT = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const g = el && el.closest && el.closest("[data-t]"); return g && box.contains(g) ? +g.dataset.t : null; };
  const apply = tt => {
    if(touched.has(tt)) return; touched.add(tt);
    if(box.dataset.mode==="sit"){
      if(mode===null){ const cur = c.situation[tt]||{}; const b = W.brush; mode = ((b==="sinusSark"||b==="kemikAz") ? (cur.f&&cur.f[b]) : cur.s===b) ? "erase" : "paint"; }
      paintSit(c, tt, mode); save();
    } else {
      if(W.bSel){ W.bSel = null; W.sel.clear(); }
      if(mode===null) mode = W.sel.has(tt) ? "erase" : "paint";
      if(mode==="erase") W.sel.delete(tt); else W.sel.add(tt);
    }
    refreshChart(c);
  };
  box.addEventListener("pointerdown", e=>{ const tt = hitT(e); if(tt==null) return; down = true; mode = null; touched = new Set(); box.setPointerCapture && box.setPointerCapture(e.pointerId); apply(tt); e.preventDefault(); });
  box.addEventListener("pointermove", e=>{ if(!down) return; const tt = hitT(e); if(tt!=null) apply(tt); });
  const up = () => { down = false; mode = null; };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up); box.addEventListener("lostpointercapture", up);
}

/* ---------- ADIM 2: tedavi planı ---------- */
function selbarHTML(){
  const s = [...W.sel].sort((a,b)=>ALL_TEETH.indexOf(a)-ALL_TEETH.indexOf(b));
  return `<span class="muted">${t("selected")}:</span> <b class="num">${s.length?s.join(", "):"—"}</b> · <span class="dot" style="background:${vcol(W.curV)}"></span> ${t("visit_n",{n:W.curV})}
  <span class="grow"></span><button class="btn xs" data-act="selJaw" data-v="u">${t("jaw_u")}</button><button class="btn xs" data-act="selJaw" data-v="l">${t("jaw_l")}</button>${s.length?`<button class="btn xs ghost" data-act="selClear">${t("clear_sel")}</button>`:""}`;
}
function addBtnHTML(){
  const x = W.txSel && tx(W.txSel), b = W.bSel && bundle(W.bSel);
  let ok = false, lbl = t("pick_first");
  if(b){ ok = true; lbl = t("add_to_visit",{n:W.curV}); }
  else if(x){ const needT = x.unit==="tooth"||x.unit==="side"; ok = needT ? W.sel.size>0 : x.unit==="arch" ? W.jaws.length>0 : true; lbl = needT && !W.sel.size ? t("tap_teeth") : t("add_to_visit",{n:W.curV}) + (needT?` · ${W.sel.size} ${t("teeth_s")}`:""); }
  return `<button class="btn pri" id="addBtn" data-act="addItem" ${ok?"":"disabled"} style="width:100%">${I("plus")}${lbl}</button>`;
}
function pickerHTML(c){
  const q = W.q.toLowerCase();
  let list = "";
  if(W.pickTab==="tx"){
    Object.keys(CATS).forEach(cat=>{
      const xs = S.catalog.tx.filter(x=>x.cat===cat && x.active && (!q || tn(x.n).toLowerCase().includes(q) || x.n.join(" ").toLowerCase().includes(q)));
      if(!xs.length) return;
      list += `<div class="txcat">${tn(CATS[cat])}</div>` + xs.map(x=>`<div class="tx ${W.txSel===x.id?"on":""}" data-act="pickTx" data-id="${x.id}"><i style="background:${x.color||"#94A3B8"}"></i><span>${esc(tn(x.n))}</span><span class="p">${can("money")?fmtMoney(convert(x.brands?Math.min(...x.brands.map(b=>b.price)):x.price, S.clinic.cur))+(x.brands?"+":""):""} <span class="faint">/${t("u_"+x.unit)}</span></span></div>`).join("");
    });
  } else {
    list = S.catalog.bundles.filter(b=>b.active && (!q || tn(b.n).toLowerCase().includes(q))).map(b=>`<div class="tx ${W.bSel===b.id?"on":""}" data-act="pickB" data-id="${b.id}"><i style="background:${b.color}"></i><span>${esc(tn(b.n))}<div class="tiny muted">${t(b.jaw==="u"?"jaw_u":"jaw_l")} · ${b.teeth.length} ${t("teeth_s")}${b.prereq?` · ${t("needs_imp",{n:b.prereq.count})}`:""}${b.minVisits>1?` · ${t("min_v",{n:b.minVisits})}`:""}</div></span><span class="p">${can("money")?fmtMoney(convert(b.price,S.clinic.cur)):""}</span></div>`).join("");
  }
  const x = W.txSel && tx(W.txSel);
  let opts = "";
  if(x){
    if(x.brands) opts += `<label class="f">${x.id==="graft"?t("amount"):t("brand")}<select class="inp sm" id="brandSel">${x.brands.map(b=>`<option value="${b.id}" ${W.brand===b.id?"selected":""}>${esc(b.n)}${can("money")?" — "+fmtMoney(convert(b.price,S.clinic.cur)):""}</option>`).join("")}</select></label>`;
    if(x.unit==="arch") opts += `<div class="row" style="gap:6px"><span class="small muted">${t("jaw")}:</span>${["u","l"].map(j=>`<button class="chip ${W.jaws.includes(j)?"on":""}" data-act="jawT" data-v="${j}">${t(j==="u"?"jaw_u":"jaw_l")}</button>`).join("")}</div>`;
    if(x.unit==="piece"||x.unit==="mouth") opts += `<label class="f">${t("qty")}<input class="inp sm" type="number" min="1" id="qtyIn" value="${W.qty}" style="width:90px"></label>`;
    if(x.desc) opts += `<div class="tiny muted">${esc(tn(x.desc))}</div>`;
    opts += `<div class="tiny faint">${t("allowed_v")}: ${x.visits.map(v=>"V"+v).join(", ")} · ${t("unit")}: ${t("u_"+x.unit)}</div>`;
  }
  return `<div class="card"><div class="hd" style="padding:10px 12px"><div class="seg grow"><button class="${W.pickTab==="tx"?"on":""}" data-act="pickTab" data-v="tx" style="flex:1">${t("treatments")}</button><button class="${W.pickTab==="b"?"on":""}" data-act="pickTab" data-v="b" style="flex:1">${t("bundles")}</button></div></div>
    <div class="bd picker" style="padding:12px">
      <input class="inp sm" id="txQ" placeholder="${t("search_tx")}" value="${esc(W.q)}">
      <div class="txlist" id="txlist">${list || `<div class="empty small">${t("no_results")}</div>`}</div>
      ${opts?`<div class="col" style="gap:8px;padding-top:6px;border-top:1px solid var(--line)">${opts}</div>`:""}
      ${addBtnHTML()}
    </div></div>`;
}
function planSummaryHTML(c){
  let h = "";
  for(let v=1; v<=W.visits; v++){
    const its = W.items.filter(i=>i.v===v);
    h += `<div class="plan-v"><div class="h"><span class="dot" style="background:${vcol(v)}"></span>${t("visit_n",{n:v})}<span class="grow"></span>${its.length?`<span class="tiny muted">${t("n_items",{n:its.length})}</span>`:`<span class="tiny" style="color:var(--err)">${t("empty_visit")}</span>`}</div>
    ${its.map(it=>{ const x = it.tx && tx(it.tx), b = brandOf(it), bu = it.b && bundle(it.b);
      return `<div class="pitem ${W.newIds.has(it.id)?"new":""}"><i class="dot" style="background:${bu?bu.color:(x&&x.color)||"#94A3B8"};border-radius:3px"></i><div class="grow"><div style="font-weight:550">${esc(itemName(it))}${bu?` <span class="bdg brand">${t("package")}</span>`:""}${it.auto?` <span class="bdg">${t("auto")}</span>`:""}</div>
      <div class="t">${it.teeth&&it.teeth.length?`${t("teeth")}: ${it.teeth.join(", ")}`:""}${it.jaws&&it.jaws.length?it.jaws.map(j=>t(j==="u"?"jaw_u":"jaw_l")).join(" + "):""}${(!it.teeth||!it.teeth.length)&&(!it.jaws||!it.jaws.length)?`× ${it.qty||1}`:""}${b?` · ${esc(b.n)}`:""}${bu&&bu.crown.length===14?` · <b>${t("full_jaw")}</b>`:""}</div></div>
      <select class="inp sm" data-mv="${it.id}" style="width:auto" title="${t("move_visit")}">${Array.from({length:W.visits},(_,k)=>`<option value="${k+1}" ${it.v===k+1?"selected":""}>V${k+1}</option>`).join("")}</select>
      <button class="btn xs ghost icon" data-act="rmItem" data-id="${it.id}" title="${t("remove")}">${I("x")}</button></div>`; }).join("")}</div>`;
  }
  return h;
}
function rulesHTML(c){
  const rs = checkRules(wcase(c), W.items);
  if(!W.items.length) return "";
  if(!rs.length) return `<div class="alert ok">${I("ok")}<span>${t("rules_ok")}</span></div>`;
  return rs.map(r=>`<div class="alert ${r.sev==="block"?"err":r.sev==="info"?"info":"warn"}">${I(r.sev==="block"?"ban":r.sev==="info"?"info":"alert")}<span><b>${r.code}</b> · ${esc(ruleText(r))}</span></div>`).join("");
}
function viewPlan(c){
  const wc = wcase(c), st = toothStates(wc, "plan");
  if(W.curV > W.visits) W.curV = W.visits;
  return `<div class="row wrap" style="gap:10px;margin-bottom:12px">
    <div class="row" style="gap:6px"><span class="small muted">${t("visits")}</span><button class="btn sm icon" data-act="vis" data-d="-1">−</button><b class="num" style="min-width:16px;text-align:center">${W.visits}</b><button class="btn sm icon" data-act="vis" data-d="1">+</button></div>
    <div class="vtabs">${Array.from({length:W.visits},(_,k)=>{ const v=k+1, n = W.items.filter(i=>i.v===v).length; return `<button class="vtab ${W.curV===v?"on":""}" data-act="curV" data-v="${v}"><span class="dot" style="background:${vcol(v)}"></span>${t("visit_n",{n:v})}<span class="c ${n?"":"e"}">${n||t("empty")}</span></button>`; }).join("")}</div>
    <span class="grow"></span>
    ${W.dirty?`<span class="unsaved">${t("unsaved")}</span>`:""}
    <button class="btn sm" data-act="suggest" title="${t("suggest_tip")}">${I("spark")}${t("suggest")}</button>
    <button class="btn sm icon" data-act="undo" ${W.undo.length?"":"disabled"} title="${t("undo")} (Ctrl+Z)">${I("undo")}</button>
    <button class="btn sm" data-act="saveDraft" ${W.dirty?"":"disabled"}>${t("save_draft")}</button>
    <button class="btn sm pri" data-act="completePlan" ${W.items.length?"":"disabled"}>${t("complete_plan")}</button>
  </div>
  <div class="ws">
    <div class="col">
      <div class="chartbox" id="chart" data-mode="plan"><div id="cw">${chartSVG(st, {sel:W.sel, preview:W.bSel?new Set(bundle(W.bSel).teeth):null, spans:spansFor(wc, W.items)})}</div><span class="jawlbl" style="top:14px">${t("jaw_u").toUpperCase()}</span><span class="jawlbl" style="bottom:12px">${t("jaw_l").toUpperCase()}</span></div>
      <div class="selbar" id="selbar">${selbarHTML()}</div>
      <div class="legend" id="legend">${legendHTML(st)}</div>
      <div class="row between" style="margin-top:6px"><h2>${t("plan_summary")}</h2>${c.sitSkipped?`<span class="bdg">${t("sit_skipped")}</span>`:""}</div>
      <div class="col" id="psum">${planSummaryHTML(c)}</div>
    </div>
    <div class="col" style="gap:12px">
      <div class="small muted">${t("plan_steps")}</div>
      ${pickerHTML(c)}
      <div class="col" id="rules" style="gap:6px">${rulesHTML(c)}</div>
    </div></div>`;
}
function rerenderPlan(c){ const pg = document.getElementById("page"); pg.innerHTML = viewCase(c.id, 2); wireCase(c, 2); }
function pushUndo(){ W.undo.push(clone(W.items)); if(W.undo.length>40) W.undo.shift(); }
ACT.pickTab = el => { W.pickTab = el.dataset.v; rerenderPlan(kase(route.params[0])); };
ACT.pickTx = el => { const x = tx(el.dataset.id); W.txSel = x.id; if(W.bSel){ W.bSel = null; W.sel.clear(); } W.brand = x.brands ? (x.id==="implant" ? "b_neod" : x.brands[0].id) : null; if(x.visits.length && !x.visits.includes(W.curV)) toast(t("visit_hint",{v:x.visits.map(v=>"V"+v).join("/")})); rerenderPlan(kase(route.params[0])); };
ACT.pickB = el => { const b = bundle(el.dataset.id); W.bSel = b.id; W.txSel = null; W.sel = new Set(b.teeth); rerenderPlan(kase(route.params[0])); };
ACT.jawT = el => { const j = el.dataset.v; W.jaws = W.jaws.includes(j) ? W.jaws.filter(x=>x!==j) : [...W.jaws, j]; rerenderPlan(kase(route.params[0])); };
ACT.selJaw = el => { const row = el.dataset.v==="u"?UPPER:LOWER; const all = row.every(tt=>W.sel.has(tt)); row.forEach(tt=> all ? W.sel.delete(tt) : W.sel.add(tt)); W.bSel = null; refreshChart(kase(route.params[0])); };
ACT.selClear = () => { W.sel.clear(); W.bSel = null; refreshChart(kase(route.params[0])); };
ACT.curV = el => { W.curV = +el.dataset.v; rerenderPlan(kase(route.params[0])); };
ACT.vis = el => {
  const c = kase(route.params[0]), d = +el.dataset.d, n = W.visits + d;
  if(n<1 || n>6) return;
  if(d<0 && W.items.some(i=>i.v>n)){ toast(t("visit_not_empty")); return; }
  W.visits = n; W.dirty = true; if(W.curV>n) W.curV = n; if(d>0) W.curV = n; rerenderPlan(c);
};
ACT.addItem = () => {
  const c = kase(route.params[0]);
  const teeth = [...W.sel].sort((a,b)=>ALL_TEETH.indexOf(a)-ALL_TEETH.indexOf(b));
  pushUndo();
  if(W.bSel){
    const b = bundle(W.bSel), it = {id:uid("i"), v:W.curV, b:b.id, teeth:b.teeth.slice()};
    W.items.push(it); W.newIds.add(it.id);
    autoExtract(c, b.imp, W.curV);
  } else {
    const x = tx(W.txSel); if(!x) return;
    const it = {id:uid("i"), v:W.curV, tx:x.id, teeth:(x.unit==="tooth"||x.unit==="side")?teeth:[]};
    if(x.brands) it.brand = (document.getElementById("brandSel")||{}).value || W.brand;
    if(x.unit==="arch") it.jaws = W.jaws.slice();
    if(x.unit==="piece"||x.unit==="mouth") it.qty = Math.max(1, +((document.getElementById("qtyIn")||{}).value) || 1);
    // aynı ziyarette aynı tedavi+marka varsa birleştir
    const same = W.items.find(i=>i.v===it.v && i.tx===it.tx && (i.brand||"")===(it.brand||"") && x.unit==="tooth");
    if(same){ it.teeth.forEach(tt=>{ if(!same.teeth.includes(tt)) same.teeth.push(tt); }); W.newIds.add(same.id); }
    else { W.items.push(it); W.newIds.add(it.id); }
    if(x.render==="implant") autoExtract(c, teeth, W.curV);
  }
  W.dirty = true; W.sel.clear(); W.bSel = null;
  rerenderPlan(c);
};
function autoExtract(c, teeth, v){
  const sit = c.situation||{}, cur = toothStates(wcase(c), "plan");
  const need = teeth.filter(tt=>{ const s = sit[tt]; const present = !s || ["intact","root","rct","crown","caries","comp","amalg","inlay","veneer","bridge","impacted","other"].includes(s.s); return present && !cur[tt].cekim && !(s && ["impab","impcr"].includes(s.s)); });
  if(!need.length) return;
  const ex = W.items.find(i=>i.v===v && i.tx==="ext_simple");
  if(ex) need.forEach(tt=>{ if(!ex.teeth.includes(tt)) ex.teeth.push(tt); });
  else { const it = {id:uid("i"), v, tx:"ext_simple", teeth:need, auto:true}; W.items.push(it); W.newIds.add(it.id); }
  toast(t("auto_ext",{teeth:need.join(", ")}));
}
ACT.rmItem = el => { pushUndo(); W.items = W.items.filter(i=>i.id!==el.dataset.id); W.dirty = true; rerenderPlan(kase(route.params[0])); };
ACT.undo = () => { if(!W.undo.length) return; W.items = W.undo.pop(); W.dirty = true; rerenderPlan(kase(route.params[0])); };
ACT.suggest = async () => {
  const c = kase(route.params[0]);
  if(W.items.length && !(await confirmBox(t("suggest"), t("suggest_replace"), t("replace")))) return;
  pushUndo(); W.items = suggestPlan(c); W.visits = Math.max(1, ...W.items.map(i=>i.v)); W.items.forEach(i=>W.newIds.add(i.id)); W.dirty = true; W.curV = 1;
  rerenderPlan(c); toast(t("suggested"));
};
ACT.saveDraft = () => { const c = kase(route.params[0]); commitWS(c); toast(t("draft_saved")); rerenderPlan(c); };
ACT.completePlan = () => {
  const c = kase(route.params[0]), rs = checkRules(wcase(c), W.items);
  const blocks = rs.filter(r=>r.sev==="block"), warns = rs.filter(r=>r.sev!=="block");
  if(blocks.length){
    openModal(`<div class="hd">${I("ban").replace("<svg",'<svg style="width:28px;height:28px;color:var(--err);flex:none"')}<div><h2>${t("cant_complete")}</h2><p class="muted small" style="margin:4px 0 0">${t("cant_complete_d")}</p></div></div><div class="bd col">${blocks.map(r=>`<div class="alert err">${I("ban")}<span><b>${r.code}</b> · ${esc(ruleText(r))}</span></div>`).join("")}</div><div class="ft"><button class="btn pri" data-act="close">${t("ok")}</button></div>`);
    return;
  }
  const finish = () => {
    closeOverlay();
    const first = c.status==="pool";
    W.dirty = true; commitWS(c);
    c.status = c.status==="sent" ? "diagnosed" : (c.status==="pool" ? "diagnosed" : c.status);
    if(!c.dentist && me().role==="dentist") c.dentist = S.me;
    c.dxAck = warns.map(r=>r.code); c.dxAt = now(); c.dxBy = S.me;
    if(!c.pricing) initPricing(c, lead(c.leadId));
    setLeadStatus(c.leadId, "plan_ready");
    addActivity(c.leadId, "dx", warns.length ? warns.map(r=>r.code).join(",") : "ok");
    save();
    if(can("price")){ toast(t("dx_done")); location.hash = `#/case/${c.id}/3`; }
    else { toast(t("dx_sent_sales")); route(); }
  };
  if(!warns.length){
    confirmBox(t("complete_dx"), t("complete_dx_d"), t("confirm")).then(ok=>{ if(ok) finish(); });
    return;
  }
  const m = openModal(`<div class="hd">${I("alert").replace("<svg",'<svg style="width:28px;height:28px;color:var(--warn);flex:none"')}<div><h2>${t("clin_warn")}</h2><p class="muted small" style="margin:4px 0 0">${t("clin_warn_d")}</p></div></div><div class="bd col">${warns.map(r=>`<div class="alert ${r.sev==="info"?"info":"warn"}">${I(r.sev==="info"?"info":"alert")}<span><b>${r.code}</b> · ${esc(ruleText(r))}</span></div>`).join("")}</div><div class="ft"><button class="btn" data-act="close">${t("go_back")}</button><button class="btn pri" id="ackGo">${t("ack_proceed")}</button></div>`);
  m.querySelector("#ackGo").onclick = finish;
};

/* ---------- ADIM 3: fiyatlandırma ---------- */
function pricingOutdated(c){ return c.pricing && c.pricing.synced !== JSON.stringify(c.items); }
function draftQuote(c){
  const l = lead(c.leadId), p = c.pricing;
  return {id:"draft", token:"", ver:S.quotes.filter(q=>q.caseId===c.id).length+1, created:now(), status:"draft", lang:p.lang, cur:p.cur, hidePrices:p.hidePrices, validUntil:now()+p.valid*DAY, note:p.note, deposit:p.deposit,
    patient:{name:l.name, country:l.country, issue:l.issue||"", med:l.medNote||""}, clinic:S.clinic, dentist:(user(c.dentist)||{}).name||"", owner:(user(l.owner)||{}).name||"",
    situation:c.situation, visits:c.visits, opts:p.opts.slice(0,p.nOpt).map(op=>({name:optName(op,p.lang), rec:!!op.rec, items:op.items, extras:op.extras, calc:calcOption(c, op, p.cur, p.lang), needsAppr:needsApproval(op)}))};
}
function viewPrice(c){
  if(!c.pricing) initPricing(c, lead(c.leadId));
  const p = c.pricing; if(W.optIdx >= p.nOpt) W.optIdx = 0;
  const op = p.opts[W.optIdx], calc = calcOption(c, op, p.cur, L_()), lim = discLimit(), over = needsApproval(op);
  const lineRow = it => {
    const x = it.tx && tx(it.tx), bl = brandList(it), lc = calcOption(c, {items:[it], extras:[]}, p.cur, L_()).lines[0];
    let ctl = "";
    const sw = it.b && BUNDLE_SWAP.find(g=>g.includes(it.b));
    if(sw) ctl = `<select class="inp sm" data-obswap="${it.id}" style="max-width:170px">${sw.map(id=>`<option value="${id}" ${it.b===id?"selected":""}>${esc(tn(bundle(id).n))}</option>`).join("")}</select>`;
    else if(bl) ctl = `<select class="inp sm" data-obrand="${it.id}" style="max-width:170px">${it.b?`<option value="">${t("std_choice")}</option>`:""}${bl.map(bb=>`<option value="${bb.id}" ${it.brand===bb.id?"selected":""}>${esc(bb.n)}</option>`).join("")}</select>`;
    else if(x && CROWN_GROUP.includes(x.id)) ctl = `<select class="inp sm" data-omat="${it.id}" style="max-width:170px">${CROWN_GROUP.map(id=>`<option value="${id}" ${it.tx===id?"selected":""}>${esc(txName(id))}</option>`).join("")}</select>`;
    return `<div class="pitem" style="padding:8px 0"><span class="dot" style="background:${vcol(it.v)}"></span><div class="grow"><div style="font-weight:550">${esc(itemName(it))}</div><div class="t">${it.teeth&&it.teeth.length&&!it.b?it.teeth.join(", "):it.jaws?it.jaws.map(j=>t(j==="u"?"jaw_u":"jaw_l")).join(" + "):""} ${lc?`· ${lc.qty} × ${fmtMoney(lc.unit,p.cur)}`:""}</div></div>${ctl}<b class="num" style="min-width:74px;text-align:end">${lc?fmtMoney(lc.total,p.cur):""}</b>${p.mode==="diff"?`<button class="btn xs ghost icon" data-act="oRm" data-id="${it.id}">${I("x")}</button>`:""}</div>`;
  };
  return `${pricingOutdated(c)?`<div class="alert warn" style="margin-bottom:12px">${I("alert")}<span class="grow">${t("plan_changed")}</span><button class="btn sm" data-act="resync">${t("resync")}</button></div>`:""}
  <div class="grid" style="grid-template-columns:minmax(340px,440px) minmax(0,1fr);align-items:start" id="prGrid">
  <div class="col" style="gap:12px">
    <div class="card"><div class="bd col">
      <div class="grid g2"><label class="f">${t("currency")}<select class="inp sm" data-pp="cur">${CURS.map(x=>`<option ${p.cur===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label class="f">${t("quote_lang")}<select class="inp sm" data-pp="lang">${LANGS.map(x=>`<option value="${x}" ${p.lang===x?"selected":""}>${LANG_NAMES[x]}</option>`).join("")}</select></label></div>
      <div class="row wrap between"><span class="small muted">${t("n_options")}</span><div class="seg">${[1,2,3].map(n=>`<button class="${p.nOpt===n?"on":""}" data-act="nOpt" data-v="${n}">${n}</button>`).join("")}</div></div>
      ${p.nOpt>1?`<div class="seg" style="width:100%"><button style="flex:1" class="${p.mode==="mat"?"on":""}" data-act="pMode" data-v="mat">${t("mode_mat")}</button><button style="flex:1" class="${p.mode==="diff"?"on":""}" data-act="pMode" data-v="diff">${t("mode_diff")}</button></div>`:""}
    </div></div>
    ${p.nOpt>1?`<div class="row wrap" style="gap:6px">${p.opts.slice(0,p.nOpt).map((o,i)=>{ const cc = calcOption(c,o,p.cur,L_()); return `<button class="vtab ${W.optIdx===i?"on":""}" data-act="optIdx" data-v="${i}" style="flex:1;flex-direction:column;align-items:flex-start;height:auto;padding:8px 12px">${o.rec?`<span class="bdg brand">★ ${t("recommended")}</span>`:""}<span>${esc(optName(o,L_()))}</span><span class="num" style="font-weight:700">${fmtMoney(cc.total,p.cur)}</span></button>`; }).join("")}</div>`:""}
    <div class="card"><div class="hd"><select class="inp sm" data-op="name" style="width:auto">${["opt_std","opt_rec","opt_prem","opt_custom"].map(k=>`<option value="${k}" ${(op.custom?"opt_custom":op.name)===k?"selected":""}>${t(k)}</option>`).join("")}</select>${op.custom||op.name==="opt_custom"?`<input class="inp sm" data-op="custom" value="${esc(op.custom)}" placeholder="${t("opt_custom")}">`:""}<span class="grow"></span><button class="chip ${op.rec?"on":""}" data-act="oRec">★ ${t("recommended")}</button></div>
      <div class="bd" style="padding-top:4px">${op.items.length?op.items.slice().sort((a,b)=>a.v-b.v).map(lineRow).join(""):`<div class="empty small">${t("no_items")}</div>`}
        <div class="small muted" style="margin:12px 0 6px">${t("extras")}</div>
        ${op.extras.map(e=>`<div class="pitem" style="padding:6px 0"><span class="dot" style="background:${vcol(e.v)}"></span><span class="grow">${esc(e.manual?e.name:itemName(e))} × ${e.qty||1}</span>${e.manual?`<b class="num">${fmtMoney((+e.price||0)*(e.qty||1),p.cur)}</b>`:""}<button class="btn xs ghost icon" data-act="exRm" data-id="${e.id}">${I("x")}</button></div>`).join("")}
        <div class="row" style="gap:6px;margin-top:6px"><select class="inp sm grow" id="exTx"><option value="">${t("add_extra")}…</option>${S.catalog.tx.filter(x=>x.active && ["piece","mouth","arch"].includes(x.unit)).map(x=>`<option value="${x.id}">${esc(tn(x.n))}</option>`).join("")}<option value="__m">✎ ${t("manual_item")}</option></select><select class="inp sm" id="exV" style="width:auto">${Array.from({length:c.visits},(_,k)=>`<option value="${k+1}">V${k+1}</option>`).join("")}</select><button class="btn sm" data-act="exAdd">${I("plus")}</button></div>
        <div class="row hide" id="exMan" style="gap:6px;margin-top:6px"><input class="inp sm grow" id="exN" placeholder="${t("item_name")}"><input class="inp sm" id="exP" type="number" placeholder="${p.cur}" style="width:100px"></div>
      </div></div>
    <div class="card"><div class="hd"><h3 class="grow">${t("package_incl")}</h3></div><div class="bd col">
      <div class="row"><span class="grow small">${I("desk").replace("<svg","<svg style='width:14px;height:14px'")} ${t("hotel_nights")}</span><input class="inp sm" type="number" min="0" data-op="hotelN" value="${op.hotel.n}" style="width:70px"><label class="row small" style="gap:6px"><span class="switch"><input type="checkbox" data-op="hotelFree" ${op.hotel.free?"checked":""}><span></span></span>${t("free")}</label></div>
      <div class="row"><span class="grow small">${I("plane").replace("<svg","<svg style='width:14px;height:14px'")} ${t("vip_transfer")}</span><label class="switch"><input type="checkbox" data-op="trOn" ${op.transfer.on?"checked":""}><span></span></label><label class="row small" style="gap:6px"><span class="switch"><input type="checkbox" data-op="trFree" ${op.transfer.free?"checked":""}><span></span></span>${t("free")}</label></div>
    </div></div>
    <div class="card"><div class="hd"><h3 class="grow">${t("discount")}</h3><span class="bdg ${over?"warn":""}">${t("your_limit",{n:lim})}</span></div><div class="bd col">
      <div class="row"><input type="range" min="0" max="30" step="1" data-op="disc" value="${op.disc}" class="grow"><input class="inp sm" type="number" min="0" max="100" data-op="disc" value="${op.disc}" style="width:70px"><span>%</span></div>
      ${over?`<div class="alert warn">${I("lock")}<span class="grow">${t("needs_approval",{n:lim})}</span>${can("approve")?`<button class="btn sm" data-act="approve">${t("approve")}</button>`:`<button class="btn sm" data-act="reqAppr" ${op.reqAppr?"disabled":""}>${op.reqAppr?t("appr_requested"):t("request_appr")}</button>`}</div>`:op.approved?`<div class="alert ok">${I("ok")}<span>${t("approved_by",{n:(user(op.approved)||{}).name||""})}</span></div>`:""}
    </div></div>
    <div class="card"><div class="bd col" style="gap:4px">
      <div class="row small"><span class="grow muted">${t("subtotal")}</span><span class="num">${fmtMoney(calc.sub,p.cur)}</span></div>
      ${calc.tierAdj?`<div class="row small" style="color:var(--ok)"><span class="grow">${t("tier_adv",{n:calc.tierInfo.n})}</span><span class="num">−${fmtMoney(calc.tierAdj,p.cur)}</span></div>`:""}
      ${calc.disc?`<div class="row small" style="color:var(--ok)"><span class="grow">${t("discount")} %${calc.discPct}</span><span class="num">−${fmtMoney(calc.disc,p.cur)}</span></div>`:""}
      ${calc.rnd?`<div class="row small"><span class="grow muted">${t("rounding")}</span><span class="num">${calc.rnd>0?"+":"−"}${fmtMoney(Math.abs(calc.rnd),p.cur)}</span></div>`:""}
      <div class="row" style="font-size:18px;font-weight:750;padding-top:6px;border-top:1px solid var(--line)"><span class="grow">${t("total")}</span><span class="num" style="color:var(--brand)">${fmtMoney(calc.total,p.cur)}</span></div>
      <div class="row small"><span class="grow muted">${t("deposit")} (%${p.deposit})</span><span class="num">${fmtMoney(calc.deposit,p.cur)}</span></div>
      ${calc.pay.map(x=>`<div class="row small"><span class="dot" style="background:${vcol(x.v)}"></span><span class="grow muted">${t("pay_at_visit",{n:x.v})}</span><span class="num">${fmtMoney(x.amount,p.cur)}</span></div>`).join("")}
    </div></div>
    <div class="card"><div class="bd col">
      <div class="grid g2"><label class="f">${t("deposit")} %<input class="inp sm" type="number" min="0" max="100" data-pp="deposit" value="${p.deposit}"></label><label class="f">${t("valid_days")}<input class="inp sm" type="number" min="1" max="365" data-pp="valid" value="${p.valid}"></label></div>
      <label class="row small" style="gap:8px"><span class="switch"><input type="checkbox" data-pp="hidePrices" ${p.hidePrices?"checked":""}><span></span></span>${t("hide_prices")}</label>
      <label class="f">${t("patient_note")}<textarea class="inp" data-pp="note" placeholder="${t("patient_note_ph")}">${esc(p.note)}</textarea></label>
    </div></div>
    <div class="row"><a class="btn" href="#/case/${c.id}/2">← ${t("step_plan")}</a><span class="grow"></span><a class="btn pri" href="#/case/${c.id}/4">${t("review_send")} →</a></div>
  </div>
  <div style="position:sticky;top:70px"><div class="row small muted" style="margin-bottom:6px">${I("eye").replace("<svg","<svg style='width:14px;height:14px'")} ${t("live_preview")} · ${LANG_NAMES[p.lang]}</div><div class="docwrap" id="docPrev" style="max-height:calc(100vh - 110px)">${docHTML(draftQuote(c), {draft:true})}</div></div>
  </div>`;
}
function rerenderPrice(c, keepFocus){
  const a = document.activeElement, attr = a && a.dataset && (a.dataset.op ? "op" : a.dataset.pp ? "pp" : null), sc = scrollY;
  const key = attr && a.dataset[attr], tag = a && a.tagName, typ = a && a.getAttribute && a.getAttribute("type");
  const pg = document.getElementById("page"); pg.innerHTML = viewCase(c.id, 3); wireCase(c, 3); scrollTo(0, sc);
  if(keepFocus && key){ const n = [...pg.querySelectorAll(`[data-${attr}="${key}"]`)].find(x=>x.tagName===tag && x.getAttribute("type")===typ); if(n){ n.focus(); if(n.setSelectionRange && (n.type==="text"||n.tagName==="TEXTAREA")){ const l = n.value.length; try{ n.setSelectionRange(l,l); }catch(e){} } } }
}
function wirePrice(c){
  const p = c.pricing, op = () => p.opts[W.optIdx];
  let tm = 0; const later = (fn) => { clearTimeout(tm); tm = setTimeout(fn, 160); };
  document.querySelectorAll("[data-pp]").forEach(el=>{
    const ev = el.tagName==="TEXTAREA" || el.type==="number" ? "input" : "change";
    el.addEventListener(ev, ()=>{ const k = el.dataset.pp; p[k] = el.type==="checkbox" ? el.checked : el.type==="number" ? +el.value : el.value; save();
      if(k==="note"){ later(()=>{ document.getElementById("docPrev").innerHTML = docHTML(draftQuote(c), {draft:true}); }); } else later(()=>rerenderPrice(c, true)); });
  });
  document.querySelectorAll("[data-op]").forEach(el=>{
    if(el.type==="range") el.addEventListener("input", ()=>{ const n = el.parentNode.querySelector('input[type="number"]'); if(n) n.value = el.value; });
    const ev = el.type==="number" || el.type==="text" ? "input" : "change";
    el.addEventListener(ev, ()=>{ const o = op(), k = el.dataset.op;
      if(k==="name"){ if(el.value==="opt_custom"){ o.custom = o.custom || t("opt_custom"); } else { o.name = el.value; o.custom = ""; } }
      if(k==="custom") o.custom = el.value;
      if(k==="hotelN") o.hotel.n = Math.max(0, +el.value||0);
      if(k==="hotelFree") o.hotel.free = el.checked;
      if(k==="trOn") o.transfer.on = el.checked;
      if(k==="trFree") o.transfer.free = el.checked;
      if(k==="disc"){ o.disc = Math.max(0, Math.min(100, +el.value||0)); o.approved = null; o.reqAppr = false; }
      save(); later(()=>rerenderPrice(c, true));
    });
  });
  document.querySelectorAll("[data-obrand]").forEach(el=> el.onchange = () => { const it = op().items.find(i=>i.id===el.dataset.obrand); it.brand = el.value; save(); rerenderPrice(c); });
  document.querySelectorAll("[data-obswap]").forEach(el=> el.onchange = () => { const it = op().items.find(i=>i.id===el.dataset.obswap); it.b = el.value; it.teeth = bundle(el.value).teeth.slice(); save(); rerenderPrice(c); });
  document.querySelectorAll("[data-omat]").forEach(el=> el.onchange = () => { const it = op().items.find(i=>i.id===el.dataset.omat); it.tx = el.value; save(); rerenderPrice(c); });
  const ex = document.getElementById("exTx"); if(ex) ex.onchange = () => document.getElementById("exMan").classList.toggle("hide", ex.value!=="__m");
}
ACT.nOpt = el => { const c = kase(route.params[0]), p = c.pricing, n = +el.dataset.v; while(p.opts.length<n) p.opts.push(makeOpt(c, p.opts.length)); p.nOpt = n; const ri = n>1 ? 1 : 0; p.opts.forEach((o,i)=> o.rec = i===ri); W.optIdx = Math.min(W.optIdx, n-1); save(); rerenderPrice(c); };
ACT.pMode = el => { const c = kase(route.params[0]); c.pricing.mode = el.dataset.v; save(); rerenderPrice(c); };
ACT.optIdx = el => { W.optIdx = +el.dataset.v; rerenderPrice(kase(route.params[0])); };
ACT.oRec = () => { const c = kase(route.params[0]), p = c.pricing; p.opts.forEach((o,i)=>o.rec = i===W.optIdx); save(); rerenderPrice(c); };
ACT.oRm = el => { const c = kase(route.params[0]), o = c.pricing.opts[W.optIdx]; o.items = o.items.filter(i=>i.id!==el.dataset.id); save(); rerenderPrice(c); };
ACT.exAdd = () => {
  const c = kase(route.params[0]), o = c.pricing.opts[W.optIdx], v = +document.getElementById("exV").value, sel = document.getElementById("exTx").value;
  if(!sel) return;
  if(sel==="__m"){ const n = document.getElementById("exN").value.trim(), pr = +document.getElementById("exP").value; if(!n) return document.getElementById("exN").focus(); o.extras.push({id:uid("e"), manual:true, name:n, price:pr, qty:1, v}); }
  else { const x = tx(sel); o.extras.push({id:uid("e"), tx:sel, v, qty:1, jaws:x.unit==="arch"?["u"]:undefined}); }
  save(); rerenderPrice(c);
};
ACT.exRm = el => { const c = kase(route.params[0]), o = c.pricing.opts[W.optIdx]; o.extras = o.extras.filter(e=>e.id!==el.dataset.id); save(); rerenderPrice(c); };
ACT.approve = () => { const c = kase(route.params[0]), o = c.pricing.opts[W.optIdx]; o.approved = S.me; o.reqAppr = false; save(); toast(t("approved")); rerenderPrice(c); };
ACT.reqAppr = () => { const c = kase(route.params[0]), o = c.pricing.opts[W.optIdx], l = lead(c.leadId); o.reqAppr = true; const mgr = S.users.find(u=>u.role==="manager") || S.users[0];
  S.tasks.unshift({id:uid("t"), title:t("appr_task",{name:l.name, n:o.disc}), due:now()+2*36e5, prio:"high", type:"general", leadId:l.id, owner:mgr.id, done:false, auto:true}); save(); toast(t("appr_requested")); rerenderPrice(c); };
ACT.resync = () => { const c = kase(route.params[0]), p = c.pricing; p.opts = p.opts.map((o,i)=>{ const n = makeOpt(c, i); return Object.assign(n, {name:o.name, custom:o.custom, rec:o.rec, disc:o.disc, hotel:o.hotel, transfer:o.transfer, extras:o.extras, approved:o.approved}); }); p.synced = JSON.stringify(c.items); save(); toast(t("resynced")); rerenderPrice(c); };

/* ---------- ADIM 4: incele & gönder ---------- */
const BANNED = /\b(garanti\w*|guarantee\w*|ağrısız|painless|schmerzfrei|risksiz|risk-free|en iyi|the best|100\s?%|%\s?100|kesin sonuç|ömür boyu)\b/i;
function reviewChecks(c){
  const p = c.pricing, rs = checkRules(c, c.items), list = [];
  const blocks = rs.filter(r=>r.sev==="block");
  list.push({ok:!blocks.length, txt: blocks.length ? t("chk_blocks",{n:blocks.length}) : t("chk_rules_ok")});
  const appr = p.opts.slice(0,p.nOpt).filter(needsApproval);
  list.push({ok:!appr.length, txt: appr.length ? t("chk_appr",{n:appr.map(o=>optName(o,L_())).join(", ")}) : t("chk_appr_ok")});
  const bw = (p.note||"").match(BANNED);
  list.push({ok:!bw, warn:true, txt: bw ? t("chk_banned",{w:bw[0]}) : t("chk_banned_ok")});
  const miss = p.opts.slice(0,p.nOpt).some(o=>calcOption(c,o,p.cur,p.lang).missing);
  list.push({ok:!miss, txt: miss ? t("chk_missing") : t("chk_prices_ok")});
  list.push({ok:!pricingOutdated(c), txt: pricingOutdated(c) ? t("plan_changed") : t("chk_sync_ok")});
  return list;
}
let lastQuoteId = null;
function viewReview(c){
  if(!c.pricing) initPricing(c, lead(c.leadId));
  const checks = reviewChecks(c), ready = checks.every(x=>x.ok || x.warn);
  const qs = S.quotes.filter(q=>q.caseId===c.id), last = lastQuoteId ? byId(S.quotes, lastQuoteId) : null;
  const l = lead(c.leadId);
  return `<div class="grid" style="grid-template-columns:minmax(0,1fr) 360px;align-items:start" id="rvGrid">
    <div class="docwrap">${docHTML(last && last.caseId===c.id ? last : draftQuote(c), {draft:!(last && last.caseId===c.id)})}</div>
    <div class="col" style="gap:12px;position:sticky;top:70px">
      <div class="card"><div class="hd"><h2 class="grow">${t("pre_send")}</h2></div><div class="bd col" style="gap:8px">${checks.map(x=>`<div class="row small" style="align-items:flex-start"><span style="color:${x.ok?"var(--ok)":x.warn?"var(--warn)":"var(--err)"}">${I(x.ok?"ok":x.warn?"alert":"ban").replace("<svg","<svg style='width:16px;height:16px'")}</span><span>${esc(x.txt)}</span></div>`).join("")}</div></div>
      ${last && last.caseId===c.id ? `<div class="card" style="border-color:var(--ok)"><div class="hd"><h2 class="grow" style="color:var(--ok)">${I("ok").replace("<svg","<svg style='width:18px;height:18px'")} ${t("quote_ready",{v:last.ver})}</h2></div><div class="bd col">
          <div class="row"><input class="inp sm" readonly value="${esc(quoteURL(last))}" onclick="this.select()"><button class="btn sm icon" data-act="copyLink" data-id="${last.id}" title="${t("copy")}">${I("copy")}</button></div>
          <div class="grid g2"><button class="btn" style="color:#16A34A" data-act="sendWA" data-id="${last.id}">${I("wa")}WhatsApp</button><button class="btn" data-act="sendMail" data-id="${last.id}">${I("mail")}E-mail</button>
          <button class="btn" data-act="printQ" data-id="${last.id}">${I("print")}PDF</button><a class="btn" href="#/p/${last.token}?preview=1">${I("eye")}${t("preview")}</a></div>
          <a class="btn pri" href="#/p/${last.token}" title="${t("open_as_patient_tip")}">${t("open_as_patient")} →</a>
          <div class="tiny muted">${t("preview_no_count")}</div></div></div>`
        : `<div class="card"><div class="bd col"><div class="small muted">${t("send_to",{name:l.name})}</div><button class="btn pri" data-act="createQuote" ${ready?"":"disabled"} style="height:42px">${I("send")}${t("create_quote")}</button>${ready?"":`<div class="tiny" style="color:var(--err)">${t("fix_first")}</div>`}<a class="btn" href="#/case/${c.id}/3">← ${t("step_price")}</a></div></div>`}
      ${qs.length?`<div class="card"><div class="hd"><h3 class="grow">${t("versions")}</h3></div><div class="bd col">${qs.map(q=>`<a class="row small" href="#/p/${q.token}?preview=1" style="color:inherit"><b>v${q.ver}</b><span class="grow muted">${fmtDT(q.created)}</span>${qBadge(q.status)}</a>`).join("")}</div></div>`:""}
    </div></div>`;
}
const quoteURL = q => location.href.split("#")[0] + "#/p/" + q.token;
ACT.createQuote = () => { const c = kase(route.params[0]); const q = createQuote(c); lastQuoteId = q.id; S.tasks.forEach(x=>{ if(x.leadId===c.leadId && x.title==="wf_send") x.done = true; }); save(); toast(t("quote_created")); route(); };
ACT.copyLink = el => copyText(quoteURL(byId(S.quotes, el.dataset.id)));
function patientMsg(q, kind){ return t(kind==="mail"?"mail_body":"wa_body", {name:q.patient.name.split(" ")[0], clinic:q.clinic.name, link:quoteURL(q), date:fmtDate(q.validUntil, q.lang)}, q.lang); }
ACT.sendWA = el => { const q = byId(S.quotes, el.dataset.id), l = lead(q.leadId); window.open(`https://wa.me/${(l.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(patientMsg(q,"wa"))}`, "_blank", "noopener"); addActivity(l.id, "sent", "WhatsApp"); save(); };
ACT.sendMail = el => { const q = byId(S.quotes, el.dataset.id), l = lead(q.leadId); location.href = `mailto:${encodeURIComponent(l.email||"")}?subject=${encodeURIComponent(t("mail_subj",{clinic:q.clinic.name},q.lang))}&body=${encodeURIComponent(patientMsg(q,"mail"))}`; addActivity(l.id, "sent", "E-mail"); save(); };
ACT.printQ = el => printQuote(byId(S.quotes, el.dataset.id));

function wireCase(c, step){
  const dsel = document.getElementById("dentSel"); if(dsel) dsel.onchange = () => { c.dentist = dsel.value || null; save(); toast(t("saved")); };
  if(step===1 || step===2) wireChart(c);
  if(step===2){
    const q = document.getElementById("txQ"); if(q) q.oninput = () => { W.q = q.value; const pos = q.selectionStart; rerenderPlan(c); const n = document.getElementById("txQ"); n.focus(); n.setSelectionRange(pos,pos); };
    const bs = document.getElementById("brandSel"); if(bs) bs.onchange = () => { W.brand = bs.value; };
    const qi = document.getElementById("qtyIn"); if(qi) qi.oninput = () => { W.qty = +qi.value||1; };
    document.querySelectorAll("[data-mv]").forEach(s=> s.onchange = () => { pushUndo(); const it = W.items.find(i=>i.id===s.dataset.mv); it.v = +s.value; W.dirty = true; rerenderPlan(c); });
  }
  if(step===3) wirePrice(c);
}
