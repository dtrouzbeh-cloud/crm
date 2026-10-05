/* =====================================================================
   TEKLİF DOKÜMANI + HASTA SAYFASI + PDF
   ===================================================================== */
function optBlock(q, op, lang, o){
  const T = (k,p) => t(k,p,lang), M = v => fmtMoney(v, q.cur, lang), hide = q.hidePrices;
  const src = {situation:q.situation}, st = toothStates(src, "plan", op.items), c = op.calc;
  let h = `<div class="chartwrap">${chartSVG(st, {spans:spansFor(src, op.items, lang)})}</div><div class="legend" style="color:#55636D">${withLang(lang, ()=>legendHTML(st))}</div>`;
  c.visits.forEach(vv=>{
    if(!vv.lines.length) return;
    h += `<div class="vh"><span class="dot" style="background:${vcol(vv.v)}"></span>${T("visit_n",{n:vv.v})}<span style="font-weight:400;color:#7A8790;font-size:11px">· ${T("stay_days",{a:stayDays(vv)[0],b:stayDays(vv)[1]})}</span></div>
    <table><thead><tr><th>${T("treatment")}</th><th>${T("teeth")}</th><th class="r">${T("qty")}</th>${hide?"":`<th class="r">${T("unit_price")}</th><th class="r">${T("amount")}</th>`}</tr></thead><tbody>
    ${vv.lines.map(l=>`<tr><td><b style="font-weight:600">${esc(l.nm)}</b>${l.br?`<div style="color:#7A8790;font-size:10.5px">${esc(l.br)}</div>`:""}</td><td style="color:#55636D">${l.b?T("package"):l.teeth.length?l.teeth.join(", "):l.jaws.length?l.jaws.map(j=>T(j==="u"?"jaw_u":"jaw_l")).join(" + "):"—"}</td><td class="r">${l.qty} <span style="color:#7A8790;font-size:10px">${esc(l.unitL)}</span></td>${hide?"":`<td class="r">${l.manual&&!l.unit?`<span style="color:#B42318">${T("price_tbd")}</span>`:M(l.unit)}</td><td class="r"><b>${M(l.total)}</b></td>`}</tr>`).join("")}</tbody></table>`;
  });
  if(c.pkg.length) h += `<div class="vh">${T("package_incl")}</div><table><tbody>${c.pkg.map(p=>`<tr><td>${esc(p.nm)}</td><td class="r">${hide?"":p.free?`<b style="color:var(--c1)">${T("included")}</b>`:M(p.total)}</td></tr>`).join("")}</tbody></table>`;
  if(hide) h += `<div class="note">${T("prices_soon")}</div>`;
  else {
    h += `<table class="tot" style="margin-top:12px;width:56%;margin-inline-start:auto"><tbody>
      <tr><td>${T("subtotal")}</td><td class="r">${M(c.sub)}</td></tr>
      ${c.tierAdj?`<tr><td style="color:var(--c1)">${T("tier_adv",{n:c.tierInfo.n})}</td><td class="r" style="color:var(--c1)">−${M(c.tierAdj)}</td></tr>`:""}
      ${c.disc?`<tr><td style="color:var(--c1)">${T("special_disc",{n:c.discPct})}</td><td class="r" style="color:var(--c1)">−${M(c.disc)}</td></tr>`:""}
      ${c.rnd?`<tr><td style="color:#7A8790">${T("rounding")}</td><td class="r" style="color:#7A8790">${c.rnd>0?"+":"−"}${M(Math.abs(c.rnd))}</td></tr>`:""}
      <tr class="g"><td>${T("total")}</td><td class="r">${M(c.total)}</td></tr></tbody></table>`;
    h += `<h3>${T("pay_plan")}</h3><table><tbody><tr><td>${T("deposit_book")}</td><td class="r"><b>${M(c.deposit)}</b></td></tr>${c.pay.map(p=>`<tr><td><span class="dot" style="background:${vcol(p.v)}"></span> ${T("pay_at_visit",{n:p.v})}</td><td class="r">${M(p.amount)}</td></tr>`).join("")}</tbody></table>`;
  }
  if(c.visits.length>1){
    h += `<h3>${T("timeline_t")}</h3><div class="tl">` + c.visits.map((vv,i)=>`${i?`<div class="g">→<br>${esc(gapText(q, op.items, lang))}</div>`:""}<div class="s" style="border-top:3px solid ${vcol(vv.v)}"><b>${T("visit_n",{n:vv.v})}</b><br>${T("stay_days",{a:stayDays(vv)[0],b:stayDays(vv)[1]})}</div>`).join("") + `</div>`;
  }
  return h;
}
function withLang(lang, fn){ const prev = S.ui.lang; S.ui.lang = lang; try{ return fn(); } finally{ S.ui.lang = prev; } }

