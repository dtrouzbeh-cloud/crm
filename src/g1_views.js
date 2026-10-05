/* =====================================================================
   UI — yardımcılar, kabuk, pano, lead'ler, görevler, deal'ler
   ===================================================================== */
const IC = {
  dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  tooth:'<path d="M7 3c-2.5 0-4 2-3.5 5 .4 2.5 1.2 4.5 1.8 7.5.4 2 1 3.5 2.2 3.5 1.3 0 1.6-1.6 2-3.6.3-1.3.8-2.4 2.5-2.4s2.2 1.1 2.5 2.4c.4 2 .7 3.6 2 3.6 1.2 0 1.8-1.5 2.2-3.5.6-3 1.4-5 1.8-7.5.5-3-1-5-3.5-5-2 0-3 1-5 1s-3-1-5-1z"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  deal:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
  tasks:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M8 7h8M8 11h6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="M18 6L6 18M6 6l12 12"/>', menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  wa:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  print:'<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  spark:'<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  alert:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>', info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', ok:'<path d="M20 6L9 17l-5-5"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  plane:'<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  chart:'<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>', desk:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.3-1.4M17.7 6.3l1.4-1.4"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
  trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  back:'<path d="M15 18l-6-6 6-6"/>', next:'<path d="M9 18l6-6-6-6"/>', copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  star:'<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  kanban:'<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
  send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>', download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>', lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.6 1.3 2.7 2.5 2.7z"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
};
const I = (n, cls) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ic${cls?" "+cls:""}">${IC[n]||""}</svg>`;

/* ---------- format ---------- */
const LOC = {tr:"tr-TR", en:"en-GB", de:"de-DE", ar:"ar-u-nu-latn"};
const L_ = () => S.ui.lang;
const fmtMoney = (v, cur, lang) => { try{ return new Intl.NumberFormat(LOC[lang||L_()], {style:"currency", currency:cur||S.clinic.cur, maximumFractionDigits:0}).format(v||0); }catch(e){ return (v||0)+" "+cur; } };
const fmtDate = (ts, lang, o) => ts ? new Intl.DateTimeFormat(LOC[lang||L_()], o||{day:"numeric", month:"short", year:"numeric"}).format(new Date(ts)) : "—";
const fmtDT = ts => fmtDate(ts, null, {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
function rel(ts){ const d = (ts - now())/1000, a = Math.abs(d), rtf = new Intl.RelativeTimeFormat(LOC[L_()], {numeric:"auto"});
  if(a<60) return rtf.format(Math.round(d),"second"); if(a<3600) return rtf.format(Math.round(d/60),"minute"); if(a<86400) return rtf.format(Math.round(d/3600),"hour"); if(a<86400*30) return rtf.format(Math.round(d/86400),"day"); return fmtDate(ts); }
const money = (v, cur) => can("money") ? fmtMoney(v, cur) : "•••";
const flag = c => COUNTRIES[c] || "🌐";
const av = (uidOrName, sm) => { const u = user(uidOrName); const n = u ? u.name : uidOrName; return `<span class="av${sm?" sm":""}" style="background:${avColor(n)}" title="${esc(n)}">${esc(initials(n))}</span>`; };
const stBadge = s => `<span class="bdg" style="background:color-mix(in srgb,${LEAD_ST_COL[s]} 14%,transparent);color:${LEAD_ST_COL[s]}"><span class="dot" style="background:${LEAD_ST_COL[s]}"></span>${esc(t("st_"+s))}</span>`;
const tempIc = tp => `<span class="lead-temp" title="${esc(t("temp_"+tp))}">${{hot:"🔥",warm:"🌤️",cold:"❄️"}[tp]||""}</span>`;
const qBadge = s => `<span class="bdg ${({sent:"info",viewed:"brand",accepted:"ok",changes:"warn",declined:"err",superseded:"",approval:"warn",draft:""})[s]||""}">${esc(t("qs_"+s))}</span>`;
const taskTitle = tk => tk.title && tk.title.startsWith("wf_") ? t(tk.title, tk.tParams) : tk.title;

/* ---------- overlays ---------- */
let overlay = null;
function closeOverlay(){ if(overlay){ overlay.forEach(e=>e.remove()); overlay = null; } }
function openDrawer(title, body, foot, onMount){
  closeOverlay();
  const sc = document.createElement("div"); sc.className = "scrim"; sc.onclick = closeOverlay;
  const d = document.createElement("div"); d.className = "drawer"; d.setAttribute("role","dialog");
  d.innerHTML = `<div class="hd"><h2 class="grow">${title}</h2><button class="btn ghost icon" data-act="close">${I("x")}</button></div><div class="bd">${body}</div>${foot?`<div class="ft">${foot}</div>`:""}`;
  document.body.append(sc, d); overlay = [sc, d];
  bindActions(d); if(onMount) onMount(d);
  const f = d.querySelector("input,select,textarea"); if(f) setTimeout(()=>f.focus(), 30);
  return d;
}
function openModal(html, onMount){
  closeOverlay();
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="scrim" style="position:absolute"></div><div class="box" role="dialog" style="position:relative">${html}</div>`;
  m.firstChild.onclick = closeOverlay;
  document.body.append(m); overlay = [m]; bindActions(m); if(onMount) onMount(m);
  return m;
}
function confirmBox(title, text, okLabel, danger){
  return new Promise(res=>{
    const m = openModal(`<div class="hd"><div class="grow"><h2>${title}</h2><p class="muted" style="margin:6px 0 0">${text||""}</p></div></div><div class="ft"><button class="btn" data-x="0">${t("cancel")}</button><button class="btn ${danger?"danger":"pri"}" data-x="1">${okLabel||t("ok")}</button></div>`);
    m.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{ closeOverlay(); res(b.dataset.x==="1"); });
  });
}
function toast(msg, undoFn){
  const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = `${I("ok")}<span>${msg}</span>${undoFn?`<button>${t("undo")}</button>`:""}`;
  if(undoFn) el.querySelector("button").onclick = ()=>{ undoFn(); el.remove(); };
  document.getElementById("toasts").append(el); setTimeout(()=>el.remove(), 3800);
}
async function copyText(s){ try{ await navigator.clipboard.writeText(s); toast(t("copied")); }catch(e){ const ta = document.createElement("textarea"); ta.value = s; document.body.append(ta); ta.select(); try{ document.execCommand("copy"); toast(t("copied")); }catch(_){} ta.remove(); } }

/* ---------- actions ---------- */
const ACT = {};
function bindActions(scope){
  scope.addEventListener("click", e=>{
    const el = e.target.closest("[data-act]"); if(!el || !scope.contains(el)) return;
    const fn = ACT[el.dataset.act]; if(fn){ e.preventDefault(); fn(el, e); }
  });
}
ACT.close = closeOverlay;
ACT.go = el => { location.hash = el.dataset.to; };

/* ---------- shell ---------- */
const NAV = [
  {sec:"sec_work"},
  {id:"dash", ic:"dash", to:"#/"},
  {id:"tasks", ic:"tasks", to:"#/tasks", perm:"tasks", badge:()=>S.tasks.filter(x=>!x.done && x.due<endOfDay() && (x.owner===S.me || can("approve"))).length},
  {id:"inbox", ic:"inbox", soon:true},
  {sec:"sec_sales"},
  {id:"leads", ic:"users", to:"#/leads", perm:"leads"},
  {id:"quotes", ic:"file", to:"#/quotes", perm:"cases"},
  {id:"deals", ic:"deal", to:"#/deals", perm:"deals"},
  {sec:"sec_clinic"},
  {id:"cases", ic:"tooth", to:"#/cases", perm:"cases", badge:()=>S.cases.filter(c=>c.status==="pool").length},
  {id:"reception", ic:"desk", soon:true},
  {id:"trips", ic:"plane", soon:true},
  {sec:"sec_setup"},
  {id:"catalog", ic:"book", to:"#/catalog", perm:"catalog"},
  {id:"analytics", ic:"chart", soon:true},
  {id:"settings", ic:"gear", to:"#/settings", perm:"settings"}
];
const endOfDay = () => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); };
function shellHTML(active){
  const u = me();
  const nav = NAV.map(n=>{
    if(n.sec) return `<div class="sec">${t(n.sec)}</div>`;
    if(n.perm && !can(n.perm)) return "";
    const b = n.badge ? n.badge() : 0;
    return `<a href="${n.to||"#"}" class="${active===n.id?"on":""} ${n.soon?"soon":""}">${I(n.ic)}<span>${t("nav_"+n.id)}</span>${n.soon?`<span class="bdg">${t("soon")}</span>`:b?`<span class="bdg n">${b}</span>`:""}</a>`;
  }).join("");
  return `<div class="app">
  <aside class="side" id="side">
    <div class="logo"><i>${I("tooth")}</i><span>Denta<b>Flow</b></span><span class="bdg info" style="margin-inline-start:auto">${t("proto")}</span></div>
    <nav class="nav">${nav}</nav>
    <div class="me">${av(u.id)}<div class="grow"><div style="font-weight:600;font-size:13px">${esc(u.name)}</div>
      <select class="inp sm" id="roleSel" title="${t("view_as")}" style="height:24px;padding:0 4px;font-size:11.5px;margin-top:2px">${S.users.map(x=>`<option value="${x.id}" ${x.id===u.id?"selected":""}>${esc(t("role_"+x.role))} · ${esc(x.name.split(" ").slice(-1)[0])}</option>`).join("")}</select></div></div>
  </aside>
  <main class="main">
    <div class="top">
      <button class="btn ghost icon burger" data-act="burger" aria-label="menu">${I("menu")}</button>
      <div class="search">${I("search")}<input id="gsearch" placeholder="${t("search_ph")}" autocomplete="off"><span class="kbd">/</span><div class="sres hide" id="sres"></div></div>
      <div class="grow"></div>
      <select class="inp sm" id="langSel" style="width:auto" aria-label="language">${LANGS.map(l=>`<option value="${l}" ${l===L_()?"selected":""}>${LANG_NAMES[l]}</option>`).join("")}</select>
      <button class="btn ghost icon" data-act="theme" title="${t("theme")}">${I(document.documentElement.dataset.theme==="dark"?"sun":"moon")}</button>
      ${can("leads")?`<button class="btn pri sm" data-act="newLead">${I("plus")}<span class="hide-sm">${t("new_lead")}</span></button>`:""}
    </div>
    <div class="page fade-in" id="page"></div>
  </main></div>`;
}
ACT.burger = () => { const s = document.getElementById("side"); s.classList.toggle("open"); if(s.classList.contains("open")){ const sc = document.createElement("div"); sc.className="scrim"; sc.style.zIndex=29; sc.onclick=()=>{ s.classList.remove("open"); sc.remove(); }; document.body.append(sc); } };
ACT.theme = () => { const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); S.ui.theme = cur==="dark" ? "light" : "dark"; applyTheme(); save(); route(); };
function applyTheme(){ const r = document.documentElement; if(S.ui.theme==="auto") delete r.dataset.theme; else r.dataset.theme = S.ui.theme; r.style.setProperty("--brand", S.clinic.color); r.style.setProperty("--brand-soft", `color-mix(in srgb, ${S.clinic.color} 13%, var(--card))`); r.lang = L_(); r.dir = L_()==="ar" ? "rtl" : "ltr"; }

