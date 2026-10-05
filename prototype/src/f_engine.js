/* =====================================================================
   ENGINE — plan genişletme, durum hesaplama, kural motoru, fiyatlandırma
   ===================================================================== */
const CROWN_GROUP = ["crown_zr","crown_emax","crown_pfm","crown_por"];
const SURGICAL = ["ext","implant","sinus","graft"];
const POSTERIOR_UP = [14,15,16,17,24,25,26,27];

function txName(id, lang){ const x = tx(id); return x ? tn(x.n, lang) : id; }
function itemName(it, lang){ if(it.b){ const b = bundle(it.b); return b ? tn(b.n, lang) : it.b; } if(it.manual) return it.name; return txName(it.tx, lang); }
const IMP_BASE = 450, BUNDLE_SWAP = [["smile_zr_u","smile_emax_u"]];
function brandOf(it){
  if(it.b){ const b = bundle(it.b); if(!b || !it.brand) return null; if(b.brands) return b.brands.find(x=>x.id===it.brand) || null; if(b.imp.length) return (tx("implant").brands||[]).find(x=>x.id===it.brand) || null; return null; }
  const x = it.tx && tx(it.tx); return x && x.brands ? (x.brands.find(b=>b.id===it.brand) || null) : null; }
function brandList(it){ if(it.b){ const b = bundle(it.b); if(!b) return null; if(b.brands) return b.brands; if(b.imp.length) return tx("implant").brands; return null; } const x = it.tx && tx(it.tx); return x && x.brands || null; }
function implantForm(it){ const b = brandOf(it); return (b && b.form) || "std"; }

/* Plan kalemlerini diş/çene olaylarına açar — paketler bileşenlerine açılır */
function expand(items){
  const teeth = [], arch = [];
  (items||[]).forEach(it=>{
    if(it.b){
      const b = bundle(it.b); if(!b) return;
      const bf = (b.imp.length && !b.brands && brandOf(it) && brandOf(it).form) || "std"; b.imp.forEach(t=> teeth.push({t, txId:"implant", render:"implant", form:bf, v:it.v, it, viaBundle:true}));
      b.crown.forEach(t=> teeth.push({t, txId:"bundle_crown", render:"crown", mat:b.mat, v:it.v, it, span:it.id, viaBundle:true}));
      if(b.arch) arch.push({jaw:b.jaw, txId:b.arch, v:it.v, it});
      return;
    }
    const x = tx(it.tx); if(!x) return;
    if(x.unit==="arch"){ (it.jaws||[]).forEach(j=>arch.push({jaw:j, txId:x.id, v:it.v, it})); return; }
    if(x.unit==="tooth" || x.unit==="side") (it.teeth||[]).forEach(t=> teeth.push({t, txId:x.id, render:x.render, mat:x.mat, form:x.render==="implant"?implantForm(it):null, v:it.v, it}));
  });
  return {teeth, arch};
}