function docHTML(q, o){
  o = o||{};
  const lang = q.lang, T = (k,p) => t(k,p,lang), M = v => fmtMoney(v, q.cur, lang);
  const draft = o.draft || q.status==="draft" || q.opts.some(x=>x.needsAppr);
  const multi = q.opts.length > 1;
  let h = `<div class="doc" style="--c1:${q.clinic.color||"#0E7C86"}" dir="${lang==="ar"?"rtl":"ltr"}" lang="${lang}">${draft?`<div class="wm"><span>${T("draft_wm")}</span></div>`:""}
  <div class="dhead"><div><div class="dlogo"><i>${I("tooth").replace("<svg",'<svg style="width:20px;height:20px"')}</i>${esc(q.clinic.name)}</div><div style="color:#7A8790;font-size:10.5px;margin-top:4px">${esc(q.clinic.address||"")} · ${esc(q.clinic.city||"")}</div></div>
  <div class="meta"><span>${T("quote_no")}</span><b>${q.id==="draft"?"—":esc(q.id)}-v${q.ver}</b><span>${T("date")}</span><b>${fmtDate(q.created, lang)}</b><span>${T("valid_until")}</span><b>${fmtDate(q.validUntil, lang)}</b>${q.dentist?`<span>${T("dentist")}</span><b>${esc(q.dentist)}</b>`:""}${q.owner?`<span>${T("coordinator")}</span><b>${esc(q.owner)}</b>`:""}</div></div>
  <div style="margin:22px 0 6px"><div style="color:#7A8790;font-size:11px;text-transform:uppercase;letter-spacing:.08em">${T("plan_for")}</div><h1>${esc(q.patient.name)}</h1></div>
  <p>${T("intro",{name:q.patient.name.split(" ")[0], clinic:q.clinic.name})}</p>
  ${q.note?`<div class="note">${esc(q.note)}</div>`:""}
  ${q.patient.issue?`<h2>${T("you_shared")}</h2><p style="margin:0">${esc(q.patient.issue)}</p>`:""}`;
  if(multi){
    h += `<h2>${T("your_options")}</h2><div class="opts">${q.opts.map(op=>`<div class="opt ${op.rec?"rec":""}">${op.rec?`<span class="tag">★ ${T("recommended")}</span>`:""}<div style="font-weight:650">${esc(op.name)}</div>${q.hidePrices?"":`<div class="p">${M(op.calc.total)}</div>`}<div style="color:#7A8790;font-size:10.5px">${T("n_visits",{n:op.calc.visits.filter(v=>v.lines.length).length})} · ${T("n_items",{n:op.calc.lines.length})}</div><div style="font-size:10.5px;margin-top:4px">${[...new Set(op.calc.lines.map(l=>l.br).filter(Boolean))].slice(0,3).map(esc).join(" · ")}</div></div>`).join("")}</div>`;
  }
  q.opts.forEach((op,i)=>{
    h += `<h2 class="${i&&o.print?"pb":""}">${multi?`${T("option")} ${i+1} · ${esc(op.name)}`:T("your_plan")}${op.rec&&multi?` <span style="font-size:10px;background:var(--c1);color:#fff;border-radius:999px;padding:2px 8px;vertical-align:2px">★ ${T("recommended")}</span>`:""}</h2>` + optBlock(q, op, lang, o);
  });
  h += `<h2>${T("whats_included")}</h2><div class="incl">${["inc_consult","inc_xray","inc_coord","inc_aftercare"].map(k=>`<div>${T(k)}</div>`).join("")}${q.opts[0] && q.opts[0].calc.pkg.map(p=>`<div>${esc(p.nm)}</div>`).join("")}</div>
  <h2>${T("next_steps")}</h2><ol style="margin:0;padding-inline-start:18px">${["ns_1","ns_2","ns_3"].map(k=>`<li>${T(k,{dep:q.deposit})}</li>`).join("")}</ol>
  <div class="foot"><span>${esc(q.clinic.legal||q.clinic.name)} · ${esc(q.clinic.phone||"")} · ${esc(q.clinic.email||"")} · ${esc(q.clinic.web||"")}</span><span>${T("disclaimer")}</span></div></div>`;
  return h;
}