function wireShell(){
  const rs = document.getElementById("roleSel"); if(rs) rs.onchange = () => { S.me = rs.value; save(); toast(t("viewing_as",{r:t("role_"+me().role)})); route(); };
  const ls = document.getElementById("langSel"); if(ls) ls.onchange = () => { S.ui.lang = ls.value; applyTheme(); save(); route(); };
  const gs = document.getElementById("gsearch"), sr = document.getElementById("sres");
  if(gs){
    let idx = 0;
    const draw = () => { const q = gs.value.trim().toLowerCase(); if(!q){ sr.classList.add("hide"); return; }
      const res = S.leads.filter(l=>(l.name+" "+l.phone+" "+(l.email||"")).toLowerCase().includes(q)).slice(0,7);
      sr.innerHTML = res.length ? res.map((l,i)=>`<a href="#/lead/${l.id}" class="${i===idx?"on":""}">${av(l.name,1)}<span class="grow">${esc(l.name)}<div class="tiny muted">${flag(l.country)} ${esc(l.phone)}</div></span>${stBadge(l.status)}</a>`).join("") : `<div class="empty small">${t("no_results")}</div>`;
      sr.classList.remove("hide"); };
    gs.oninput = () => { idx = 0; draw(); };
    gs.onkeydown = e => { const a = sr.querySelectorAll("a"); if(e.key==="ArrowDown"){ idx = Math.min(idx+1, a.length-1); draw(); e.preventDefault(); } if(e.key==="ArrowUp"){ idx = Math.max(idx-1,0); draw(); e.preventDefault(); } if(e.key==="Enter" && a[idx]){ location.hash = a[idx].getAttribute("href"); gs.value=""; sr.classList.add("hide"); } if(e.key==="Escape"){ gs.value=""; sr.classList.add("hide"); gs.blur(); } };
    gs.onblur = () => setTimeout(()=>sr.classList.add("hide"), 150);
  }
}