/* Mevcut durum → çizim durumu */
function sitRender(e){
  const s = {}; if(!e) return s;
  switch(e.s){
    case "missing": s.gone = true; break;
    case "root": s.rootOnly = true; break;
    case "rct": s.kanal = true; break;
    case "crown": case "bridge": s.kron = "old"; break;
    case "pontic": s.gone = true; s.kron = "old"; break;
    case "caries": s.caries = true; break;
    case "comp": s.dolgu = "comp"; break;
    case "amalg": s.dolgu = "amalg"; break;
    case "inlay": s.dolgu = "inlay"; break;
    case "impab": s.implant = "std"; s.gone = true; break;
    case "impcr": s.implant = "std"; s.gone = true; s.kron = "old"; break;
    case "impacted": s.impacted = true; break;
    case "veneer": s.veneer = "por"; break;
    case "other": s.other = true; break;
  }
  if(e.f){ if(e.f.sinusSark) s.sinusSark = true; if(e.f.kemikAz) s.kemikAz = true; }
  return s;
}
function toothStates(src, mode, items, upto){
  const out = {}, sit = src.situation || {};
  ALL_TEETH.forEach(t=> out[t] = sitRender(sit[t]));
  if(mode==="sit") return out;
  const ex = expand(items || src.items);
  ex.teeth.filter(e=>!upto || e.v<=upto).sort((a,b)=>a.v-b.v).forEach(e=>{
    const s = out[e.t];
    s.pv = s.pv ? Math.min(s.pv, e.v) : e.v;
    switch(e.render){
      case "ext":
        s.cekim = true; s.gone = true; delete s.rootOnly; delete s.dolgu; delete s.kanal; delete s.caries; delete s.veneer; delete s.impacted;
        if(s.kron==="old") delete s.kron; if(e.txId==="implant_rem") delete s.implant; break;
      case "implant": s.implant = e.form || "std"; s.gone = true; delete s.rootOnly; delete s.impacted; if(s.kron==="old") delete s.kron; break;
      case "crown": s.kron = e.mat || "zr"; if(e.span) s.span = e.span; delete s.veneer; delete s.caries; break;
      case "veneer": s.veneer = e.mat || "por"; break;
      case "fill": s.dolgu = "plan"; delete s.caries; break;
      case "inlay": s.dolgu = "inlay"; delete s.caries; break;
      case "rct": s.kanal = true; break;
      case "graft": s.greft = true; break;
      case "sinus": s.sinus = true; break;
    }
  });
  return out;
}
function implantsInJaw(sit, items, jaw, beforeV){
  let n = 0;
  Object.entries(sit||{}).forEach(([t,e])=>{ if(jawOf(+t)===jaw && (e.s==="impab"||e.s==="impcr")) n++; });
  expand(items).teeth.forEach(e=>{ if(e.render==="implant" && jawOf(e.t)===jaw && (beforeV==null || e.v<beforeV)) n++; });
  return n;
}
function spansFor(src, items, lang){
  const sp = [], sit = src.situation||{};
  (items||[]).forEach(it=>{
    if(it.b){ const b = bundle(it.b); if(!b) return;
      if(b.crown.length){ const ts = b.crown.slice().sort((a,c)=>ALL_TEETH.indexOf(a)-ALL_TEETH.indexOf(c));
        sp.push({teeth:b.crown, color:vcol(it.v), label:`${tn(b.n,lang).replace(/\s*\(.*\)/,"")} ${ts[0]}–${ts[ts.length-1]} · ${t("implants_n",{n:implantsInJaw(sit, items, b.jaw)}, lang)}`}); }
      if(b.arch) sp.push({teeth:b.jaw==="u"?UPPER:LOWER, color:vcol(it.v), label:`${tn(b.n,lang)}`});
      return; }
    const x = tx(it.tx); if(x && x.unit==="arch") (it.jaws||[]).forEach(j=> sp.push({teeth:j==="u"?UPPER:LOWER, color:vcol(it.v), label:`${tn(x.n,lang)} · ${t(j==="u"?"jaw_u":"jaw_l",null,lang)}`}));
  });
  // aynı çenede çakışan etiketleri birleştir
  const seen = {}; return sp.filter(s=>{ const k = s.teeth[0]+"|"+s.label; if(seen[k]) return false; seen[k]=1; return true; }).slice(0,4);
}

