// @ts-nocheck — saf SVG üretici (string). Web, hasta sayfası ve sunucu taraflı PDF aynı çizimi kullanır.
// Şematik diş çizimi — parametrik anatomik SVG (FDI / Universal / Palmer)
import { UPPER, LOWER, quadOf } from "./engine.ts";
const VCOL = ["#10B981","#F59E0B","#6366F1","#EC4899","#0EA5E9","#84CC16"];
export const vcol = (v) => VCOL[(v-1)%VCOL.length];
const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const GW = {u:{1:34,2:27,3:30,4:28,5:27,6:40,7:37,8:33}, l:{1:22,2:24,3:28,4:29,5:29,6:42,7:40,8:37}};
const GC = {u:{1:30,2:26,3:30,4:26,5:25,6:24,7:23,8:21}, l:{1:23,2:24,3:28,4:25,5:25,6:24,7:23,8:22}};
const GR = {u:{1:46,2:42,3:56,4:44,5:45,6:42,7:40,8:33}, l:{1:40,2:42,3:52,4:47,5:48,6:44,7:42,8:34}};
const CR = {u:{1:.41,2:.38,3:.37,4:.36,5:.36,6:.375,7:.375,8:.37}, l:{1:.36,2:.36,3:.39,4:.36,5:.37,6:.41,7:.41,8:.4}};
export const MAT = {
  zr:{g:["#C3D8E7","#EAF3F9","#FFFFFF","#F6FAFC"], s:"#9DBBD0", c:"#2E6F95"},
  emax:{g:["#E6CFE0","#F8EEF5","#FDF8FB","#EFEAF3"], s:"#CDA6C1", c:"#9A4F84"},
  srm:{g:["#E6D3AC","#F9EFD9","#FDF8EE","#FDF8EE"], s:"#CFB27A", c:"#B7832F"},
  por:{g:["#CFE3D1","#EEF7EE","#FAFDF9","#EDF4F0"], s:"#9DC4A3", c:"#4F8A5B"},
  old:{g:["#C9D0D4","#E3E8EB","#F1F4F5","#E9EDEF"], s:"#9AA3A7", c:"#7E8A90"},
  temp:{g:["#F3E3B3","#FBF3DC","#FFFBEF","#FBF3DC"], s:"#C9A227", c:"#C9A227"},
  acr:{g:["#F2C7CF","#FBE7EA","#FFF5F6","#FBE7EA"], s:"#D98E9A", c:"#CC5C7C"}
};
const geom = t => { const up = t<30, j = up?"u":"l", d = t%10; return {d, up, w:GW[j][d], ch:GC[j][d], rl:GR[j][d]}; };
const cerv = t => { const {up,d,w} = geom(t); return w*CR[up?"u":"l"][d]; };
function spline(pts, close){
  const n = pts.length, P = i => pts[Math.max(0, Math.min(n-1, i))], f = v => Math.round(v*100)/100;
  let s = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for(let i=0;i<n-1;i++){ const p0=P(i-1), p1=P(i), p2=P(i+1), p3=P(i+2);
    s += ` C${f(p1[0]+(p2[0]-p0[0])/6)},${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)},${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])},${f(p2[1])}`; }
  return s + (close ? " Z" : "");
}
function crownPts(t){
  const {d, up, w, ch} = geom(t), h = w/2, c = cerv(t);
  const side = (ym, yd, top) => [[-c*.5,-ch*.05],[-c,0],[-h*.9,ch*.3],[-h,ch*ym], ...top, [h,ch*yd],[h*.9,ch*.28],[c,0],[c*.5,-ch*.05],[0,-ch*.065],[-c*.5,-ch*.05]];
  if(up){
    if(d===1) return side(.8,.66,[[-h*.94,ch*.96],[-h*.55,ch*1.005],[h*.2,ch*1.005],[h*.72,ch*.95]]);
    if(d===2) return side(.78,.6,[[-h*.9,ch*.95],[-h*.35,ch],[h*.35,ch*.97],[h*.82,ch*.84]]);
    if(d===3) return side(.74,.6,[[-h*.72,ch*.88],[-h*.06,ch*1.02],[h*.55,ch*.86]]);
    if(d<=5) return side(.8,.72,[[-h*.7,ch*.93],[-h*.02,ch*1.01],[h*.62,ch*.92]]);
    return side(.8,.72,[[-h*.78,ch*.95],[-h*.45,ch*1.01],[-h*.04,ch*.9],[h*.4,ch*.99],[h*.78,ch*.9]]);
  }
  if(d<=2) return side(.86,.84,[[-h*.9,ch*.99],[-h*.3,ch*1.01],[h*.3,ch*1.01],[h*.88,ch*.98]]);
  if(d===3) return side(.78,.62,[[-h*.7,ch*.9],[-h*.08,ch*1.02],[h*.55,ch*.86]]);
  if(d<=5) return side(.8,.74,[[-h*.68,ch*.93],[0,ch*1.01],[h*.62,ch*.92]]);
  if(d===6) return side(.82,.72,[[-h*.8,ch*.96],[-h*.5,ch*1.01],[-h*.2,ch*.92],[h*.1,ch*.99],[h*.36,ch*.92],[h*.62,ch*.96],[h*.86,ch*.86]]);
  return side(.82,.74,[[-h*.78,ch*.96],[-h*.44,ch*1.01],[-h*.02,ch*.91],[h*.4,ch*.99],[h*.8,ch*.9]]);
}
const crownCache = {};
const crownPath = t => crownCache[t] || (crownCache[t] = spline(crownPts(t), true));
function rootSpec(t){
  const {d, up} = geom(t);
  if(up){
    if(d===4) return {n:2, f:.68, r0:.52, spread:0, lm:[1,.96]};
    if(d===6) return {n:2, f:.34, r0:.52, spread:.12, lm:[1,.9], back:{x:.1, r:.5, lm:1.06}};
    if(d===7) return {n:2, f:.45, r0:.52, spread:.06, lm:[1,.92], back:{x:.12, r:.5, lm:1.03}};
    if(d===8) return {n:1, r:.95, tilt:.35};
    return {n:1, r:1, tilt: d===3 ? .12 : .16};
  }
  if(d===6) return {n:2, f:.3, r0:.5, spread:.2, lm:[1,.93]};
  if(d===7) return {n:2, f:.36, r0:.5, spread:.12, lm:[1,.92]};
  if(d===8) return {n:1, r:.95, tilt:.4};
  return {n:1, r:1, tilt: d<=2 ? .08 : .14};
}
function singleRoot(c, L, tilt, x0){
  x0 = x0||0; const cen = u => x0 + tilt*c*u*u, hw = u => c*(1 - .78*Math.pow(u,1.7));
  const us = [0,.3,.6,.85,.97], lft = us.map(u=>[cen(u)-hw(u), -L*u]), rgt = us.slice().reverse().map(u=>[cen(u)+hw(u), -L*u]);
  return {pts:[...lft, [cen(1), -L], ...rgt], centers:[us.map(u=>[cen(u), -L*u])]};
}
function twoRoots(c, L, sp){
  const r0 = c*sp.r0, roots = [-1,1].map((sg,i)=>{ const Li = L*sp.lm[i];
    return {sg, L:Li, cen:u => sg*(c-r0) + sg*sp.spread*c*u + .22*c*u*u, hw:u => r0*(1-.6*Math.pow(u,1.8))}; });
  const [a,b] = roots, f = sp.f;
  const down = (r, us, edge) => us.map(u=>[r.cen(u)+edge*r.hw(u), -r.L*u]);
  const U = [0,.3,.6,.85,.97], Ui = [f,.55,.8,.97].filter((u,i)=>i===0||u>f+.05);
  const fu = f*.92, fx = (a.cen(f)+a.hw(f) + b.cen(f)-b.hw(f))/2;
  const pts = [...down(a,U,-1), [a.cen(1), -a.L], ...down(a,Ui.slice().reverse(),1), [fx, -L*fu], ...down(b,Ui,-1), [b.cen(1), -b.L], ...down(b,U.slice().reverse(),1)];
  return {pts, centers: roots.map(r=>U.map(u=>[r.cen(u), -r.L*u]))};
}
function implantDim(form, w, rl){ return form==="short" ? {top:w*.29, bot:w*.23, L:rl*.52} : form==="narrow" ? {top:w*.07, bot:w*.045, L:rl*1.2} : {top:w*.21, bot:w*.13, L:rl*.82}; }
export const crownKindOf = s => !s.kron ? null : s.implant ? "imp" : s.gone ? "pontic" : "nat";