function pageHead(title, sub, actions){ return `<div class="phead"><div class="grow"><h1>${title}</h1>${sub?`<p>${sub}</p>`:""}</div>${actions?`<div class="row wrap">${actions}</div>`:""}</div>`; }
function emptyBox(ic, text, btn){ return `<div class="empty">${I(ic)}<div>${text}</div>${btn?`<div style="margin-top:12px">${btn}</div>`:""}</div>`; }

/* ---------- DASHBOARD ---------- */
function viewDash(){
  const u = me(), h = new Date().getHours();
  const greet = t(h<12?"gm":h<18?"ga":"ge", {name:u.name.split(" ")[0].replace("Dr.","").trim() || u.name});
  const d7 = now()-7*DAY, m0 = new Date(); m0.setDate(1); m0.setHours(0,0,0,0);
  const newLeads = S.leads.filter(l=>l.created>d7).length;
  const pool = S.cases.filter(c=>c.status==="pool").length;
  const sent = S.quotes.filter(q=>q.created>now()-30*DAY && q.status!=="superseded").length;
  const decided = S.quotes.filter(q=>["accepted","declined"].includes(q.status));
  const accRate = decided.length ? Math.round(100*decided.filter(q=>q.status==="accepted").length/decided.length) : 0;
  const rev = S.deals.reduce((a,d)=>a+d.payments.filter(p=>p.at>=m0.getTime()).reduce((x,p)=>x+p.amount,0),0);
  const active = S.leads.filter(l=>!["won","lost"].includes(l.status)).length;
  const J = [
    ["j_lead", active, "#/leads", "#0EA5E9"],
    ["j_case", S.cases.filter(c=>["pool","diagnosed"].includes(c.status)).length, "#/cases", "#F59E0B"],
    ["j_quote", S.quotes.filter(q=>["sent","viewed"].includes(q.status)).length, "#/quotes", "#6366F1"],
    ["j_accept", S.deals.filter(d=>["accepted","deposit"].includes(d.stage)).length, "#/deals", "#14B8A6"],
    ["j_visit", S.deals.filter(d=>/^v\d/.test(d.stage)).length, "#/deals", "#EC4899"],
    ["j_paid", S.deals.filter(d=>d.stage==="won").length, "#/deals", "#10B981"]];
  const tasks = S.tasks.filter(x=>!x.done && x.due<endOfDay() && (x.owner===S.me || can("approve"))).sort((a,b)=>a.due-b.due).slice(0,6);
  const acts = []; S.leads.forEach(l=>(l.activity||[]).slice(0,4).forEach(a=>acts.push({...a, l}))); acts.sort((a,b)=>b.at-a.at);
  const poolCases = S.cases.filter(c=>c.status==="pool").slice(0,4);
  const tour = S.ui.tour ? `<div class="card pad" style="margin-bottom:16px;background:linear-gradient(120deg,var(--brand-soft),var(--card))">
    <div class="row between wrap" style="gap:12px"><div class="grow"><h2>${I("spark")} ${t("tour_t")}</h2><p class="muted" style="margin:6px 0 10px">${t("tour_d")}</p>
    <div class="row wrap" style="gap:6px"><a class="chip" href="#/case/${S.cases[0].id}/1">1 · ${t("tour_1")}</a><a class="chip" href="#/case/${S.cases[0].id}/2">2 · ${t("tour_2")}</a><a class="chip" href="#/case/${(S.cases[1]||S.cases[0]).id}/3">3 · ${t("tour_3")}</a><a class="chip" href="#/quotes">4 · ${t("tour_4")}</a><a class="chip" href="#/deals">5 · ${t("tour_5")}</a></div></div>
    <button class="btn ghost icon" data-act="hideTour" aria-label="close">${I("x")}</button></div></div>` : "";
  return pageHead(greet, fmtDate(now(), null, {weekday:"long", day:"numeric", month:"long"})) + tour + `
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span class="l">${t("k_new")}</span><span class="v num">${newLeads}</span><span class="d muted">${t("last7")}</span></div>
    <div class="card kpi"><span class="l">${t("k_pool")}</span><span class="v num">${pool}</span><span class="d"><a href="#/cases">${t("open_pool")} →</a></span></div>
    <div class="card kpi"><span class="l">${t("k_acc")}</span><span class="v num">${accRate}%</span><span class="d muted">${t("k_sent",{n:sent})}</span></div>
    <div class="card kpi"><span class="l">${t("k_rev")}</span><span class="v num">${money(rev)}</span><span class="d muted">${t("this_month")}</span></div>
  </div>
  <h3 style="margin:4px 0 8px" class="muted small">${t("journey").toUpperCase()}</h3>
  <div class="journey" style="margin-bottom:16px">${J.map(([k,n,to,c])=>`<a href="${to}"><span class="n num">${n}</span><span class="s">${t(k)}</span><span class="bar" style="background:${c}"></span></a>`).join("")}</div>
  <div class="grid g3">
    <div class="card"><div class="hd"><h2 class="grow">${t("today_tasks")}</h2><a href="#/tasks" class="small">${t("all")} →</a></div><div class="bd" style="padding-top:4px;padding-bottom:4px"><div class="tlist">${tasks.length ? tasks.map(taskRow).join("") : emptyBox("ok", t("no_tasks"))}</div></div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("awaiting_dx")}</h2><a href="#/cases" class="small">${t("all")} →</a></div><div class="bd col">${poolCases.length ? poolCases.map(c=>{ const l = lead(c.leadId); return `<a class="row" href="#/case/${c.id}/${c.sitDone?2:1}" style="color:inherit">${av(l.name)}<div class="grow"><div style="font-weight:600">${esc(l.name)}</div><div class="tiny muted">${flag(l.country)} · ${rel(c.created)}${l.medNote?` · <span style="color:var(--err)">${esc(l.medNote)}</span>`:""}</div></div>${I("next","flip")}</a>`; }).join("") : emptyBox("ok", t("pool_empty"))}</div></div>
    <div class="card"><div class="hd"><h2 class="grow">${t("recent")}</h2></div><div class="bd"><div class="timeline">${acts.slice(0,7).map(a=>`<div class="ev"><div class="small"><a href="#/lead/${a.l.id}"><b>${esc(a.l.name)}</b></a> · ${esc(actText(a))}</div><div class="tiny faint">${rel(a.at)}</div></div>`).join("")}</div></div></div>
  </div>`;
}
ACT.hideTour = () => { S.ui.tour = false; save(); route(); };
function actText(a){ if(a.type==="status"){ const [f,to] = String(a.text).split("→"); return t("act_status",{from:t("st_"+f), to:t("st_"+to)}); } return t("act_"+a.type, {x:a.text}); }