/* ---------------- KURAL MOTORU ---------------- */
function checkRules(c, items){
  items = items || c.items;
  const R = [], on = k => S.catalog.rules[k] !== false, l = lead(c.leadId) || {}, med = l.med || {};
  const ex = expand(items), byT = {};
  ex.teeth.forEach(e=> (byT[e.t] = byT[e.t]||[]).push(e));
  const has = (t,r) => (byT[t]||[]).some(e=>e.render===r);
  const push = (sev, code, p, v) => R.push({sev, code, p:p||{}, v});
  const sit = c.situation || {};
  // --- engelleyici (her zaman) ---
  const B = {B1:[],B3:[],B4:[],B5:[]};
  Object.keys(byT).forEach(k=>{ const tt = +k;
    if(has(tt,"ext") && has(tt,"rct")) B.B1.push(tt);
    if(has(tt,"implant") && has(tt,"rct")) B.B3.push(tt);
    if(has(tt,"veneer") && has(tt,"crown")) B.B4.push(tt);
    if((has(tt,"implant") || ["impab","impcr"].includes((sit[tt]||{}).s)) && has(tt,"veneer")) B.B5.push(tt);
  });
  Object.entries(B).forEach(([k,v])=>{ if(v.length) push("block", k, {teeth:v.join(", ")}); });
  const sinusT = ex.teeth.filter(e=>e.render==="sinus");
  const low = sinusT.filter(e=>jawOf(e.t)==="l").map(e=>e.t); if(low.length) push("block","C1",{teeth:low.join(", ")});
  const ant = sinusT.filter(e=>jawOf(e.t)==="u" && !POSTERIOR_UP.includes(e.t)).map(e=>e.t); if(ant.length) push("block","C1b",{teeth:ant.join(", ")});
  for(let v=1; v<=c.visits; v++) if(!items.some(i=>i.v===v)) push("block","EMPTY",{v},v);
  items.forEach(it=>{
    if(it.b){ const b = bundle(it.b); if(b && b.minVisits > c.visits) push("block","MINV",{name:tn(b.n), need:b.minVisits, have:c.visits}, it.v);
      if(b && !b.visits.includes(it.v)) push("warn","VISIT",{name:tn(b.n), v:it.v, ok:b.visits.join("/")}, it.v); }
    else { const x = tx(it.tx); if(x && !x.visits.includes(it.v) && !it.manual) push("warn","VISIT",{name:tn(x.n), v:it.v, ok:x.visits.join("/")}, it.v); }
  });
  // --- uyarılar (açılıp kapanabilir) ---
  const finalS = toothStates(c, "plan", items);
  if(on("B6")){ const bad = ex.teeth.filter(e=>{ const x = tx(e.txId); return x && x.needsImplant && !finalS[e.t].implant; }).map(e=>e.t); if(bad.length) push("warn","B6",{teeth:[...new Set(bad)].join(", ")}); }
  if(on("BRIDGE")) [UPPER, LOWER].forEach(row=>{
    let i = 0;
    while(i<row.length){
      const s = finalS[row[i]];
      if(crownKind(s)==="pontic" && !s.span){
        let j = i; while(j<row.length && crownKind(finalS[row[j]])==="pontic" && !finalS[row[j]].span) j++;
        const L = i>0 ? finalS[row[i-1]] : null, Rr = j<row.length ? finalS[row[j]] : null;
        const ok = x => x && x.kron && crownKind(x)!=="pontic";
        if(!ok(L) || !ok(Rr)) push("warn","BRIDGE",{teeth:row.slice(i,j).join(", ")});
        i = j;
      } else i++;
    }
  });
  if(on("SINUS_NOIMP")) [1,2].forEach(q=>{ if(sinusT.some(e=>quadOf(e.t)===q) && !ALL_TEETH.some(tt=>quadOf(tt)===q && finalS[tt].implant)) push("warn","SINUS_NOIMP",{q}); });
  if(on("SINUS_LOW")) [1,2].forEach(q=>{ const imp = ex.teeth.filter(e=>e.render==="implant" && quadOf(e.t)===q && POSTERIOR_UP.includes(e.t) && (sit[e.t]||{}).f && sit[e.t].f.sinusSark);
    if(imp.length && !sinusT.some(e=>quadOf(e.t)===q)) push("warn","SINUS_LOW",{teeth:imp.map(e=>e.t).join(", ")}); });
  if(on("BONE")){ const bad = ex.teeth.filter(e=>e.render==="implant" && (sit[e.t]||{}).f && sit[e.t].f.kemikAz && e.form!=="short" && !has(e.t,"graft")).map(e=>e.t); if(bad.length) push("warn","BONE",{teeth:bad.join(", ")}); }
  if(on("E1")){ const bad = ex.teeth.filter(e=>e.txId==="implant" && (byT[e.t]||[]).some(o=>o.render==="ext" && o.v===e.v)).map(e=>e.t); if(bad.length) push("info","E1",{teeth:bad.join(", ")}); }
  if(on("PRESENT")){ const bad = ex.teeth.filter(e=>e.render==="implant" && !finalS[e.t].cekim && (!sit[e.t] || ["intact","rct","crown","caries","comp","amalg","inlay","veneer","bridge","other"].includes(sit[e.t].s))).map(e=>e.t); if(bad.length) push("warn","PRESENT",{teeth:bad.join(", ")}); }
  if(on("D1")){ const wv = items.filter(i=>i.tx==="whitening").map(i=>i.v), cv = ex.teeth.filter(e=>e.render==="crown"||e.render==="veneer").map(e=>e.v); if(wv.length && cv.length && Math.max(...wv) > Math.min(...cv)) push("warn","D1",{}); }
  if(on("PREREQ")){
    items.forEach(it=>{
      const pr = it.b ? (bundle(it.b)||{}).prereq : (tx(it.tx)||{}).prereq; if(!pr) return;
      const jaws = it.b ? [bundle(it.b).jaw] : (it.jaws||[]);
      jaws.forEach(j=>{ const have = implantsInJaw(sit, items, j, it.v); if(have < pr.count) push("warn","PREREQ",{name:itemName(it), need:pr.count, have, jaw:t(j==="u"?"jaw_u":"jaw_l")}, it.v); });
    });
  }
  const R_ = r => ex.teeth.some(e=>r.includes(e.render));
  const age = +l.age || 0;
  if(on("M1") && age && age<18 && R_(["implant"])) push("warn","M1",{age});
  if(on("M2") && med.bisph && R_(["implant","ext"])) push("warn","M2",{});
  if(on("M3") && med.anticoag && R_(["ext","implant","sinus","graft"])) push("warn","M3",{});
  if(on("M4") && med.diabetes && R_(["implant"])) push("warn","M4",{});
  if(on("M5") && med.chemo && R_(SURGICAL)) push("warn","M5",{});
  if(on("M6") && med.pregnant && R_(SURGICAL)) push("warn","M6",{});
  return R;
}
const ruleText = r => t("r_"+r.code, r.p);

