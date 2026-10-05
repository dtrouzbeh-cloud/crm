/* =====================================================================
   KATALOG, AYARLAR, ROUTER, BOOT
   ===================================================================== */
let catTab = "tx", openBrands = null;
function viewCatalog(){
  const tabs = `<div class="tabs" style="margin-bottom:14px">${[["tx","treatments"],["b","bundles"],["rules","clin_rules"]].map(([k,l])=>`<button class="${catTab===k?"on":""}" data-act="catTab" data-v="${k}">${t(l)}${k==="tx"?` <span class="bdg">${S.catalog.tx.length}</span>`:k==="b"?` <span class="bdg">${S.catalog.bundles.length}</span>`:""}</button>`).join("")}</div>`;
  let body = "";
  if(catTab==="tx"){
    body = `<div class="alert info" style="margin-bottom:12px">${I("info")}<span>${t("cat_hint",{cur:S.clinic.cur})}</span></div>` + Object.keys(CATS).map(cat=>{
      const xs = S.catalog.tx.filter(x=>x.cat===cat); if(!xs.length) return "";
      return `<div class="card" style="margin-bottom:12px"><div class="hd"><h3 class="grow">${tn(CATS[cat])}</h3><span class="bdg">${xs.length}</span></div><div class="twrap"><table class="tbl"><thead><tr><th style="width:34%">${t("name")}</th><th>${t("unit")}</th><th>${t("allowed_v")}</th><th>${t("chart_icon")}</th><th class="r">${t("price")} (EUR)</th><th class="r">${S.clinic.cur}</th><th>${t("active")}</th></tr></thead><tbody>
      ${xs.map(x=>`<tr><td><div class="row"><i class="dot" style="background:${x.color};border-radius:3px"></i><b style="font-weight:600">${esc(tn(x.n))}</b></div>${x.brands?`<button class="btn xs ghost" data-act="brands" data-id="${x.id}" style="margin-top:4px">${x.brands.length} ${t(x.id==="graft"?"sizes":"brands")} ${openBrands===x.id?"▴":"▾"}</button>`:""}${x.tiers?`<span class="bdg info">${t("tiers")}</span>`:""}${x.prereq?`<span class="bdg">${t("needs_imp",{n:x.prereq.count})}</span>`:""}</td>
      <td class="small">${t("u_"+x.unit)}</td><td class="small">${x.visits.map(v=>"V"+v).join(" ")}</td><td class="small muted">${t("rd_"+x.render)}</td>
      <td class="r"><input class="inp sm num" type="number" min="0" data-txp="${x.id}" value="${x.price}" style="width:90px;text-align:end" ${x.brands?"disabled title='"+t("brand_priced")+"'":""}></td><td class="r small muted num">${fmtMoney(convert(x.price,S.clinic.cur))}</td>
      <td><label class="switch"><input type="checkbox" data-txa="${x.id}" ${x.active?"checked":""}><span></span></label></td></tr>
      ${openBrands===x.id?x.brands.map((b,i)=>`<tr style="background:var(--subtle)"><td colspan="4" style="padding-inline-start:40px"><input class="inp sm" data-brn="${x.id}|${i}" value="${esc(b.n)}" style="max-width:260px"> ${b.form&&b.form!=="std"?`<span class="bdg">${t("form_"+b.form)}</span>`:""}</td><td class="r"><input class="inp sm num" type="number" data-brp="${x.id}|${i}" value="${b.price}" style="width:90px;text-align:end"></td><td class="r small muted num">${fmtMoney(convert(b.price,S.clinic.cur))}</td><td></td></tr>`).join("")+`<tr style="background:var(--subtle)"><td colspan="7" style="padding-inline-start:40px"><button class="btn xs" data-act="addBrand" data-id="${x.id}">${I("plus")}${t("add_brand")}</button></td></tr>`:""}`).join("")}
      </tbody></table></div></div>`; }).join("");
  } else if(catTab==="b"){
    body = `<div class="card"><div class="twrap"><table class="tbl"><thead><tr><th>${t("name")}</th><th>${t("jaw")}</th><th>${t("auto_teeth")}</th><th>${t("prereq")}</th><th>${t("allowed_v")}</th><th class="r">${t("price")} (EUR)</th><th>${t("active")}</th></tr></thead><tbody>
    ${S.catalog.bundles.map(b=>`<tr><td><div class="row"><i class="dot" style="background:${b.color};border-radius:3px"></i><b style="font-weight:600">${esc(tn(b.n))}</b></div></td><td class="small">${t(b.jaw==="u"?"jaw_u":"jaw_l")}</td><td class="small num">${b.imp.length?`${t("lg_implant")}: ${b.imp.join(", ")}`:""}${b.crown.length?`${b.imp.length?"<br>":""}${t("crowns")}: ${b.crown[0]}–${b.crown[b.crown.length-1]} (${b.crown.length})`:""}</td><td class="small">${b.prereq?t("needs_imp",{n:b.prereq.count}):"—"}${b.minVisits>1?`<br>${t("min_v",{n:b.minVisits})}`:""}</td><td class="small">${b.visits.map(v=>"V"+v).join(" ")}</td>
    <td class="r"><input class="inp sm num" type="number" data-bp="${b.id}" value="${b.price}" style="width:90px;text-align:end"></td><td><label class="switch"><input type="checkbox" data-ba="${b.id}" ${b.active?"checked":""}><span></span></label></td></tr>`).join("")}</tbody></table></div></div>`;
  } else {
    const blocks = ["B1","B3","B4","B5","C1","C1b","MINV","EMPTY"], warns = Object.keys(S.catalog.rules);
    body = `<div class="grid g2" style="align-items:start"><div class="card"><div class="hd"><h3 class="grow">${I("lock").replace("<svg","<svg style='width:15px;height:15px'")} ${t("rules_block")}</h3></div><div class="bd col">${blocks.map(k=>`<div class="row small" style="align-items:flex-start"><span class="bdg err">${k}</span><span class="grow">${t("rd_rule_"+k)}</span></div>`).join("")}</div></div>
    <div class="card"><div class="hd"><h3 class="grow">${t("rules_warn")}</h3></div><div class="bd col">${warns.map(k=>`<label class="row small" style="align-items:flex-start;cursor:pointer"><span class="bdg warn">${k}</span><span class="grow">${t("rd_rule_"+k)}</span><span class="switch"><input type="checkbox" data-rule="${k}" ${S.catalog.rules[k]!==false?"checked":""}><span></span></span></label>`).join("")}</div></div></div>`;
  }
  return pageHead(t("nav_catalog"), t("catalog_sub"), catTab==="tx"?`<button class="btn" data-act="resetCat">${t("reset_defaults")}</button><button class="btn pri" data-act="newTx">${I("plus")}${t("new_tx")}</button>`:"") + tabs + body;
}
function wireCatalog(){
  const upd = (sel, fn) => document.querySelectorAll(sel).forEach(el=> el.onchange = () => { fn(el); save(); toast(t("saved")); });
  upd("[data-txp]", el=> tx(el.dataset.txp).price = +el.value||0);
  upd("[data-txa]", el=> tx(el.dataset.txa).active = el.checked);
  upd("[data-bp]", el=> bundle(el.dataset.bp).price = +el.value||0);
  upd("[data-ba]", el=> bundle(el.dataset.ba).active = el.checked);
  upd("[data-rule]", el=> S.catalog.rules[el.dataset.rule] = el.checked);
  upd("[data-brp]", el=>{ const [id,i] = el.dataset.brp.split("|"); tx(id).brands[+i].price = +el.value||0; });
  upd("[data-brn]", el=>{ const [id,i] = el.dataset.brn.split("|"); tx(id).brands[+i].n = el.value; });
}
ACT.catTab = el => { catTab = el.dataset.v; route(); };
ACT.brands = el => { openBrands = openBrands===el.dataset.id ? null : el.dataset.id; route(); };
ACT.addBrand = el => { const x = tx(el.dataset.id); x.brands.push({id:uid("b"), n:t("new_brand"), price:x.brands[x.brands.length-1].price, form:"std"}); save(); route(); };
ACT.resetCat = async () => { if(await confirmBox(t("reset_defaults"), t("reset_cat_q"), t("reset_defaults"), true)){ S.catalog.tx = clone(TX_SEED); S.catalog.bundles = clone(BUNDLE_SEED); save(); route(); toast(t("saved")); } };
ACT.newTx = () => {
  openDrawer(t("new_tx"), `<div class="grid g2"><label class="f">${t("name")} (TR)<input class="inp" id="ntTr"></label><label class="f">${t("name")} (EN)<input class="inp" id="ntEn"></label></div>
    <div class="grid g2"><label class="f">${t("category")}<select class="inp" id="ntC">${Object.keys(CATS).map(k=>`<option value="${k}">${tn(CATS[k])}</option>`).join("")}</select></label>
    <label class="f">${t("unit")}<select class="inp" id="ntU">${["tooth","side","arch","mouth","piece"].map(u=>`<option value="${u}">${t("u_"+u)}</option>`).join("")}</select></label></div>
    <div class="grid g2"><label class="f">${t("chart_icon")}<select class="inp" id="ntR">${["none","implant","crown","veneer","ext","fill","inlay","rct","graft","sinus","arch"].map(r=>`<option value="${r}">${t("rd_"+r)}</option>`).join("")}</select></label>
    <label class="f">${t("price")} (EUR)<input class="inp" type="number" id="ntP" value="100"></label></div>
    <label class="f">${t("allowed_v")}<div class="row">${[1,2,3,4].map(v=>`<label class="row small" style="gap:4px"><input type="checkbox" class="ntV" value="${v}" ${v<=2?"checked":""}>V${v}</label>`).join("")}</div></label>`,
    `<button class="btn" data-act="close">${t("cancel")}</button><button class="btn pri" id="ntSave">${t("save")}</button>`, d=>{
      d.querySelector("#ntSave").onclick = () => { const tr = d.querySelector("#ntTr").value.trim(), en = d.querySelector("#ntEn").value.trim() || tr; if(!tr) return d.querySelector("#ntTr").focus();
        const r = d.querySelector("#ntR").value;
        S.catalog.tx.push(TX(uid("x"), d.querySelector("#ntC").value, [tr,en,en,en], d.querySelector("#ntU").value, r, +d.querySelector("#ntP").value||0, {visits:[...d.querySelectorAll(".ntV:checked")].map(x=>+x.value), color:"#0E7C86", mat:r==="crown"?"zr":r==="veneer"?"por":undefined}));
        save(); closeOverlay(); toast(t("saved")); route(); };
    });
};