/* ---------- TASKS ---------- */
function taskRow(tk){
  const l = tk.leadId ? lead(tk.leadId) : null, over = !tk.done && tk.due < now();
  return `<div class="titem"><span class="check ${tk.done?"on":""}" data-act="toggleTask" data-id="${tk.id}" role="checkbox" aria-checked="${tk.done}">${tk.done?I("ok"):""}</span>
  <div class="grow"><div style="font-weight:550;${tk.done?"text-decoration:line-through;color:var(--faint)":""}">${esc(taskTitle(tk))}</div>
  <div class="tiny muted row wrap" style="gap:6px;margin-top:2px"><span style="color:${over?"var(--err)":"inherit"}">${I("clock").replace("<svg","<svg style='width:12px;height:12px'")} ${fmtDT(tk.due)}</span>${l?`· <a href="#/lead/${l.id}">${esc(l.name)}</a>`:""} · <span class="bdg ${tk.prio==="high"?"err":tk.prio==="med"?"warn":""}">${t("p_"+tk.prio)}</span>${tk.auto?`<span class="bdg info">${t("auto")}</span>`:""}</div></div>${av(tk.owner,1)}</div>`;
}
ACT.toggleTask = el => { const tk = byId(S.tasks, el.dataset.id); tk.done = !tk.done; save(); if(tk.done) toast(t("task_done"), ()=>{ tk.done=false; save(); route(); }); route(); };
let taskTab = "list", taskWho = "mine";
function viewTasks(){
  const mine = taskWho==="mine" ? S.tasks.filter(x=>x.owner===S.me) : S.tasks;
  const eod = endOfDay(), groups = [["overdue", x=>!x.done && x.due<now()], ["today", x=>!x.done && x.due>=now() && x.due<=eod], ["upcoming", x=>!x.done && x.due>eod], ["done", x=>x.done]];
  let body = "";
  if(taskTab==="list") body = groups.map(([k,f])=>{ const ls = mine.filter(f).sort((a,b)=>a.due-b.due); if(!ls.length) return ""; return `<div class="card" style="margin-bottom:12px"><div class="hd"><h3 class="grow" style="${k==="overdue"?"color:var(--err)":""}">${t("g_"+k)} <span class="bdg">${ls.length}</span></h3></div><div class="bd" style="padding-top:0;padding-bottom:0"><div class="tlist">${ls.map(taskRow).join("")}</div></div></div>`; }).join("") || `<div class="card">${emptyBox("ok", t("no_tasks"))}</div>`;
  else {
    const d0 = new Date(); d0.setHours(0,0,0,0); const start = d0.getTime() - ((d0.getDay()+6)%7)*DAY;
    const days = Array.from({length:7}, (_,i)=>start+i*DAY);
    const visits = []; S.deals.forEach(d=>d.visitsInfo.forEach(v=>{ if(v.date) visits.push({at:v.date, title:`${(lead(d.leadId)||{}).name} · ${t("visit_n",{n:v.v})}`, c:vcol(v.v)}); }));
    body = `<div class="week">${days.map(ds=>{ const de = ds+DAY; const evs = mine.filter(x=>x.due>=ds && x.due<de).map(x=>`<div class="ev" style="${x.done?"opacity:.5":""}">${esc(taskTitle(x))}<div class="tiny muted">${fmtDate(x.due,null,{hour:"2-digit",minute:"2-digit"})}</div></div>`).join("") + visits.filter(v=>v.at>=ds && v.at<de).map(v=>`<div class="ev" style="border-color:${v.c};background:color-mix(in srgb,${v.c} 12%,var(--card))">${I("plane").replace("<svg","<svg style='width:12px;height:12px'")} ${esc(v.title)}</div>`).join("");
      return `<div class="day ${ds===d0.getTime()?"today":""}"><div class="small" style="font-weight:650">${fmtDate(ds,null,{weekday:"short", day:"numeric"})}</div>${evs}</div>`; }).join("")}</div>`;
  }
  return pageHead(t("nav_tasks"), t("tasks_sub"), `<div class="seg"><button class="${taskWho==="mine"?"on":""}" data-act="taskWho" data-v="mine">${t("mine")}</button><button class="${taskWho==="all"?"on":""}" data-act="taskWho" data-v="all">${t("all")}</button></div><div class="seg"><button class="${taskTab==="list"?"on":""}" data-act="taskTab" data-v="list">${I("list")}</button><button class="${taskTab==="week"?"on":""}" data-act="taskTab" data-v="week">${I("cal")}</button></div><button class="btn pri" data-act="newTask">${I("plus")}${t("new_task")}</button>`) + body;
}
ACT.taskTab = el => { taskTab = el.dataset.v; route(); };
ACT.taskWho = el => { taskWho = el.dataset.v; route(); };
ACT.newTask = el => {
  const lid = el.dataset.lead || "";
  const d = new Date(now()+DAY); d.setHours(10,0,0,0);
  const iso = new Date(d - d.getTimezoneOffset()*6e4).toISOString().slice(0,16);
  openDrawer(t("new_task"), `<label class="f">${t("title")}<input class="inp" id="tkT"></label>
    <div class="grid g2"><label class="f">${t("due")}<input class="inp" type="datetime-local" id="tkD" value="${iso}"></label>
    <label class="f">${t("priority")}<select class="inp" id="tkP"><option value="high">${t("p_high")}</option><option value="med" selected>${t("p_med")}</option><option value="low">${t("p_low")}</option></select></label></div>
    <label class="f">${t("lead")}<select class="inp" id="tkL"><option value="">—</option>${S.leads.map(l=>`<option value="${l.id}" ${l.id===lid?"selected":""}>${esc(l.name)}</option>`).join("")}</select></label>
    <label class="f">${t("owner")}<select class="inp" id="tkO">${S.users.map(u=>`<option value="${u.id}" ${u.id===S.me?"selected":""}>${esc(u.name)}</option>`).join("")}</select></label>`,
    `<button class="btn" data-act="close">${t("cancel")}</button><button class="btn pri" id="tkSave">${t("save")}</button>`, d=>{
      d.querySelector("#tkSave").onclick = () => { const title = d.querySelector("#tkT").value.trim(); if(!title) return d.querySelector("#tkT").focus();
        S.tasks.unshift({id:uid("t"), title, due:new Date(d.querySelector("#tkD").value).getTime()||now()+DAY, prio:d.querySelector("#tkP").value, leadId:d.querySelector("#tkL").value||null, owner:d.querySelector("#tkO").value, type:"general", done:false});
        save(); closeOverlay(); toast(t("saved")); route(); };
    });
};