/* ---------------- AKILLI ÖNERİ (yerel "Magic Fill") ---------------- */
function suggestPlan(c){
  const sit = c.situation || {}, items = [];
  const it = (v,txId,teeth,o) => items.push(Object.assign({id:uid("i"), v, tx:txId, teeth}, o||{}));
  const bad = s => s && ["missing","root","pontic"].includes(s.s);
  ["u","l"].forEach(j=>{
    const row = j==="u" ? UPPER : LOWER, core = row.filter(t=>t%10!==8);
    const lost = core.filter(t=>bad(sit[t]));
    if(lost.length >= 8){
      const toExt = core.filter(t=>sit[t] && sit[t].s==="root").concat(core.filter(t=>!sit[t] || ["intact","caries","rct","crown","comp","amalg"].includes((sit[t]||{}).s)));
      if(toExt.length) it(1,"ext_simple",toExt);
      items.push({id:uid("i"), v:1, b:j==="u"?"ao4_u":"ao4_l", teeth:bundle(j==="u"?"ao4_u":"ao4_l").teeth});
      it(1,"temp_rem",[],{jaws:[j]});
      items.push({id:uid("i"), v:2, b:j==="u"?"fp_u":"fp_l", teeth:bundle(j==="u"?"fp_u":"fp_l").teeth});
      return;
    }
    const roots = core.filter(t=>sit[t] && sit[t].s==="root"), miss = core.filter(t=>sit[t] && sit[t].s==="missing");
    if(roots.length) it(1,"ext_simple",roots);
    const imp = [...roots, ...miss];
    if(imp.length){ it(1,"implant",imp,{brand:"b_neod"}); it(2,"crown_imp",imp);
      const bone = imp.filter(t=>sit[t] && sit[t].f && sit[t].f.kemikAz); if(bone.length) it(1,"graft",bone,{brand:"g1"});
      [1,2].forEach(q=>{ const ts = imp.filter(t=>quadOf(t)===q && POSTERIOR_UP.includes(t) && sit[t] && sit[t].f && sit[t].f.sinusSark); if(ts.length) it(1,"sinus_open",[ts[0]]); });
    }
  });
  const car = ALL_TEETH.filter(t=>sit[t] && sit[t].s==="caries"); if(car.length) it(1,"filling",car);
  if(!items.length) it(1,"consult",[],{qty:1});
  else it(1,"pano",[],{qty:1});
  return items;
}