/* ---------------- AYARLAR ---------------- */
function viewSettings(){
  const C = S.clinic;
  const f = (k, label, type, extra) => `<label class="f">${label}<input class="inp sm" data-cs="${k}" ${type?`type="${type}"`:""} value="${esc(C[k])}" ${extra||""}></label>`;
  const presets = ["#0E7C86","#2563EB","#7C3AED","#DB2777","#EA580C","#16A34A","#0F172A","#B45309"];
  return pageHead(t("nav_settings"), t("settings_sub")) + `<div class="grid g2" style="align-items:start">
  <div class="col" style="gap:14px">
    <div class="card"><div class="hd"><h2 class="grow">${t("clinic_id")}</h2></div><div class="bd grid g2">${f("name",t("clinic_name"))}${f("legal",t("legal_name"))}${f("phone",t("phone"))}${f("email","E-mail","email")}${f("web","Web")}${f("city",t("city"))}<label class="f" style="grid-column:1/-1">${t("address")}<input class="inp sm" data-cs="address" value="${esc(C.address)}"></label></div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("brand_color")}</h2><span class="tiny muted">${t("brand_hint")}</span></div><div class="bd row wrap">${presets.map(p=>`<button data-act="color" data-v="${p}" style="width:30px;height:30px;border-radius:50%;background:${p};border:3px solid ${C.color===p?"var(--text)":"transparent"};cursor:pointer" aria-label="${p}"></button>`).join("")}<input type="color" data-cs="color" value="${C.color}" style="width:40px;height:32px;border:0;background:none;cursor:pointer"></div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("money_locale")}</h2></div><div class="bd col">
      <div class="grid g2"><label class="f">${t("def_currency")}<select class="inp sm" data-cs="cur">${CURS.map(x=>`<option ${C.cur===x?"selected":""}>${x}</option>`).join("")}</select></label>
      <label class="f">${t("numbering")}<select class="inp sm" data-cs="numbering">${["FDI","UNIVERSAL","PALMER"].map(x=>`<option ${C.numbering===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
      <div class="small muted">${t("fx_rates")} (1 EUR =)</div><div class="grid g3">${CURS.filter(x=>x!=="EUR").map(x=>`<label class="f">${x}<input class="inp sm num" type="number" step="0.01" data-fx="${x}" value="${C.fx[x]}"></label>`).join("")}</div></div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("data")}</h2></div><div class="bd row wrap"><button class="btn" data-act="exportData">${I("download")}${t("export_json")}</button><label class="btn">${I("upload")}${t("import_json")}<input type="file" accept=".json" id="impFile" class="hide"></label><span class="grow"></span><button class="btn danger" data-act="resetDemo">${t("reset_demo")}</button></div></div>
  </div>
  <div class="col" style="gap:14px">
    <div class="card"><div class="hd"><h2 class="grow">${t("quote_defaults")}</h2></div><div class="bd grid g2">${f("deposit",t("deposit")+" %","number")}${f("valid",t("valid_days"),"number")}${f("rounding",t("rounding_step"),"number")}${f("hotelNight",t("hotel_night_eur"),"number")}${f("transfer",t("transfer_eur"),"number")}<div></div>${f("gapMin",t("gap_min"),"number")}${f("gapMax",t("gap_max"),"number")}</div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("disc_limits")}</h2><span class="tiny muted">${t("disc_hint")}</span></div><div class="bd grid g3">${Object.keys(ROLES).map(r=>`<label class="f">${t("role_"+r)}<div class="row"><input class="inp sm num" type="number" min="0" max="100" data-lim="${r}" value="${C.limits[r]}"><span>%</span></div></label>`).join("")}</div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("team")}</h2><button class="btn sm" data-act="addUser">${I("plus")}${t("add_user")}</button></div><div class="bd col" style="gap:8px">${S.users.map(u=>`<div class="row">${av(u.id)}<input class="inp sm grow" data-un="${u.id}" value="${esc(u.name)}"><select class="inp sm" data-ur="${u.id}" style="width:auto">${Object.keys(ROLES).map(r=>`<option value="${r}" ${u.role===r?"selected":""}>${t("role_"+r)}</option>`).join("")}</select></div>`).join("")}
      <div class="alert info">${I("info")}<span>${t("roles_hint")}</span></div></div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("perm_matrix")}</h2></div><div class="twrap"><table class="tbl"><thead><tr><th></th>${Object.keys(ROLES).map(r=>`<th>${t("role_"+r)}</th>`).join("")}</tr></thead><tbody>${["leads","cases","dx","price","send","approve","deals","catalog","settings","money"].map(p=>`<tr><td class="small">${t("perm_"+p)}</td>${Object.keys(ROLES).map(r=>`<td>${ROLES[r].perm.includes(p)?`<span style="color:var(--ok)">●</span>`:`<span class="faint">○</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
  </div></div>`;
}
function wireSettings(){
  document.querySelectorAll("[data-cs]").forEach(el=> el.onchange = () => { const k = el.dataset.cs; S.clinic[k] = el.type==="number" ? +el.value : el.value; save(); if(["color","cur","numbering"].includes(k)){ applyTheme(); route(); } toast(t("saved")); });
  document.querySelectorAll("[data-fx]").forEach(el=> el.onchange = () => { S.clinic.fx[el.dataset.fx] = +el.value||1; save(); toast(t("saved")); });
  document.querySelectorAll("[data-lim]").forEach(el=> el.onchange = () => { S.clinic.limits[el.dataset.lim] = +el.value||0; save(); toast(t("saved")); });
  document.querySelectorAll("[data-un]").forEach(el=> el.onchange = () => { user(el.dataset.un).name = el.value; save(); route(); });
  document.querySelectorAll("[data-ur]").forEach(el=> el.onchange = () => { user(el.dataset.ur).role = el.value; save(); route(); });
  const imp = document.getElementById("impFile"); if(imp) imp.onchange = () => { const f = imp.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => { try{ const o = JSON.parse(r.result); if(o.v!==1) throw 0; S = o; save(); applyTheme(); toast(t("imported")); route(); }catch(e){ toast(t("import_err")); } }; r.readAsText(f); };
}
ACT.color = el => { S.clinic.color = el.dataset.v; save(); applyTheme(); route(); };
ACT.addUser = () => { S.users.push({id:uid("u"), name:t("new_user"), role:"sales"}); save(); route(); };
ACT.exportData = () => { const b = new Blob([JSON.stringify(S, null, 1)], {type:"application/json"}); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `dentaflow-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000); };
ACT.resetDemo = async () => { if(await confirmBox(t("reset_demo"), t("reset_demo_q"), t("reset_demo"), true)){ const lang = S.ui.lang; localStorage.removeItem(KEY); W = null; seedState(); S.ui.lang = lang; save(); applyTheme(); location.hash = "#/"; route(); toast(t("demo_reset")); } };

/* ---------------- ROUTER ---------------- */
const PAGES = {
  dash:{v:viewDash, nav:"dash"},
  leads:{v:viewLeads, w:wireLeads, nav:"leads", perm:"leads"},
  lead:{v:p=>viewLead(p[0]), w:p=>wireLead(p[0]), nav:"leads", perm:"leads"},
  cases:{v:viewCases, nav:"cases", perm:"cases"},
  case:{v:p=>viewCase(p[0], p[1]), w:p=>{ const c = kase(p[0]); if(c) wireCase(c, Math.min(+p[1]||c.step||1, (c.status==="pool"||!can("price"))?2:4)); }, nav:"cases", perm:"cases"},
  quotes:{v:viewQuotes, nav:"quotes", perm:"cases"},
  deals:{v:viewDeals, w:wireDeals, nav:"deals", perm:"deals"},
  tasks:{v:viewTasks, nav:"tasks", perm:"tasks"},
  catalog:{v:viewCatalog, w:wireCatalog, nav:"catalog", perm:"catalog"},
  settings:{v:viewSettings, w:wireSettings, nav:"settings", perm:"settings"}
};
function route(){
  const h = location.hash.slice(1) || "/";
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "dash";
  route.cur = name; route.params = parts.slice(1);
  clearInterval(PV.tick);
  if(W && W.dirty && !(name==="case" && parts[1]===W.caseId && (parts[2]||"2")==="2")){ const c = kase(W.caseId); if(c && commitWS(c)) toast(t("draft_saved")); }
  const root = document.getElementById("root");
  if(name==="p"){ root.innerHTML = viewPatient(parts[1], /preview/.test(qs||"")); wirePatient(parts[1]); document.title = t("pp_title", null, PV.lang || L_()); return; }
  const pg = PAGES[name] || PAGES.dash;
  root.innerHTML = shellHTML(pg.nav); wireShell();
  const el = document.getElementById("page");
  if(pg.perm && !can(pg.perm)){ el.innerHTML = `<div class="card">${emptyBox("lock", t("no_access",{r:t("role_"+me().role)}), `<a class="btn" href="#/">${t("nav_dash")}</a>`)}</div>`; return; }
  el.innerHTML = pg.v(route.params);
  if(pg.w) pg.w(route.params);
  document.title = `${t("nav_"+(pg.nav||"dash"))} · DentaFlow`;
}

/* ---------------- BOOT ---------------- */
function boot(){
  const t0 = performance.now();
  S = load() || seedState();
  if(!S.ui) S.ui = {lang:"tr", theme:"auto", leadView:"list", tour:true};
  // katalog migrasyonu: yeni seed alanlarını mevcut veriye ekle (kullanıcı fiyatlarını korur)
  [[S.catalog.tx, TX_SEED], [S.catalog.bundles, BUNDLE_SEED]].forEach(([cur, seed])=> seed.forEach(sd=>{ const ex = cur.find(x=>x.id===sd.id); if(!ex) cur.push(clone(sd)); else for(const k in sd) if(ex[k]===undefined) ex[k] = clone(sd[k]); }));
  save(); applyTheme();
  bindActions(document.getElementById("root"));
  window.addEventListener("hashchange", ()=>{ closeOverlay(); route(); window.scrollTo(0,0); });
  document.addEventListener("keydown", e=>{
    const tag = (e.target.tagName||"").toLowerCase(), typing = ["input","textarea","select"].includes(tag);
    if(e.key==="Escape") closeOverlay();
    if(e.key==="/" && !typing){ const g = document.getElementById("gsearch"); if(g){ e.preventDefault(); g.focus(); } }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="z" && !typing && route.cur==="case" && W && W.undo.length){ e.preventDefault(); ACT.undo(); }
  });
  route();
  window.__bootMs = Math.round(performance.now()-t0);
}
boot();
</script>
</body>
</html>