/* ---------- LEADS ---------- */
let leadTab = "active", leadQ = "";
function viewLeads(){
  const view = S.ui.leadView;
  const q = leadQ.toLowerCase();
  let ls = S.leads.filter(l=>!q || (l.name+" "+l.phone+" "+(l.email||"")+" "+(l.interest||"")).toLowerCase().includes(q));
  const counts = {active:ls.filter(l=>!["won","lost"].includes(l.status)).length, mine:ls.filter(l=>l.owner===S.me).length, all:ls.length};
  LEAD_ST.forEach(s=>counts[s] = ls.filter(l=>l.status===s).length);
  if(view==="list"){ if(leadTab==="active") ls = ls.filter(l=>!["won","lost"].includes(l.status)); else if(leadTab==="mine") ls = ls.filter(l=>l.owner===S.me); else if(leadTab!=="all") ls = ls.filter(l=>l.status===leadTab); }
  ls.sort((a,b)=>b.lastAct-a.lastAct);
  const tabs = ["active","mine","all",...LEAD_ST].map(k=>`<button class="${leadTab===k?"on":""}" data-act="leadTab" data-v="${k}">${t(LEAD_ST.includes(k)?"st_"+k:"lt_"+k)} <span class="bdg">${counts[k]}</span></button>`).join("");
  const head = pageHead(t("nav_leads"), t("leads_sub",{n:S.leads.length}), `<input class="inp" id="leadQ" placeholder="${t("filter_ph")}" value="${esc(leadQ)}" style="width:220px"><div class="seg"><button class="${view==="list"?"on":""}" data-act="leadView" data-v="list" title="${t("list")}">${I("list")}</button><button class="${view==="kanban"?"on":""}" data-act="leadView" data-v="kanban" title="Kanban">${I("kanban")}</button></div><button class="btn pri" data-act="newLead">${I("plus")}${t("new_lead")}</button>`);
  if(view==="kanban"){
    return head + `<div class="kanban" id="kb">${LEAD_ST.map(s=>{ const items = ls.filter(l=>l.status===s);
      return `<div class="kcol" data-st="${s}"><div class="kh"><span class="dot" style="background:${LEAD_ST_COL[s]}"></span>${t("st_"+s)}<span class="bdg" style="margin-inline-start:auto">${items.length}</span></div><div class="kb">${items.map(l=>`<div class="kcard" draggable="true" data-id="${l.id}"><div class="row"><b class="grow">${esc(l.name)}</b>${tempIc(l.temp)}</div><div class="tiny muted">${flag(l.country)} ${esc(l.interest||"—")}</div><div class="row tiny muted">${av(l.owner,1)}<span class="grow">${t("src_"+l.source)}</span><span>${rel(l.lastAct)}</span></div></div>`).join("")}</div></div>`; }).join("")}</div>`;
  }
  return head + `<div class="card"><div class="tabs" style="padding:0 8px">${tabs}</div>
  ${ls.length ? `<div class="twrap"><table class="tbl"><thead><tr><th>${t("name")}</th><th>${t("phone")}</th><th>${t("country")}</th><th>${t("status")}</th><th>${t("source")}</th><th>${t("temp")}</th><th>${t("owner")}</th><th>${t("last_act")}</th><th></th></tr></thead><tbody>
  ${ls.map(l=>`<tr class="click" data-act="go" data-to="#/lead/${l.id}"><td><div class="row">${av(l.name)}<div><div style="font-weight:600">${esc(l.name)}</div><div class="tiny muted">${esc(l.email||"")}</div></div></div></td><td class="num small">${esc(l.phone)}</td><td>${flag(l.country)} <span class="small muted">${l.country}</span></td><td>${stBadge(l.status)}</td><td class="small">${t("src_"+l.source)}</td><td>${tempIc(l.temp)}</td><td>${av(l.owner,1)}</td><td class="small muted">${rel(l.lastAct)}</td>
  <td class="r"><div class="row end" style="gap:4px"><a class="btn sm icon ghost" href="tel:${esc(l.phone)}" onclick="event.stopPropagation()" title="${t("call")}">${I("phone")}</a><a class="btn sm icon ghost" target="_blank" rel="noopener" href="https://wa.me/${l.phone.replace(/\D/g,"")}" onclick="event.stopPropagation()" title="WhatsApp" style="color:#16A34A">${I("wa")}</a></div></td></tr>`).join("")}
  </tbody></table></div>` : emptyBox("users", t("no_results"))}</div>`;
}
function wireLeads(){
  const q = document.getElementById("leadQ"); if(q){ q.oninput = () => { leadQ = q.value; const pos = q.selectionStart; route(); const n = document.getElementById("leadQ"); n.focus(); n.setSelectionRange(pos,pos); }; }
  const kb = document.getElementById("kb"); if(!kb) return;
  let dragId = null;
  kb.addEventListener("dragstart", e=>{ const c = e.target.closest(".kcard"); if(!c) return; dragId = c.dataset.id; c.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; });
  kb.addEventListener("dragend", e=>{ const c = e.target.closest(".kcard"); if(c) c.classList.remove("drag"); });
  kb.addEventListener("dragover", e=>{ const col = e.target.closest(".kcol"); if(col){ e.preventDefault(); kb.querySelectorAll(".kcol").forEach(x=>x.classList.toggle("over", x===col)); } });
  kb.addEventListener("drop", e=>{ const col = e.target.closest(".kcol"); kb.querySelectorAll(".kcol").forEach(x=>x.classList.remove("over")); if(!col || !dragId) return; e.preventDefault();
    const l = lead(dragId), prev = l.status; setLeadStatus(dragId, col.dataset.st); save(); route(); toast(t("moved_to",{s:t("st_"+col.dataset.st)}), ()=>{ l.status = prev; save(); route(); }); });
  kb.addEventListener("click", e=>{ const c = e.target.closest(".kcard"); if(c) location.hash = "#/lead/"+c.dataset.id; });
}
ACT.leadTab = el => { leadTab = el.dataset.v; route(); };
ACT.leadView = el => { S.ui.leadView = el.dataset.v; save(); route(); };
ACT.newLead = () => {
  openDrawer(t("new_lead"), `<label class="f">${t("full_name")} *<input class="inp" id="nlN" autocomplete="off"></label>
  <div class="grid g2"><label class="f">${t("phone")} *<input class="inp" id="nlP" placeholder="+44 …"></label><label class="f">E-mail<input class="inp" id="nlE" type="email"></label></div>
  <div id="dup"></div>
  <div class="grid g2"><label class="f">${t("country")}<select class="inp" id="nlC">${Object.keys(COUNTRIES).map(c=>`<option value="${c}">${COUNTRIES[c]} ${c}</option>`).join("")}</select></label>
  <label class="f">${t("language")}<select class="inp" id="nlL">${LANGS.map(l=>`<option value="${l}" ${l==="en"?"selected":""}>${LANG_NAMES[l]}</option>`).join("")}</select></label></div>
  <div class="grid g2"><label class="f">${t("source")}<select class="inp" id="nlS">${SOURCES.map(s=>`<option value="${s}">${t("src_"+s)}</option>`).join("")}</select></label>
  <label class="f">${t("temp")}<select class="inp" id="nlT"><option value="hot">🔥 ${t("temp_hot")}</option><option value="warm" selected>🌤️ ${t("temp_warm")}</option><option value="cold">❄️ ${t("temp_cold")}</option></select></label></div>
  <label class="f">${t("interest")}<input class="inp" id="nlI" placeholder="All-on-4, veneers…"></label>
  <label class="f">${t("owner")}<select class="inp" id="nlO">${S.users.filter(u=>["sales","manager","admin"].includes(u.role)).map(u=>`<option value="${u.id}" ${u.role==="sales"?"selected":""}>${esc(u.name)}</option>`).join("")}</select></label>
  <label class="f">${t("issue")}<textarea class="inp" id="nlX"></textarea></label>
  <div class="alert info">${I("info")}<span>${t("wf_hint")}</span></div>`,
  `<button class="btn" data-act="close">${t("cancel")}</button><button class="btn pri" id="nlSave">${t("save")}</button>`, d=>{
    const chk = () => { const p = d.querySelector("#nlP").value.replace(/\D/g,""), e = d.querySelector("#nlE").value.trim().toLowerCase();
      const dup = S.leads.find(l=>(p.length>5 && l.phone.replace(/\D/g,"")===p) || (e && (l.email||"").toLowerCase()===e));
      d.querySelector("#dup").innerHTML = dup ? `<div class="alert warn">${I("alert")}<span>${t("dup_found")} <a href="#/lead/${dup.id}" onclick="closeOverlay()"><b>${esc(dup.name)}</b></a></span></div>` : ""; };
    d.querySelector("#nlP").oninput = chk; d.querySelector("#nlE").oninput = chk;
    d.querySelector("#nlSave").onclick = () => {
      const name = d.querySelector("#nlN").value.trim(), phone = d.querySelector("#nlP").value.trim();
      if(!name || !phone){ (name? d.querySelector("#nlP") : d.querySelector("#nlN")).focus(); return; }
      const l = {id:uid("L"), name, phone, email:d.querySelector("#nlE").value.trim(), country:d.querySelector("#nlC").value, lang:d.querySelector("#nlL").value, source:d.querySelector("#nlS").value, temp:d.querySelector("#nlT").value, interest:d.querySelector("#nlI").value.trim(), owner:d.querySelector("#nlO").value, issue:d.querySelector("#nlX").value.trim(), status:"new", created:now(), lastAct:now(), med:{}, notes:[], activity:[{at:now(), type:"created", text:"manual", by:S.me}], tags:[]};
      S.leads.unshift(l); runWorkflow("lead_created", {leadId:l.id}); save(); closeOverlay(); toast(t("lead_created")); location.hash = "#/lead/"+l.id;
    };
  });
};