/* ---------------- FİYATLANDIRMA ---------------- */
const CUR_OF = {GB:"GBP",IE:"EUR",US:"USD",SA:"SAR",AE:"AED",TR:"TRY",AU:"USD"};
function convert(eur, cur){ const v = eur * ((S.clinic.fx||{})[cur] || 1); const step = cur==="TRY" ? 50 : v>=1000 ? 10 : 5; return Math.round(v/step)*step; }
function roundTo(v, step){ return step>0 ? Math.round(v/step)*step : Math.round(v); }
function curStep(cur){ return cur==="TRY" ? S.clinic.rounding*10 : S.clinic.rounding; }
function unitEUR(it){ if(it.manual) return null; if(it.b){ const b = bundle(it.b); if(!b) return 0; const br = brandOf(it); if(br && b.brands) return br.price; return b.price + (br ? (br.price-IMP_BASE)*b.imp.length : 0); } const b = brandOf(it); if(b) return b.price; const x = tx(it.tx); return x ? x.price : 0; }
function qtyOf(it){
  if(it.b) return 1; if(it.manual) return it.qty||1;
  const x = tx(it.tx); if(!x) return 1;
  if(x.unit==="tooth") return (it.teeth||[]).length || 1;
  if(x.unit==="side") return new Set((it.teeth||[]).map(quadOf)).size || 1;
  if(x.unit==="arch") return (it.jaws||[]).length || 1;
  return it.qty || 1;
}
function unitLabel(it, lang){ if(it.b) return t("u_pkg",null,lang); if(it.manual) return t("u_piece",null,lang); const x = tx(it.tx); return t("u_"+(x?x.unit:"piece"),null,lang); }
function calcOption(c, op, cur, lang){
  const vmap = {}, lines = [];
  const all = [...(op.items||[]), ...(op.extras||[])];
  all.forEach(it=>{
    if(!it.v) return;
    const key = it.v+"|"+(it.b||it.tx||("m:"+it.name))+"|"+(it.brand||"")+"|"+(it.manual?it.id:"");
    const unit = it.manual ? (+it.price||0) : convert(unitEUR(it), cur);
    let L = vmap[key];
    if(!L){ L = vmap[key] = {v:it.v, txId:it.tx||null, b:it.b||null, brand:it.brand||null, manual:!!it.manual, nm:itemName(it, lang), br:(brandOf(it)||{}).n||"", unitL:unitLabel(it, lang), teeth:[], qty:0, unit, total:0, jaws:[]}; lines.push(L); }
    L.qty += qtyOf(it); (it.teeth||[]).forEach(t=>{ if(!L.teeth.includes(t)) L.teeth.push(t); }); (it.jaws||[]).forEach(j=>{ if(!L.jaws.includes(j)) L.jaws.push(j); });
    L.total = L.qty * L.unit;
  });
  const order = {ext:0,sinus:1,graft:2,implant:3,rct:4,fill:5,inlay:5,none:6,arch:7,crown:8,veneer:9};
  lines.sort((a,b)=> a.v-b.v || ((order[(tx(a.txId)||{}).render]??(a.b?3.5:6)) - (order[(tx(b.txId)||{}).render]??(b.b?3.5:6))));
  const nV = Math.max(c.visits||1, ...lines.map(l=>l.v), 1);
  const visits = []; for(let v=1; v<=nV; v++){ const ls = lines.filter(l=>l.v===v); visits.push({v, lines:ls, sub:ls.reduce((a,l)=>a+l.total,0)}); }
  // kron kademe paketi
  let tierAdj = 0, tierInfo = null;
  S.catalog.tx.filter(x=>x.tiers).forEach(x=>{
    const ls = lines.filter(l=>l.txId===x.id), q = ls.reduce((a,l)=>a+l.qty,0); if(!q) return;
    const unit = ls[0].unit, plain = q*unit; let best = plain, bn = 0;
    x.tiers.forEach(([n,p])=>{ if(q>=n){ const v = convert(p,cur) + (q-n)*unit; if(v<best){ best=v; bn=n; } } });
    if(best<plain){ tierAdj += plain-best; tierInfo = {n:bn, q, name:tn(x.n,lang)}; }
  });
  // paket (otel, transfer)
  const pkg = [];
  const hotelN = (op.hotel && +op.hotel.n) || 0;
  if(hotelN) pkg.push({k:"hotel", nm:t("pk_hotel",{n:hotelN},lang), total: op.hotel.free ? 0 : hotelN*convert(S.clinic.hotelNight,cur), free:!!op.hotel.free});
  if(op.transfer && op.transfer.on) pkg.push({k:"transfer", nm:t("pk_transfer",null,lang), total: op.transfer.free ? 0 : convert(S.clinic.transfer,cur)*nV, free:!!op.transfer.free});
  const pkgSum = pkg.reduce((a,p)=>a+p.total,0);
  const sub = lines.reduce((a,l)=>a+l.total,0) + pkgSum;
  const discPct = +op.disc || 0;
  const disc = Math.round((sub - tierAdj) * discPct / 100);
  const net = sub - tierAdj - disc;
  const step = curStep(cur), total = Math.max(0, roundTo(net, step)), rnd = total - net;
  const deposit = roundTo(total * ((c.pricing && c.pricing.deposit) ?? S.clinic.deposit) / 100, step);
  const share = visits.map((vv,i)=> vv.sub + (i===0 ? pkgSum : 0));
  const base = share.reduce((a,b)=>a+b,0) || 1;
  const pay = visits.map((vv,i)=>({v:vv.v, amount: roundTo(total*share[i]/base, step)}));
  const diff = total - pay.reduce((a,p)=>a+p.amount,0); if(pay.length) pay[pay.length-1].amount += diff;
  if(pay.length){ pay[0].amount -= deposit; }
  const missing = lines.filter(l=>l.manual && !l.unit).length;
  return {visits, lines, sub, tierAdj, tierInfo, pkg, discPct, disc, rnd, total, deposit, pay, missing, cur};
}
function stayDays(vv){ const r = vv.lines.map(l=> l.b ? "implant" : (tx(l.txId)||{}).render); if(r.includes("crown")||r.includes("veneer")) return [5,7]; if(r.some(x=>["implant","sinus","graft"].includes(x))) return [3,5]; return [1,2]; }
function gapText(c, items, lang){ const imp = expand(items).teeth.some(e=>e.render==="implant"); return imp ? t("gap_months",{a:S.clinic.gapMin,b:S.clinic.gapMax},lang) : t("gap_days",null,lang); }