function printQuote(q){
  const pr = document.getElementById("print");
  pr.innerHTML = docHTML(q, {print:true});
  setTimeout(()=>{ window.print(); }, 60);
}

/* ---------------- HASTA SAYFASI ---------------- */
let PV = {opt:null, lang:null, tick:0};
function viewPatient(tok, preview){
  const q = S.quotes.find(x=>x.token===tok);
  if(!q) return `<div class="pp" style="--c1:${S.clinic.color}"><div class="hero"><div class="in"><h1 style="color:#fff">${t("link_invalid")}</h1></div></div></div>`;
  if(PV.tok!==tok){ PV = {tok, opt:Math.max(0, q.opts.findIndex(o=>o.rec)), lang:q.lang}; }
  if(!preview && !PV.counted){ PV.counted = true; q.views = (q.views||0)+1; if(q.status==="sent"){ q.status = "viewed"; q.viewedAt = now(); addActivity(q.leadId, "viewed", "v"+q.ver); } save(); }
  const lang = PV.lang, T = (k,p) => t(k,p,lang), M = v => fmtMoney(v, q.cur, lang);
  const op = q.opts[PV.opt] || q.opts[0];
  const expired = now() > q.validUntil, decided = ["accepted","declined","changes"].includes(q.status), superseded = q.status==="superseded";
  const multi = q.opts.length>1;
  const banner = q.status==="accepted" ? `<div class="pc" style="border:2px solid #10B981"><h2 style="color:#0F8A5F">✓ ${T("pp_accepted")}</h2><p style="margin:6px 0 0">${T("pp_accepted_d",{opt:(q.opts[q.response.opt]||q.opts[0]).name})}</p></div>`
    : q.status==="changes" ? `<div class="pc" style="border:2px solid #F59E0B"><h2>${T("pp_changes")}</h2><p style="margin:6px 0 0">${T("pp_changes_d")}</p></div>`
    : q.status==="declined" ? `<div class="pc"><h2>${T("pp_declined")}</h2></div>`
    : superseded ? `<div class="pc" style="border:2px solid #F59E0B"><h2>${T("pp_superseded")}</h2></div>` : expired ? `<div class="pc"><h2>${T("pp_expired")}</h2></div>` : "";
  return `<div class="pp" style="--c1:${q.clinic.color}" dir="${lang==="ar"?"rtl":"ltr"}" lang="${lang}">
  ${preview?`<div class="prevbar">${I("eye").replace("<svg","<svg style='width:15px;height:15px'")} ${t("pv_bar")} <a href="#/case/${q.caseId}/4" class="btn xs" style="background:#fff;color:#102027;border:0">${t("back_crm")}</a></div>`:""}
  <div class="hero"><div class="in">
    <div class="row between wrap" style="gap:12px"><div class="row" style="gap:10px;font-weight:750;font-size:17px"><span style="width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,.18);display:grid;place-items:center">${I("tooth").replace("<svg",'<svg style="width:20px;height:20px"')}</span>${esc(q.clinic.name)}</div>
    <select id="ppLang" class="inp sm" style="width:auto;background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.3)">${LANGS.map(l=>`<option value="${l}" ${l===lang?"selected":""} style="color:#000">${LANG_NAMES[l]}</option>`).join("")}</select></div>
    <div style="margin-top:26px;opacity:.85;font-size:13px;letter-spacing:.06em;text-transform:uppercase">${T("pp_title")}</div>
    <h1 style="font-size:30px;margin-top:4px;color:#fff">${esc(q.patient.name)}</h1>
    ${!decided && !expired && !superseded ? `<div style="margin-top:16px"><div style="font-size:12px;opacity:.85;margin-bottom:6px">${T("offer_valid")}</div><div class="cd" id="cd"></div></div>` : ""}
  </div></div>
  <div class="body">
    ${banner}
    <div class="pc"><p style="margin:0">${T("intro",{name:q.patient.name.split(" ")[0], clinic:q.clinic.name})}</p>${q.note?`<div class="doc" style="all:unset"><div style="border-inline-start:3px solid var(--c1);background:#F5F8F9;padding:8px 12px;border-radius:8px;margin-top:10px">${esc(q.note)}</div></div>`:""}</div>
    ${multi?`<div class="ptabs">${q.opts.map((o,i)=>`<button class="${i===PV.opt?"on":""}" data-act="ppOpt" data-v="${i}">${o.rec?`<span style="font-size:11px;font-weight:700;color:var(--c1)">★ ${T("recommended")}</span><br>`:""}<b>${esc(o.name)}</b>${q.hidePrices?"":`<div class="p">${M(o.calc.total)}</div>`}</button>`).join("")}</div>`:""}
    <div class="pc doc fluid" style="box-shadow:none;padding:20px;width:auto">${optBlock(q, op, lang, {})}</div>
    <div class="pc"><h2 style="font-size:16px;margin-bottom:10px">${T("whats_included")}</h2><div class="doc" style="all:unset;display:block"><div class="incl" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:13px">${["inc_consult","inc_xray","inc_coord","inc_aftercare"].map(k=>`<div>${T(k)}</div>`).join("")}${op.calc.pkg.map(p=>`<div>${esc(p.nm)}</div>`).join("")}</div></div></div>
    <div class="pc"><h2 style="font-size:16px;margin-bottom:10px">${T("faq")}</h2>${["faq1","faq2","faq3"].map(k=>`<details style="border-top:1px solid #E3E8EC;padding:10px 0"><summary style="cursor:pointer;font-weight:600">${T(k+"q")}</summary><p style="margin:8px 0 0;color:#55636D">${T(k+"a")}</p></details>`).join("")}</div>
    <div class="pc row wrap between"><div><b>${esc(q.clinic.name)}</b><div class="small" style="color:#55636D">${esc(q.clinic.phone)} · ${esc(q.clinic.email)}</div></div><button class="btn" data-act="ppPdf">${I("download")}${T("download_pdf")}</button></div>
  </div>
  ${!decided && !expired && !superseded ? `<div class="sticky"><button class="btn" data-act="ppDecline">${T("decline")}</button><button class="btn" data-act="ppChanges">${T("req_changes")}</button><button class="btn pri" data-act="ppAccept" style="background:var(--c1);border-color:var(--c1);min-width:200px;height:42px">${T("accept_plan")}${multi?` · ${esc(op.name)}`:""}</button></div>` : ""}
  </div>`;
}
function wirePatient(tok){
  const q = S.quotes.find(x=>x.token===tok); if(!q) return;
  const sel = document.getElementById("ppLang"); if(sel) sel.onchange = () => { PV.lang = sel.value; route(); };
  const cd = document.getElementById("cd");
  const draw = () => { if(!cd.isConnected){ clearInterval(PV.tick); return; } let s = Math.max(0, Math.floor((q.validUntil-now())/1000)); const d = Math.floor(s/86400); s%=86400; const h = Math.floor(s/3600); s%=3600; const m = Math.floor(s/60); s%=60;
    cd.innerHTML = [[d,"cd_d"],[h,"cd_h"],[m,"cd_m"],[s,"cd_s"]].map(([v,k])=>`<div><b class="num">${String(v).padStart(2,"0")}</b><span style="font-size:10px;opacity:.85">${t(k,null,PV.lang)}</span></div>`).join(""); };
  clearInterval(PV.tick); if(cd){ draw(); PV.tick = setInterval(draw, 1000); }
}
ACT.ppOpt = el => { PV.opt = +el.dataset.v; route(); };
ACT.ppPdf = () => { const q = S.quotes.find(x=>x.token===PV.tok); printQuote(Object.assign({}, q, {lang:PV.lang})); };
ACT.ppAccept = () => {
  const q = S.quotes.find(x=>x.token===PV.tok), op = q.opts[PV.opt], T = (k,p) => t(k,p,PV.lang);
  const m = openModal(`<div class="hd"><div><h2>${T("accept_t")}</h2><p class="muted small" style="margin:4px 0 0">${esc(op.name)}${q.hidePrices?"":" · <b>"+fmtMoney(op.calc.total,q.cur,PV.lang)+"</b>"}</p></div></div>
    <div class="bd col"><p class="small" style="margin:0">${T("accept_d",{dep:fmtMoney(op.calc.deposit,q.cur,PV.lang)})}</p><label class="row small" style="gap:8px"><input type="checkbox" id="agree"> ${T("agree")}</label></div>
    <div class="ft"><button class="btn" data-act="close">${t("cancel",null,PV.lang)}</button><button class="btn pri" id="accGo" disabled style="background:${q.clinic.color};border-color:${q.clinic.color}">${T("accept_plan")}</button></div>`);
  m.querySelector("#agree").onchange = e => m.querySelector("#accGo").disabled = !e.target.checked;
  m.querySelector("#accGo").onclick = () => {
    q.status = "accepted"; q.response = {opt:PV.opt, at:now(), msg:""};
    addActivity(q.leadId, "accepted", op.name); createDeal(q); save(); closeOverlay(); route();
  };
};
ACT.ppChanges = () => {
  const q = S.quotes.find(x=>x.token===PV.tok), T = (k,p) => t(k,p,PV.lang);
  const m = openModal(`<div class="hd"><h2>${T("req_changes")}</h2></div><div class="bd"><textarea class="inp" id="chMsg" placeholder="${T("changes_ph")}"></textarea></div><div class="ft"><button class="btn" data-act="close">${t("cancel",null,PV.lang)}</button><button class="btn pri" id="chGo">${T("send")}</button></div>`);
  m.querySelector("#chGo").onclick = () => { const msg = m.querySelector("#chMsg").value.trim(); q.status = "changes"; q.response = {opt:PV.opt, at:now(), msg};
    const l = lead(q.leadId); addActivity(l.id, "changes", msg.slice(0,60)); S.tasks.unshift({id:uid("t"), title:t("task_changes",{name:l.name}), due:now()+2*36e5, prio:"high", type:"follow", leadId:l.id, owner:l.owner, done:false, auto:true}); save(); closeOverlay(); route(); };
};
ACT.ppDecline = () => {
  const q = S.quotes.find(x=>x.token===PV.tok), T = (k,p) => t(k,p,PV.lang);
  const m = openModal(`<div class="hd"><h2>${T("decline")}</h2></div><div class="bd col"><select class="inp" id="dcR">${["price","other_clinic","timing","health","other"].map(r=>`<option value="${r}">${T("dr_"+r)}</option>`).join("")}</select></div><div class="ft"><button class="btn" data-act="close">${t("cancel",null,PV.lang)}</button><button class="btn danger" id="dcGo">${T("decline")}</button></div>`);
  m.querySelector("#dcGo").onclick = () => { const r = m.querySelector("#dcR").value; q.status = "declined"; q.response = {opt:PV.opt, at:now(), msg:r}; const l = lead(q.leadId); l.lost = r; setLeadStatus(l.id, "lost"); addActivity(l.id, "declined", r); save(); closeOverlay(); route(); };
};