/* ---------- LEAD DETAIL ---------- */
function viewLead(id){
  const l = lead(id); if(!l) return emptyBox("users", t("not_found"));
  const c = S.cases.find(x=>x.leadId===id), qs = S.quotes.filter(q=>q.leadId===id), ds = S.deals.filter(d=>d.leadId===id), tks = S.tasks.filter(x=>x.leadId===id);
  const fld = (k, label, type, opts) => `<label class="f">${label}${type==="select" ? `<select class="inp sm" data-lf="${k}">${opts.map(([v,n])=>`<option value="${v}" ${l[k]===v?"selected":""}>${esc(n)}</option>`).join("")}</select>` : `<input class="inp sm" data-lf="${k}" value="${esc(l[k]||"")}" ${type?`type="${type}"`:""}>`}</label>`;
  const medFlags = MED.filter(m=>l.med && l.med[m]);
  return `<div class="row wrap" style="margin-bottom:14px;gap:12px"><a href="#/leads" class="btn ghost sm">${I("back","flip")}${t("nav_leads")}</a></div>
  <div class="card pad" style="margin-bottom:14px"><div class="row wrap" style="gap:14px">${av(l.name).replace('class="av"','class="av" style="width:52px;height:52px;font-size:17px;background:'+avColor(l.name)+'"')}
    <div class="grow"><div class="row wrap"><h1>${esc(l.name)}</h1>${tempIc(l.temp)}<span class="tiny faint">#${l.id}</span></div>
    <div class="row wrap small muted" style="margin-top:4px;gap:10px"><span>${flag(l.country)} ${l.country}</span><span>${LANG_NAMES[l.lang]||l.lang}</span><span>${t("src_"+l.source)}</span><span>${t("created")} ${rel(l.created)}</span>${medFlags.length?`<span class="bdg err">${I("alert").replace("<svg","<svg style='width:12px;height:12px'")} ${esc(l.medNote || medFlags.map(m=>t("med_"+m)).join(", "))}</span>`:""}</div></div>
    <select class="inp" id="lStatus" style="width:auto">${LEAD_ST.map(s=>`<option value="${s}" ${l.status===s?"selected":""}>${t("st_"+s)}</option>`).join("")}</select>
    <a class="btn" href="tel:${esc(l.phone)}">${I("phone")}${t("call")}</a><a class="btn" style="color:#16A34A" target="_blank" rel="noopener" href="https://wa.me/${l.phone.replace(/\D/g,"")}">${I("wa")}WhatsApp</a>
    ${c ? `<a class="btn pri" href="#/case/${c.id}/${c.step||1}">${I("tooth")}${t("go_case")}</a>` : can("cases") ? `<button class="btn pri" data-act="openCase" data-id="${l.id}">${I("tooth")}${t("open_case")}</button>` : ""}
  </div></div>
  <div class="grid" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start" id="ldGrid">
    <div class="col" style="gap:14px">
      <div class="card"><div class="hd"><h2 class="grow">${t("lead_info")}</h2><span class="tiny faint">${t("autosave")}</span></div><div class="bd grid g2">
        ${fld("name",t("full_name"))}${fld("phone",t("phone"))}${fld("email","E-mail","email")}
        ${fld("country",t("country"),"select",Object.keys(COUNTRIES).map(c=>[c,COUNTRIES[c]+" "+c]))}
        ${fld("lang",t("language"),"select",LANGS.map(x=>[x,LANG_NAMES[x]]))}${fld("source",t("source"),"select",SOURCES.map(s=>[s,t("src_"+s)]))}
        ${fld("temp",t("temp"),"select",[["hot","🔥 "+t("temp_hot")],["warm","🌤️ "+t("temp_warm")],["cold","❄️ "+t("temp_cold")]])}${fld("owner",t("owner"),"select",S.users.map(u=>[u.id,u.name]))}
        ${fld("interest",t("interest"))}${fld("budget",t("budget"))}
        <label class="f" style="grid-column:1/-1">${t("issue")}<textarea class="inp" data-lf="issue">${esc(l.issue||"")}</textarea></label>
      </div></div>
      <div class="card"><div class="hd"><h2 class="grow">${t("anamnesis")}</h2><span class="bdg info">${t("feeds_rules")}</span></div><div class="bd">
        <div class="row wrap" style="gap:6px">${MED.map(m=>`<button class="chip ${l.med&&l.med[m]?"on":""}" data-act="medT" data-m="${m}">${t("med_"+m)}</button>`).join("")}</div>
        <div class="grid g2" style="margin-top:12px">${fld("age",t("age"),"number")}${fld("medNote",t("med_note"))}</div></div></div>
      <div class="card"><div class="hd"><h2 class="grow">${t("notes")}</h2></div><div class="bd col">
        <div class="row"><input class="inp" id="noteIn" placeholder="${t("add_note_ph")}"><button class="btn" data-act="addNote" data-id="${l.id}">${t("add")}</button></div>
        ${(l.notes||[]).map(n=>`<div class="small" style="padding:8px 10px;background:var(--subtle);border-radius:8px">${esc(n.text)}<div class="tiny faint">${esc((user(n.by)||{}).name||"")} · ${rel(n.at)}</div></div>`).join("")}</div></div>
    </div>
    <div class="col" style="gap:14px">
      ${c ? `<div class="card"><div class="hd"><h2 class="grow">${t("case")}</h2>${caseBadge(c)}</div><div class="bd"><div class="mini-chart">${chartSVG(toothStates(c, c.items.length?"plan":"sit"), {spans:spansFor(c, c.items)})}</div><a class="btn sm" href="#/case/${c.id}/${c.step||1}" style="margin-top:8px">${t("go_case")} →</a></div></div>` : ""}
      ${qs.length ? `<div class="card"><div class="hd"><h2 class="grow">${t("nav_quotes")}</h2></div><div class="bd col">${qs.map(q=>`<a class="row" href="#/p/${q.token}?preview=1" style="color:inherit"><b>v${q.ver}</b><span class="grow small muted">${fmtDate(q.created)} · ${q.opts.length} ${t("options")}</span>${qBadge(q.status)}</a>`).join("")}</div></div>` : ""}
      ${ds.length ? `<div class="card"><div class="hd"><h2 class="grow">${t("nav_deals")}</h2></div><div class="bd col">${ds.map(d=>`<div class="row"><b class="grow">${esc(d.title)}</b><span class="bdg brand">${t("ds_"+(d.stage.startsWith("v")?"v":d.stage),{n:d.stage.slice(1)})}</span><span class="num">${money(d.value,d.cur)}</span></div>`).join("")}</div></div>` : ""}
      <div class="card"><div class="hd"><h2 class="grow">${t("nav_tasks")}</h2><button class="btn sm" data-act="newTask" data-lead="${l.id}">${I("plus")}</button></div><div class="bd" style="padding-top:0;padding-bottom:0"><div class="tlist">${tks.length ? tks.map(taskRow).join("") : `<div class="empty small">${t("no_tasks")}</div>`}</div></div></div>
      <div class="card"><div class="hd"><h2 class="grow">${t("timeline")}</h2></div><div class="bd"><div class="timeline">${(l.activity||[]).map(a=>`<div class="ev"><div class="small">${esc(actText(a))}</div><div class="tiny faint">${esc((user(a.by)||{}).name||"")} · ${fmtDT(a.at)}</div></div>`).join("")}</div></div></div>
    </div></div>`;
}
function wireLead(id){
  const l = lead(id); if(!l) return;
  document.querySelectorAll("[data-lf]").forEach(inp=>{ inp.onchange = () => { const k = inp.dataset.lf; l[k] = inp.type==="number" ? +inp.value : inp.value; l.lastAct = now(); save(); toast(t("saved")); if(["name","owner","temp"].includes(k)) route(); }; });
  const st = document.getElementById("lStatus"); if(st) st.onchange = () => { setLeadStatus(id, st.value); save(); toast(t("moved_to",{s:t("st_"+st.value)})); route(); };
  const ni = document.getElementById("noteIn"); if(ni) ni.onkeydown = e => { if(e.key==="Enter") ACT.addNote({dataset:{id}}); };
}
ACT.medT = el => { const l = lead(route.params[0]); l.med = l.med||{}; l.med[el.dataset.m] = !l.med[el.dataset.m]; save(); route(); };
ACT.addNote = el => { const l = lead(el.dataset.id), inp = document.getElementById("noteIn"); const v = inp.value.trim(); if(!v) return; (l.notes = l.notes||[]).unshift({text:v, at:now(), by:S.me}); addActivity(l.id, "note", v.slice(0,40)); save(); route(); };
ACT.openCase = el => { const l = lead(el.dataset.id); const c = {id:uid("C"), leadId:l.id, status:"pool", dentist:null, created:now(), situation:{}, sitDone:false, visits:1, items:[], step:1, pricing:null, notes:[]}; S.cases.unshift(c); setLeadStatus(l.id, "awaiting"); addActivity(l.id, "case", c.id); save(); toast(t("case_opened")); location.hash = `#/case/${c.id}/1`; };