function optDefaults(i){ return {name:["opt_std","opt_rec","opt_prem"][i]||"opt_std", rec:i===1}; }
function brandTier(x, i){ if(!x.brands) return null; const bs = x.brands.filter(b=>!b.form || b.form==="std").sort((a,b)=>a.price-b.price); if(!bs.length) return x.brands[0].id; return (i===0 ? bs[0] : i===2 ? bs[bs.length-1] : bs[Math.floor((bs.length-1)/2)]).id; }
function makeOpt(c, i){
  const d = optDefaults(i);
  const items = clone(c.items).map(it=>{
    const x = it.tx && tx(it.tx);
    if(x && x.brands && x.id==="implant") it.brand = brandTier(x, i) || it.brand;
    if(i===2 && it.tx==="crown_zr") it.tx = "crown_emax";
    if(i===0 && it.tx==="crown_emax") it.tx = "crown_zr";
    if(it.b){ const b = bundle(it.b);
      if(b && b.brands) it.brand = brandTier(b, i);
      else if(b && b.imp.length) it.brand = brandTier(tx("implant"), i);
      if(i===2 && it.b==="smile_zr_u"){ it.b = "smile_emax_u"; }
      if(i===0 && it.b==="smile_emax_u"){ it.b = "smile_zr_u"; } }
    return it;
  });
  const nights = c.visits>1 ? 5 : 6;
  return {id:uid("o"), name:d.name, custom:"", rec:d.rec, items, extras:[], disc:0, hotel:{n:nights, free:i>=1}, transfer:{on:true, free:true}, approved:null};
}
function initPricing(c, l){
  c.pricing = {cur: CUR_OF[(l||{}).country] || S.clinic.cur, lang: (l && LANGS.includes(l.lang)) ? l.lang : "en", nOpt:1, mode:"mat", opts:[makeOpt(c,0)], deposit:S.clinic.deposit, valid:S.clinic.valid, hidePrices:false, note:"", synced:JSON.stringify(c.items)};
  c.pricing.opts[0].rec = true;
}
const optName = (op, lang) => op.custom || t(op.name, null, lang);
function needsApproval(op){ const lim = S.clinic.limits[me().role] ?? 0; return (+op.disc||0) > lim && !op.approved; }
function discLimit(){ return S.clinic.limits[me().role] ?? 0; }