/* ---------------- TEKLİFLER LİSTESİ ---------------- */
let quoteTab = "open";
function viewQuotes(){
  const groups = {open:q=>["sent","viewed"].includes(q.status), accepted:q=>q.status==="accepted", changes:q=>q.status==="changes", declined:q=>q.status==="declined", all:()=>true};
  const ls = S.quotes.filter(groups[quoteTab]);
  const pending = S.cases.filter(c=>c.status==="diagnosed");
  return pageHead(t("nav_quotes"), t("quotes_sub")) +
  (pending.length && can("price") ? `<div class="alert info" style="margin-bottom:12px">${I("info")}<span class="grow">${t("ready_to_price",{n:pending.length})}</span>${pending.slice(0,3).map(c=>`<a class="btn sm" href="#/case/${c.id}/3">${esc(lead(c.leadId).name)} →</a>`).join("")}</div>` : "") +
  `<div class="card"><div class="tabs" style="padding:0 8px">${Object.keys(groups).map(k=>`<button class="${quoteTab===k?"on":""}" data-act="quoteTab" data-v="${k}">${t("qt_"+k)} <span class="bdg">${S.quotes.filter(groups[k]).length}</span></button>`).join("")}</div>
  ${ls.length?`<div class="twrap"><table class="tbl"><thead><tr><th>${t("patient")}</th><th>${t("version")}</th><th>${t("sent")}</th><th>${t("options")}</th><th class="r">${t("total")}</th><th>${t("status")}</th><th>${t("viewed")}</th><th></th></tr></thead><tbody>
  ${ls.map(q=>{ const rec = q.opts.find(o=>o.rec)||q.opts[0]; return `<tr class="click" data-act="go" data-to="#/p/${q.token}?preview=1"><td><div class="row">${av(q.patient.name)}<b>${esc(q.patient.name)}</b></div></td><td>v${q.ver}</td><td class="small muted">${fmtDate(q.created)}</td><td class="small">${q.opts.map(o=>esc(o.name)).join(" / ")}</td><td class="r num"><b>${money(rec.calc.total,q.cur)}</b></td><td>${qBadge(q.status)}${q.response&&q.response.msg&&q.status==="changes"?`<div class="tiny muted" style="max-width:220px">“${esc(q.response.msg)}”</div>`:""}</td><td class="small muted">${q.viewedAt?rel(q.viewedAt)+` · ${q.views||1}×`:"—"}</td>
  <td class="r"><div class="row end" style="gap:4px"><button class="btn sm icon ghost" data-act="copyLink" data-id="${q.id}" title="${t("copy")}" onclick="event.stopPropagation()">${I("link")}</button><button class="btn sm icon ghost" data-act="printQ" data-id="${q.id}" title="PDF" onclick="event.stopPropagation()">${I("print")}</button><a class="btn sm ghost" href="#/case/${q.caseId}/3" onclick="event.stopPropagation()">${t("revise")}</a></div></td></tr>`; }).join("")}</tbody></table></div>` : emptyBox("file", t("no_quotes"))}</div>`;
}
ACT.quoteTab = el => { quoteTab = el.dataset.v; route(); };