/* ---------- DEALS ---------- */
function viewDeals(){
  const maxV = Math.max(2, ...S.deals.map(d=>d.visitsInfo.length));
  const stages = ["accepted","deposit", ...Array.from({length:maxV},(_,i)=>"v"+(i+1)), "won"];
  const open = S.deals.filter(d=>d.stage!=="lost");
  const pipe = open.filter(d=>d.stage!=="won").reduce((a,d)=>a+toEUR(d.value,d.cur),0);
  return pageHead(t("nav_deals"), t("deals_sub",{n:open.length, v:money(pipe,"EUR")}), "") + `<div class="kanban" id="dkb">${stages.map(s=>{ const ds = open.filter(d=>d.stage===s);
    const sum = ds.reduce((a,d)=>a+toEUR(d.value,d.cur),0);
    return `<div class="kcol" data-st="${s}"><div class="kh">${s.startsWith("v")?`<span class="dot" style="background:${vcol(+s.slice(1))}"></span>`:""}${t("ds_"+(s.startsWith("v")?"v":s),{n:s.slice(1)})}<span class="bdg" style="margin-inline-start:auto">${ds.length}</span></div><div class="tiny muted" style="padding:0 12px 6px">${money(sum,"EUR")}</div><div class="kb">${ds.map(d=>{ const paid = dealPaid(d), pct = d.value ? Math.min(100, Math.round(100*paid/d.value)) : 0; const nv = d.visitsInfo.find(v=>v.date && v.date>now());
      return `<div class="kcard" draggable="true" data-id="${d.id}"><b>${esc(d.title)}</b><div class="row small"><span class="grow num">${money(d.value,d.cur)}</span><span class="tiny muted">${pct}% ${t("paid")}</span></div><div class="prog"><i style="width:${pct}%"></i></div>${nv?`<div class="tiny muted">${I("plane").replace("<svg","<svg style='width:12px;height:12px'")} ${t("visit_n",{n:nv.v})} · ${fmtDate(nv.date)}</div>`:""}</div>`; }).join("")}</div></div>`; }).join("")}</div>`;
}
const toEUR = (v, cur) => Math.round(v / ((S.clinic.fx||{})[cur]||1));
function wireDeals(){
  const kb = document.getElementById("dkb"); if(!kb) return;
  let dragId = null, moved = false;
  kb.addEventListener("dragstart", e=>{ const c = e.target.closest(".kcard"); if(!c) return; dragId = c.dataset.id; moved = true; c.classList.add("drag"); });
  kb.addEventListener("dragend", e=>{ const c = e.target.closest(".kcard"); if(c) c.classList.remove("drag"); setTimeout(()=>moved=false, 50); });
  kb.addEventListener("dragover", e=>{ const col = e.target.closest(".kcol"); if(col){ e.preventDefault(); kb.querySelectorAll(".kcol").forEach(x=>x.classList.toggle("over", x===col)); } });
  kb.addEventListener("drop", e=>{ const col = e.target.closest(".kcol"); kb.querySelectorAll(".kcol").forEach(x=>x.classList.remove("over")); if(!col||!dragId) return; e.preventDefault(); const d = byId(S.deals, dragId); const prev = d.stage; d.stage = col.dataset.st; save(); route(); toast(t("moved_to",{s:col.querySelector(".kh").textContent.replace(/\d+$/,"").trim()}), ()=>{ d.stage = prev; save(); route(); }); });
  kb.addEventListener("click", e=>{ const c = e.target.closest(".kcard"); if(c && !moved) openDeal(c.dataset.id); });
}
function openDeal(id){
  const d = byId(S.deals, id), l = lead(d.leadId), paid = dealPaid(d), st = stageList(d), i = st.indexOf(d.stage);
  const noMoney = i>=2 && !d.payments.length && d.value>0;
  openDrawer(esc(d.title), `
    <div class="row wrap">${st.map((s,k)=>`<span class="bdg ${k<i?"ok":k===i?"brand":""}">${t("ds_"+(s.startsWith("v")?"v":s),{n:s.slice(1)})}</span>`).join(I("next").replace("<svg","<svg style='width:12px;height:12px;color:var(--faint)'"))}</div>
    ${noMoney?`<div class="alert warn">${I("alert")}<span>${t("no_money_warn")}</span></div>`:""}
    <div class="grid g3"><div class="card kpi"><span class="l">${t("deal_value")}</span><span class="v num" style="font-size:20px">${money(d.value,d.cur)}</span></div><div class="card kpi"><span class="l">${t("paid")}</span><span class="v num" style="font-size:20px;color:var(--ok)">${money(paid,d.cur)}</span></div><div class="card kpi"><span class="l">${t("balance")}</span><span class="v num" style="font-size:20px">${money(d.value-paid,d.cur)}</span></div></div>
    <div class="small muted">${t("patient")}: <a href="#/lead/${l.id}" onclick="closeOverlay()">${esc(l.name)}</a>${d.quoteId?` · ${t("quote")}: <a href="#/p/${(byId(S.quotes,d.quoteId)||{}).token}?preview=1" onclick="closeOverlay()">v${(byId(S.quotes,d.quoteId)||{}).ver}</a>`:""}</div>
    <h3>${t("visits")}</h3>
    <table class="tbl"><thead><tr><th>${t("visit")}</th><th>${t("date")}</th><th class="r">${t("planned")}</th><th class="r">${t("paid")}</th></tr></thead><tbody>
    ${d.visitsInfo.map((v,k)=>`<tr><td><span class="dot" style="background:${vcol(v.v)}"></span> ${t("visit_n",{n:v.v})}</td><td><input type="date" class="inp sm" data-vd="${k}" value="${v.date?new Date(v.date).toISOString().slice(0,10):""}"></td><td class="r num">${money(v.planned,d.cur)}</td><td class="r num">${money(d.payments.filter(p=>p.v===v.v).reduce((a,p)=>a+p.amount,0),d.cur)}</td></tr>`).join("")}</tbody></table>
    <h3>${t("record_payment")}</h3>
    <div class="row wrap"><input class="inp" id="payA" type="number" placeholder="${t("amount")} (${d.cur})" style="width:140px"><select class="inp" id="payV" style="width:auto">${d.visitsInfo.map(v=>`<option value="${v.v}">${t("visit_n",{n:v.v})}</option>`).join("")}</select><input class="inp grow" id="payN" placeholder="${t("note")}"><button class="btn pri" id="payGo">${t("add")}</button></div>
    ${d.payments.length?`<div class="col">${d.payments.map(p=>`<div class="row small"><span class="dot" style="background:${vcol(p.v)}"></span><span class="grow">${t("visit_n",{n:p.v})}${p.note?" · "+esc(p.note==="deposit"?t("deposit"):p.note):""}</span><span class="muted">${fmtDate(p.at)}</span><b class="num">${money(p.amount,d.cur)}</b></div>`).join("")}</div>`:""}
  `, `<button class="btn danger" id="dLost">${t("ds_lost")}</button><span class="grow"></span>${i>0?`<button class="btn" id="dBack">${t("back")}</button>`:""}${i<st.length-1?`<button class="btn pri" id="dAdv">${t("advance_to",{s:t("ds_"+(st[i+1].startsWith("v")?"v":st[i+1]),{n:st[i+1].slice(1)})})}</button>`:""}`, dr=>{
    dr.querySelectorAll("[data-vd]").forEach(inp=> inp.onchange = () => { d.visitsInfo[+inp.dataset.vd].date = inp.value ? new Date(inp.value).getTime() : null; save(); toast(t("saved")); });
    dr.querySelector("#payGo").onclick = () => { const a = +dr.querySelector("#payA").value; if(!a) return dr.querySelector("#payA").focus(); d.payments.push({id:uid("p"), amount:a, v:+dr.querySelector("#payV").value, note:dr.querySelector("#payN").value, at:now()}); if(d.stage==="accepted") d.stage = "deposit"; save(); toast(t("payment_saved")); route(); openDeal(id); };
    const adv = dr.querySelector("#dAdv"); if(adv) adv.onclick = () => { d.stage = st[i+1]; save(); route(); openDeal(id); };
    const bk = dr.querySelector("#dBack"); if(bk) bk.onclick = () => { d.stage = st[i-1]; save(); route(); openDeal(id); };
    dr.querySelector("#dLost").onclick = async () => { if(await confirmBox(t("ds_lost"), t("lost_confirm"), t("ds_lost"), true)){ d.stage = "lost"; save(); route(); } };
  });
}