/* ---------------- TEKLİF → DEAL ---------------- */
function createQuote(c, o){
  o = o||{};
  const l = lead(c.leadId), p = c.pricing;
  const prev = S.quotes.filter(q=>q.caseId===c.id);
  prev.forEach(x=>{ if(x.status==="sent"||x.status==="viewed") x.status = "superseded"; });
  const q = {id:uid("Q"), token:token(), caseId:c.id, leadId:l.id, ver:prev.length+1, created:now(), status:"sent", viewedAt:null, views:0,
    lang:p.lang, cur:p.cur, hidePrices:!!p.hidePrices, validUntil:now()+p.valid*DAY, note:p.note||"", deposit:p.deposit,
    patient:{name:l.name, country:l.country, issue:l.issue||"", med:l.medNote||""},
    clinic:{name:S.clinic.name, legal:S.clinic.legal, phone:S.clinic.phone, email:S.clinic.email, web:S.clinic.web, address:S.clinic.address, city:S.clinic.city, color:S.clinic.color},
    dentist:(user(c.dentist)||{}).name||"", owner:(user(l.owner)||{}).name||"",
    situation:clone(c.situation), visits:c.visits,
    opts:p.opts.slice(0,p.nOpt).map(op=>({name:optName(op,p.lang), rec:!!op.rec, items:clone(op.items), extras:clone(op.extras), calc:calcOption(c, op, p.cur, p.lang)}))
  };
  if(!q.opts.some(x=>x.rec) && q.opts[0]) q.opts[0].rec = true;
  S.quotes.unshift(q);
  c.status = "sent";
  setLeadStatus(l.id, "offer_sent", o.silent);
  addActivity(l.id, "quote", "v"+q.ver);
  return q;
}
function stageList(d){ return ["accepted","deposit", ...d.visitsInfo.map(v=>"v"+v.v), "won"]; }
function createDeal(q, o){
  o = o||{};
  const op = q.opts[q.response ? q.response.opt : 0] || q.opts[0];
  const l = lead(q.leadId);
  const d = {id:uid("D"), leadId:q.leadId, caseId:q.caseId, quoteId:q.id, title:`${q.patient.name} — ${op.name}`, value:op.calc.total, cur:q.cur, stage:"accepted", created:now(),
    deposit:op.calc.deposit, visitsInfo:op.calc.pay.map(p=>({v:p.v, planned:p.amount + (p.v===1?op.calc.deposit:0), paid:0, date:null})), payments:[], owner:(l||{}).owner||S.me};
  S.deals.unshift(d);
  setLeadStatus(q.leadId, "won", true);
  addActivity(q.leadId, "deal", d.id);
  if(!o.silent) runWorkflow("deal_created", {leadId:q.leadId});
  return d;
}
function dealPaid(d){ return d.payments.reduce((a,p)=>a+p.amount,0); }