function toothSVG(t, s, id){
  const {d, up, w, ch, rl} = geom(t), h = w/2, c = cerv(t);
  const imp = !!s.implant, kind = crownKindOf(s), ghost = s.gone && !imp && !kind;
  const dash = ghost ? 'stroke-dasharray="3 2"' : "";
  let g = "";
  if(imp){
    const dm = implantDim(s.implant, w, rl), L = dm.L;
    g += `<path d="M${-dm.top},0 L${-dm.bot},${-L+4} Q0,${-L-2} ${dm.bot},${-L+4} L${dm.top},0 Z" fill="url(#${id}ti)" stroke="#5F6C72" stroke-width=".9"/>`;
    for(let y=-5; y>-L+6; y-=4.2){ const hw = dm.top - (dm.top-dm.bot)*(-y/L), oh = s.implant==="narrow" ? 1 : 1.6; g += `<path d="M${-hw-oh},${y} Q0,${y-2.6} ${hw+oh},${y-1.4}" stroke="#5F6C72" stroke-width=".9" fill="none"/>`; }
    const ab = s.implant==="short" ? .16 : s.implant==="narrow" ? .06 : .14;
    g += `<path d="M${-w*ab},0 L${-w*(ab-.03)},${ch*.42} L${w*(ab-.03)},${ch*.42} L${w*ab},0 Z" fill="url(#${id}ti)" stroke="#5F6C72" stroke-width=".9"/>`;
  } else if(!(s.gone && kind)) {
    const sp = rootSpec(t), fill = ghost ? "none" : `url(#${id}rt)`, stroke = ghost ? "#B8BFC2" : "#BFA67C";
    let br = null;
    if(sp.back){ br = singleRoot(c*sp.back.r, rl*sp.back.lm, .35, c*sp.back.x); g += `<path d="${spline(br.pts, true)}" fill="${ghost?"none":"#DCC7A0"}" stroke="${stroke}" stroke-width=".8" ${dash}/>`; }
    const R = sp.n===2 ? twoRoots(c, rl, sp) : singleRoot(c*sp.r, rl, sp.tilt);
    g += `<path d="${spline(R.pts, true)}" fill="${fill}" stroke="${stroke}" stroke-width=".9" ${dash}/>`;
    if(s.kanal && !ghost){
      if(br) g += `<path d="${spline(br.centers[0].map((p,i)=>i===0?[0,ch*.3]:p))}" stroke="#C0392B" stroke-opacity=".7" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
      R.centers.forEach(cs=> g += `<path d="${spline(cs.map((p,i)=>i===0?[0,ch*.3]:[p[0]*.9,p[1]]))}" stroke="#C0392B" stroke-width="2" stroke-linecap="round" fill="none"/>`);
    }
  }
  const cp = crownPath(t), molar = d>=6;
  const groove = col => molar ? (up || d!==6 ? `<path d="M${-h*.04},${ch*.9} Q${-h*.02},${ch*.66} ${-h*.08},${ch*.44}" stroke="${col}" stroke-opacity=".45" stroke-width=".9" fill="none"/>`
      : `<path d="M${-h*.2},${ch*.92} Q${-h*.2},${ch*.68} ${-h*.26},${ch*.46} M${h*.36},${ch*.92} Q${h*.36},${ch*.72} ${h*.3},${ch*.56}" stroke="${col}" stroke-opacity=".45" stroke-width=".9" fill="none"/>`) : "";
  if(s.rootOnly && !kind && !imp){
    // kök artığı: kırık kron kütüğü
    g += `<path d="${spline([[-c,0],[-c*.95,ch*.28],[-c*.4,ch*.2],[0,ch*.34],[c*.45,ch*.18],[c*.95,ch*.3],[c,0],[0,-ch*.06]], true)}" fill="#C79B6B" stroke="#8C6239" stroke-width=".9"/>`;
  } else if(kind){
    const mat = MAT[s.kron] ? s.kron : "zr", mm = MAT[mat], pontic = kind==="pontic";
    const cpK = pontic ? spline(crownPts(t).map(([x,y])=> y<0 ? [x*.92, y*1.8] : [x,y]), true) : cp;
    if(pontic) g += `<ellipse cx="0" cy="${-ch*.04}" rx="${c*1.05}" ry="${ch*.14}" fill="#C97F86" opacity=".32"/>`;
    g += `<path d="${cpK}" fill="url(#${id}m_${mat})"/><path d="${cpK}" fill="url(#${id}volK)" stroke="${mm.s}" stroke-width=".9" ${mat==="temp"?'stroke-dasharray="3 2"':""}/>`;
    if(mat==="srm" || mat==="old") g += `<path d="${spline([[-c*.98,ch*.03],[-c*.5,-ch*.03],[0,-ch*.045],[c*.5,-ch*.03],[c*.98,ch*.03]])}" stroke="#6F777B" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    if(mat==="emax" || mat==="por") g += `<path d="${spline([[-h*.5,ch*.86],[-h*.15,ch*.9],[h*.25,ch*.89],[h*.5,ch*.84]])}" stroke="#C9DCE8" stroke-opacity=".35" stroke-width="${Math.max(1.5,ch*.07)}" stroke-linecap="round" fill="none"/>`;
    g += groove(mm.c).replace('stroke-opacity=".45"','stroke-opacity=".3"');
    g += `<path d="${spline([[-h*.55,ch*.22],[-h*.62,ch*.5],[-h*.45,ch*.8],[-h*.2,ch*.72],[-h*.22,ch*.4],[-h*.35,ch*.2]], true)}" fill="url(#${id}gls)" opacity=".85"/>`;
    g += `<ellipse cx="${-h*.38}" cy="${ch*.36}" rx="${Math.max(1.2,w*.05)}" ry="${Math.max(2,ch*.12)}" fill="#fff" opacity=".95" transform="rotate(-12 ${-h*.38} ${ch*.36})"/>`;
  } else if(imp){
    g += `<path d="${cp}" fill="none" stroke="#9AA3A7" stroke-width="1" stroke-dasharray="3 2"/>`;
  } else if(ghost){
    g += `<path d="${cp}" fill="none" stroke="#B8BFC2" stroke-width="1" ${dash}/>`;
  } else {
    const back = molar || d>=4 ? `<path d="${spline(crownPts(t).map(([x,y])=>[x*.86+h*.06, y>ch*.5 ? y*.97 : y]), true)}" transform="translate(0,${-ch*.05})" fill="#EDE3CE" stroke="#C9B99A" stroke-width=".7"/>` : "";
    const hl = `<path d="M${-h*.42},${ch*.2} C${-h*.62},${ch*.45} ${-h*.55},${ch*.75} ${-h*.3},${ch*.86}" stroke="#fff" stroke-opacity=".75" stroke-width="${Math.max(1.6,w*.07)}" stroke-linecap="round" fill="none"/>`;
    g += back + `<path d="${cp}" fill="url(#${id}${d<=3?"ei":"em"})" stroke="#BFAE8C" stroke-width=".9"/>` + groove("#A8946E") + hl;
    if(s.veneer){ const vm = MAT[s.veneer]||MAT.por; g += `<path d="${spline(crownPts(t).filter(([x,y])=>y>=0).map(([x,y])=>[x*.9,y*.98+ch*.02]), true)}" fill="url(#${id}m_${MAT[s.veneer]?s.veneer:"por"})" fill-opacity=".9" stroke="${vm.s}" stroke-width="1.1"/>`; }
    if(s.caries) g += `<path d="${spline([[-w*.18,ch*.62],[-w*.05,ch*.82],[w*.14,ch*.74],[w*.12,ch*.52],[-w*.06,ch*.5]], true)}" fill="#5B3A1E" opacity=".85"/>`;
    if(s.dolgu){ const fc = {comp:["#8DB3CF","#5E8DB0"], amalg:["#7B8489","#4F575B"], inlay:["#C7B3E3","#8B6FC0"], plan:["#7FA7C4","#4E7C9E"]}[s.dolgu] || ["#7FA7C4","#4E7C9E"];
      g += `<path d="${spline([[-w*.31,ch*.44],[-w*.22,ch*.8],[w*.06,ch*.86],[w*.3,ch*.68],[w*.2,ch*.34],[-w*.14,ch*.3]], true)}" fill="${fc[0]}" stroke="${fc[1]}" stroke-width=".8"/>`; }
  }
  return g;
}

function defsSVG(id){
  const lg = (n,stops,v) => `<linearGradient id="${id}${n}" x1="0" y1="0" x2="${v?0:1}" y2="${v?1:0}">${stops.map(([o,c,a])=>`<stop offset="${o}" stop-color="${c}"${a!=null?` stop-opacity="${a}"`:""}/>`).join("")}</linearGradient>`;
  let s = `<defs><pattern id="${id}gp" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#EFDDBB"/><circle cx="2" cy="2" r="1.3" fill="#B08A4E"/><circle cx="5.5" cy="5" r="1" fill="#C9A36A"/></pattern>`;
  s += lg("ei",[[0,"#EFE3C8"],[.35,"#FBF6EA"],[.8,"#FDFBF5"],[1,"#E4ECF0"]],1) + lg("em",[[0,"#EFE3C8"],[.4,"#FAF4E6"],[1,"#FDFAF2"]],1) + lg("rt",[[0,"#DCC49A"],[.7,"#EADBBE"],[1,"#F0E4CC"]],1);
  for(const k in MAT) s += lg("m_"+k, MAT[k].g.map((c,i)=>[[0,.3,.7,1][i],c]),1);
  s += `<radialGradient id="${id}volK" cx=".42" cy=".5" r=".72"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#4E6475" stop-opacity=".4"/></radialGradient>`;
  s += `<linearGradient id="${id}gls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  s += lg("ti",[[0,"#9DA8AD"],[.45,"#DCE2E4"],[1,"#8E999E"]],0);
  s += `<pattern id="${id}hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff" fill-opacity=".75"/><line x1="0" y1="0" x2="0" y2="5" stroke="#AEB6B9" stroke-width="1.4"/></pattern>`;
  s += lg("gu",[[0,"#F3CFCF",.15],[.6,"#EBAFB1",.45],[1,"#E29A9E",.6]],1) + lg("gl",[[0,"#E29A9E",.6],[.4,"#EBAFB1",.45],[1,"#F3CFCF",.15]],1);
  return s + `</defs>`;
}

export function toothLabel(t, sys){
  const q = quadOf(t), d = t%10;
  if(sys==="UNIVERSAL") return String(q===1 ? 9-d : q===2 ? 8+d : q===3 ? 25-d : 24+d);
  if(sys==="PALMER") return d + ({1:"┘",2:"└",3:"┐",4:"┌"}[q]);
  return String(t);
}

/* states: {t: renderState}, opts: {sel:Set, preview:Set, spans:[{teeth,label,v}], dots:true, numbering:"FDI"} */
let chartSeq = 0;
export function chartSVG(states, opts){
  opts = opts||{};
  const W = 600, gap = 2, mid = 10, occU = 140, occL = 152;
  const id = "c" + (++chartSeq) + "_";
  const sys = opts.numbering || "FDI";
  const st = t => states[t] || {};
  const rowW = row => row.reduce((a,t)=>a+geom(t).w,0) + gap*14 + mid;
  const sel = opts.sel || new Set(), pre = opts.preview || new Set();
  let out = `<svg viewBox="0 -24 ${W} 310" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dental chart">${defsSVG(id)}`;
  out += `<line x1="${W/2}" y1="20" x2="${W/2}" y2="244" stroke="#DCE2E4" stroke-dasharray="2 3"/>`;
  const posAll = {};
  const drawRow = (row, up) => {
    let x = (W - rowW(row))/2; const pos = {}; let teethSvg = "";
    row.forEach((t, i)=>{
      if(i===8) x += mid - gap;
      const s = st(t), {w, ch} = geom(t);
      const cx = x + w/2, sx = (quadOf(t)===1 || quadOf(t)===4) ? -1 : 1;
      const imp = s.impacted && !s.gone;
      const ty = up ? occU - ch - (imp?18:0) : occL + ch + (imp?18:0), sy = up ? 1 : -1;
      pos[t] = posAll[t] = {x, w, cx, ch};
      const on = sel.has(t), pv = pre.has(t);
      let grp = `<g data-t="${t}">`;
      grp += `<rect class="hit" x="${x-1}" y="${up?18:occL-4}" width="${w+2}" height="${up?occU-14:240-occL}" rx="5" fill="${on?"rgba(14,124,134,.16)":pv?"rgba(245,158,11,.10)":"transparent"}" ${on?'stroke="#0E7C86" stroke-width="1.6"':pv?'stroke="#F59E0B" stroke-width="1.4" stroke-dasharray="4 3"':""}/>`;
      grp += `<g transform="translate(${cx},${ty}) scale(${sx},${sy})${imp?` rotate(${up?-14:14})`:""}"${imp?' opacity=".8"':""}>${toothSVG(t, s, id)}</g>`;
      if(s.cekim){ const cy = up ? occU - ch*.5 : occL + ch*.5; if(!s.implant && !s.kron) grp += `<path d="M${cx-w*.32},${cy-9} L${cx+w*.32},${cy+9} M${cx+w*.32},${cy-9} L${cx-w*.32},${cy+9}" stroke="#C0392B" stroke-width="2.4" stroke-linecap="round"/>`; }
      if(s.other) grp += `<circle cx="${cx}" cy="${up?occU-ch*.5:occL+ch*.5}" r="7" fill="#fff" stroke="#64748B"/><text x="${cx}" y="${(up?occU-ch*.5:occL+ch*.5)+3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#64748B">?</text>`;
      if(opts.dots!==false && s.pv) grp += `<circle cx="${cx}" cy="${up?22:238}" r="3.6" fill="${vcol(s.pv)}"/>`;
      grp += `<text x="${cx}" y="${up?12:256}" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="${on?"#0E7C86":"#5F6B70"}" font-weight="${on?700:500}">${toothLabel(t, sys)}</text></g>`;
      teethSvg += grp; x += w + gap;
    });
    const cejY = t => up ? occU - pos[t].ch : occL + pos[t].ch, dir = up ? 1 : -1, band = 34;
    const edge = up ? Math.min(...row.map(cejY)) - band : Math.max(...row.map(cejY)) + band;
    let gp = "", first = true;
    row.forEach((t,i)=>{ const p = pos[t], ce = cejY(t), s = st(t), flat = s.gone && !s.implant && !s.kron;
      const nx = i<row.length-1 ? pos[row[i+1]].x : p.x+p.w, papR = ce + dir*p.ch*(flat?.12:.3), xl = p.x - gap/2, xr = (p.x+p.w+nx)/2;
      if(first){ gp = `M${xl-4},${edge} L${xl-4},${ce+dir*p.ch*.3} L${xl},${ce+dir*p.ch*(flat?.12:.3)}`; first=false; }
      gp += flat ? ` L${xr},${papR}` : ` C${p.x+p.w*.18},${ce-dir*1.5} ${p.x+p.w*.82},${ce-dir*1.5} ${xr},${papR}`; });
    const lastP = pos[row[row.length-1]]; gp += ` L${lastP.x+lastP.w+4},${edge} Z`;
    const gum = `<path d="${gp}" fill="url(#${id}${up?"gu":"gl"})" pointer-events="none"/>`;
    // köprü konnektörleri
    let con = "";
    for(let i=0;i<row.length-1;i++){
      const a=row[i], b=row[i+1], sa=st(a), sb=st(b);
      if(!(sa.kron && sb.kron)) continue;
      const ka=crownKindOf(sa), kb=crownKindOf(sb); if(ka!=="pontic" && kb!=="pontic" && !(sa.span && sa.span===sb.span)) continue;
      const pa=pos[a], pb=pos[b], m = Math.min(pa.ch,pb.ch), mat = (ka==="pontic"?sa:sb).kron, fillc = (MAT[mat]||MAT.zr).g[2];
      const ya = up ? occU - m*.74 : occL + m*.2, yb = up ? occU - m*.2 : occL + m*.74, xa = pa.x+pa.w-6, xb = pb.x+6, xm=(xa+xb)/2, dp=(yb-ya)*.2;
      con += `<path d="M${xa},${ya} Q${xm},${ya+dp} ${xb},${ya} L${xb},${yb} Q${xm},${yb-dp} ${xa},${yb} Z" fill="${fillc}" pointer-events="none"/>`;
    }
    // sinüs lift (kadran başına)
    let sin = "", sark = "", kem = "", gr = "";
    if(up) [1,2].forEach(qd=>{
      const ts = row.filter(t=>quadOf(t)===qd && st(t).sinus); if(!ts.length) return;
      const x0 = Math.min(...ts.map(t=>pos[t].x)) - 4, x1 = Math.max(...ts.map(t=>pos[t].x+pos[t].w)) + 4, mx = (x0+x1)/2, floor = 88, top = 50, gt = 60;
      sin += `<path d="M${x0},${floor} C${x0-4},${top+18} ${x0+10},${top} ${mx},${top} C${x1-10},${top} ${x1+4},${top+18} ${x1},${floor} Q${mx},${floor+10} ${x0},${floor} Z" fill="#EAF3F9" stroke="#7FB2D1" stroke-width="1.2" stroke-dasharray="4 2"/>`;
      sin += `<path d="M${x0+2},${gt+6} Q${mx},${gt-6} ${x1-2},${gt+6} L${x1},${floor} Q${mx},${floor+10} ${x0},${floor} Z" fill="url(#${id}gp)" stroke="#B08A4E" stroke-width="1.2"/>`;
    });
    if(up) [1,2].forEach(qd=>{
      const ts = row.filter(t=>quadOf(t)===qd && st(t).sinusSark && !st(t).sinus).sort((a,b)=>pos[a].x-pos[b].x); if(!ts.length) return;
      const x0 = pos[ts[0]].x - 6, x1 = pos[ts[ts.length-1]].x + pos[ts[ts.length-1]].w + 6, mx=(x0+x1)/2, top=40, lo = Math.min(...ts.map(cejY)) - 22;
      sark += `<path d="M${x0},${top+30} C${x0-2},${top+8} ${x0+12},${top} ${mx},${top} C${x1-12},${top} ${x1+2},${top+8} ${x1},${top+30} Q${mx},${lo+12} ${x0},${top+30} Z" fill="#DCEBF5" fill-opacity=".9" stroke="#5E97BD" stroke-width="1.2" stroke-dasharray="4 2"/>`;
    });
    if(!up) [3,4].forEach(qd=>{
      const ts = row.filter(t=>quadOf(t)===qd && st(t).kemikAz).sort((a,b)=>pos[a].x-pos[b].x); if(!ts.length) return;
      const x0 = pos[ts[0]].x - 3, x1 = pos[ts[ts.length-1]].x + pos[ts[ts.length-1]].w + 3, ce = Math.max(...ts.map(cejY)), crest = ce + 14, canal = ce + 39, xm=(x0+x1)/2;
      kem += `<rect x="${x0}" y="${ce+2}" width="${x1-x0}" height="${crest-ce-2}" fill="url(#${id}hatch)" opacity=".75"/>`;
      kem += `<path d="M${x0-6},${canal-5} Q${xm},${canal} ${x1+6},${canal-5} L${x1+6},${canal+5} Q${xm},${canal+10} ${x0-6},${canal+5} Z" fill="#F6E7A8" fill-opacity=".95" stroke="#C9A227" stroke-width="1"/>`;
    });
    row.forEach(t=>{ if(!st(t).greft) return; const p=pos[t], ce=cejY(t), y0 = up ? ce-48 : ce+4, y1 = up ? ce-4 : ce+48;
      gr += `<rect x="${p.x-1}" y="${y0}" width="${p.w+2}" height="${y1-y0}" rx="${Math.min(10,p.w*.4)}" fill="url(#${id}gp)" fill-opacity=".62" stroke="#B08A4E" stroke-width="1" stroke-dasharray="2.5 2" pointer-events="none"/>`; });
    out += sark + sin + con + teethSvg + gum + gr + kem;
  };
  drawRow(UPPER, true); drawRow(LOWER, false);
  // span etiketleri (köprü, tam çene protez, paket)
  (opts.spans||[]).forEach(sp=>{
    const ts = sp.teeth.filter(t=>posAll[t]); if(!ts.length) return;
    const up = ts[0] < 30, x0 = Math.min(...ts.map(t=>posAll[t].x)), x1 = Math.max(...ts.map(t=>posAll[t].x+posAll[t].w));
    const y = up ? -2 : 264, ty = up ? -10 : 280, col = sp.color || (sp.v ? vcol(sp.v) : "#0E7C86");
    out += `<path d="M${x0},${y+(up?5:-5)} L${x0},${y} L${x1},${y} L${x1},${y+(up?5:-5)}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round"/>`;
    const lbl = esc(sp.label), tw = Math.min(x1-x0, lbl.length*5.6+16), mx = (x0+x1)/2;
    out += `<rect x="${mx-tw/2}" y="${ty-9}" width="${tw}" height="13" rx="6.5" fill="${col}"/><text x="${mx}" y="${ty+.5}" text-anchor="middle" font-size="8.6" font-weight="650" font-family="system-ui,sans-serif" fill="#fff">${lbl.length*5.6+16>x1-x0 ? lbl.slice(0,Math.max(4,Math.floor((x1-x0-16)/5.6)))+"…" : lbl}</text>`;
  });
  return out + `</svg>`;
}

/* lejant: label(k) çeviri fonksiyonu */
export function legendHTML(states, label){
  const used = new Set();
  Object.values(states).forEach(s=>{
    if(s.cekim) used.add("cekim"); if(s.implant) used.add("implant"); const k = crownKindOf(s);
    if(k==="pontic") used.add("pontic"); if(s.kron) used.add("m_"+s.kron); if(s.gone && !s.implant && !s.kron) used.add("eksik");
    if(s.dolgu) used.add("f_"+s.dolgu); if(s.kanal) used.add("kanal"); if(s.sinus) used.add("sinus"); if(s.greft) used.add("greft");
    if(s.sinusSark) used.add("sinusSark"); if(s.kemikAz) used.add("kemikAz"); if(s.veneer) used.add("veneer"); if(s.caries) used.add("caries");
    if(s.rootOnly) used.add("rootOnly"); if(s.impacted) used.add("impacted");
  });
  const sw = {
    cekim:`<i style="background:#C0392B;border-radius:50%"></i>`, implant:`<i style="background:#B9C2C6;border:1px solid #6F7C82;width:6px"></i>`,
    pontic:`<i style="background:linear-gradient(#D3E3EE,#fff);border:1px dashed #AFC8D8"></i>`, eksik:`<i style="background:#fff;border:1.2px dashed #9AA3A7"></i>`,
    kanal:`<i style="background:#C0392B;height:3px"></i>`, sinus:`<i style="background:#EFDDBB;border:1.2px solid #B08A4E"></i>`, greft:`<i style="background:#EFDDBB;border:1.2px dotted #B08A4E"></i>`,
    sinusSark:`<i style="background:#DCEBF5;border:1.2px dashed #5E97BD"></i>`, kemikAz:`<i style="background:repeating-linear-gradient(45deg,#E4E7E8 0 3px,#fff 3px 6px);border-bottom:2px solid #D4A017"></i>`,
    veneer:`<i style="background:#F3E3EE;border:1px solid #CDA6C1"></i>`, caries:`<i style="background:#5B3A1E"></i>`, rootOnly:`<i style="background:#C79B6B"></i>`, impacted:`<i style="background:#EDE3CE;border:1px dashed #A8946E"></i>`
  };
  const keys = [...used];
  return keys.map(k=>{
    let s = sw[k];
    if(k.startsWith("m_")){ const m = MAT[k.slice(2)]; s = `<i style="background:linear-gradient(${m.g[0]},${m.g[2]});border:1px solid ${m.s}"></i>`; }
    if(k.startsWith("f_")){ const c = {comp:"#8DB3CF",amalg:"#7B8489",inlay:"#C7B3E3",plan:"#7FA7C4"}[k.slice(2)]; s = `<i style="background:${c}"></i>`; }
    return `<span>${s}${esc(label("lg_"+k))}</span>`;
  }).join("");
}
