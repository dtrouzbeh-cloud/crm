/* =====================================================================
   DATA — katalog, demo verisi, store
   ===================================================================== */
const LANGS = ["tr","en","de","ar"];
const LANG_NAMES = {tr:"Türkçe", en:"English", de:"Deutsch", ar:"العربية"};
const CURS = ["EUR","USD","GBP","TRY","AED","SAR"];
const VCOL = ["#10B981","#F59E0B","#6366F1","#EC4899","#0EA5E9","#84CC16"];
const vcol = v => VCOL[(v-1)%VCOL.length];
const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const ALL_TEETH = [...UPPER, ...LOWER];
const jawOf = t => t < 30 ? "u" : "l";
const quadOf = t => Math.floor(t/10);

/* Tedavi kategorileri — [tr,en,de,ar] */
const CATS = {
  imp:["İmplantoloji","Implantology","Implantologie","زراعة الأسنان"],
  crown:["Kron ve köprü","Crowns & bridges","Kronen & Brücken","التيجان والجسور"],
  veneer:["Laminate / veneer","Veneers","Veneers","القشور"],
  ext:["Çekim","Extractions","Extraktionen","الخلع"],
  surg:["Ağız cerrahisi","Oral surgery","Oralchirurgie","جراحة الفم"],
  endo:["Endodonti","Endodontics","Endodontie","علاج العصب"],
  perio:["Periodonti","Periodontics","Parodontologie","علاج اللثة"],
  resto:["Restoratif","Restorative","Restaurativ","الترميم"],
  prost:["Protez","Prosthetics","Prothetik","التركيبات"],
  diag:["Teşhis","Diagnostics","Diagnostik","التشخيص"],
  cos:["Kozmetik","Cosmetic","Ästhetik","التجميل"],
  other:["Diğer","Other","Sonstiges","أخرى"]
};
/* render: chart üzerindeki çizim tipi.  unit: tooth | side | arch | mouth | piece */
function TX(id,cat,n,unit,render,price,o){ return Object.assign({id,cat,n,unit,render,price,visits:[1,2,3],active:true,desc:null},o||{}); }
const TX_SEED = [
  TX("implant","imp",["Dental implant","Dental implant","Zahnimplantat","زرعة سنية"],"tooth","implant",450,{visits:[1,2],color:"#64748B",
    brands:[{id:"b_impl",n:"Implance",price:300,form:"std"},{id:"b_osst",n:"Osstem",price:380,form:"std"},{id:"b_neod",n:"Neodent (Straumann Group)",price:450,form:"std"},{id:"b_isys",n:"I-system (kısa / short)",price:550,form:"short"},{id:"b_ilnq",n:"I-linq (ince / narrow)",price:500,form:"narrow"},{id:"b_nobel",n:"Nobel Biocare",price:750,form:"std"},{id:"b_strm",n:"Straumann BLX",price:850,form:"std"}],
    desc:["Eksik dişin kökünün yerini alan titanyum vida.","A titanium screw that replaces the root of a missing tooth.","Eine Titanschraube, die die Wurzel eines fehlenden Zahns ersetzt.","برغي من التيتانيوم يحل محل جذر السن المفقود."]}),
  TX("implant_imm","imp",["Anında implant","Immediate implant","Sofortimplantat","زرعة فورية"],"tooth","implant",550,{visits:[1],color:"#475569"}),
  TX("crown_imp","imp",["İmplant üstü zirkonyum kron","Zirconia crown on implant","Zirkonkrone auf Implantat","تاج زركونيا على الزرعة"],"tooth","crown",220,{mat:"zr",visits:[2,3],needsImplant:true,color:"#2E6F95"}),
  TX("abutment","imp",["Abutment","Abutment","Abutment","دعامة"],"tooth","none",120,{visits:[2,3],needsImplant:true,color:"#94A3B8"}),

  TX("crown_zr","crown",["Zirkonyum kron","Zirconia crown","Zirkonkrone","تاج زركونيا"],"tooth","crown",180,{mat:"zr",color:"#2E6F95",
    tiers:[[16,2600],[20,3200],[24,3800],[28,4300]],
    desc:["Doğal görünümlü, metal içermeyen, dayanıklı kron.","A natural-looking, metal-free and durable crown.","Natürlich aussehende, metallfreie und langlebige Krone.","تاج طبيعي المظهر وخالٍ من المعدن ومتين."]}),
  TX("crown_emax","crown",["E-max kron","E-max crown","E-max-Krone","تاج إي ماكس"],"tooth","crown",250,{mat:"emax",color:"#9A4F84"}),
  TX("crown_pfm","crown",["Metal destekli porselen kron","Porcelain-fused-to-metal crown","Metallkeramikkrone","تاج خزف على معدن"],"tooth","crown",130,{mat:"srm",color:"#B7832F"}),
  TX("crown_por","crown",["Tam porselen kron","All-porcelain crown","Vollkeramikkrone","تاج خزفي كامل"],"tooth","crown",200,{mat:"por",color:"#4F8A5B"}),
  TX("bridge_unit","crown",["Köprü üyesi (zirkonyum)","Bridge unit (zirconia)","Brückenglied (Zirkon)","وحدة جسر (زركونيا)"],"tooth","crown",180,{mat:"zr",color:"#3B82A6"}),
  TX("crown_temp","crown",["Geçici kron","Temporary crown","Provisorische Krone","تاج مؤقت"],"tooth","crown",40,{mat:"temp",color:"#C9A227"}),

  TX("veneer_por","veneer",["Porselen laminate","Porcelain veneer","Keramikveneer","قشرة خزفية"],"tooth","veneer",280,{mat:"por",visits:[1,2],color:"#6BA37A"}),
  TX("veneer_emax","veneer",["E-max laminate","E-max veneer","E-max-Veneer","قشرة إي ماكس"],"tooth","veneer",320,{mat:"emax",visits:[1,2],color:"#B06A9C"}),

  TX("ext_simple","ext",["Basit çekim","Simple extraction","Einfache Extraktion","خلع بسيط"],"tooth","ext",50,{visits:[1],color:"#C0392B"}),
  TX("ext_surg","ext",["Cerrahi çekim","Surgical extraction","Chirurgische Extraktion","خلع جراحي"],"tooth","ext",120,{visits:[1],color:"#A93226"}),
  TX("ext_wisdom","ext",["20'lik diş çekimi","Wisdom tooth extraction","Weisheitszahnentfernung","خلع ضرس العقل"],"tooth","ext",150,{visits:[1],color:"#922B21"}),

  TX("graft","surg",["Kemik grefti","Bone graft","Knochenaufbau","طعم عظمي"],"tooth","graft",150,{visits:[1,2],color:"#B08A4E",
    brands:[{id:"g1",n:"1 cc",price:150},{id:"g2",n:"2 cc",price:250},{id:"g5",n:"5 cc",price:500}]}),
  TX("membrane","surg",["Membran","Membrane","Membran","غشاء"],"piece","none",200,{visits:[1,2],color:"#C8A97E"}),
  TX("sinus_open","surg",["Açık sinüs lift","Open sinus lift","Offener Sinuslift","رفع الجيب المفتوح"],"side","sinus",400,{visits:[1],color:"#5E97BD",
    desc:["Üst çenede kemik yüksekliği yetersizse sinüs tabanı nazikçe yükseltilir ve greft eklenir.","Where the upper jaw lacks bone height, the sinus floor is gently raised and graft is added.","Bei zu geringer Knochenhöhe im Oberkiefer wird der Sinusboden angehoben und Knochen aufgebaut.","عند نقص ارتفاع العظم في الفك العلوي يُرفع قاع الجيب بلطف ويضاف طعم عظمي."]}),
  TX("sinus_closed","surg",["Kapalı sinüs lift","Closed sinus lift","Geschlossener Sinuslift","رفع الجيب المغلق"],"side","sinus",250,{visits:[1],color:"#7FB2D1"}),
  TX("implant_rem","surg",["İmplant sökümü","Implant removal","Implantatentfernung","إزالة زرعة"],"tooth","ext",150,{visits:[1],color:"#7B241C"}),

  TX("rct","endo",["Kanal tedavisi","Root canal treatment","Wurzelkanalbehandlung","علاج العصب"],"tooth","rct",200,{visits:[1,2],color:"#C0392B"}),
  TX("rct_re","endo",["Kanal yenileme","Root canal retreatment","Revision Wurzelkanal","إعادة علاج العصب"],"tooth","rct",260,{visits:[1,2],color:"#A93226"}),

  TX("deep_clean","perio",["Derin temizlik (küretaj)","Deep cleaning","Tiefenreinigung","تنظيف عميق"],"mouth","none",150,{visits:[1],color:"#0EA5E9"}),
  TX("scaling","perio",["Diş taşı temizliği","Scaling & polishing","Zahnsteinentfernung","إزالة الجير"],"mouth","none",60,{visits:[1,2,3],color:"#38BDF8"}),

  TX("filling","resto",["Kompozit dolgu","Composite filling","Kompositfüllung","حشوة تجميلية"],"tooth","fill",90,{visits:[1,2],color:"#4E7C9E"}),
  TX("inlay","resto",["İnley / onley","Inlay / onlay","Inlay / Onlay","حشوة إنلاي / أونلاي"],"tooth","inlay",260,{visits:[1,2],color:"#8B6FC0"}),

  TX("temp_rem","prost",["Hareketli geçici protez","Removable temporary denture","Herausnehmbares Provisorium","طقم مؤقت متحرك"],"arch","arch",350,{visits:[1,2],color:"#D9778A"}),
  TX("temp_fix","prost",["Sabit geçici protez","Fixed temporary teeth","Festsitzendes Provisorium","أسنان مؤقتة ثابتة"],"arch","arch",350,{visits:[1,2],color:"#E08E9E"}),
  TX("temp_on_imp","prost",["İmplant üstü sabit geçici","Fixed temporary bridge on implants","Provisorische Brücke auf Implantaten","جسر مؤقت ثابت على الزرعات"],"arch","arch",600,{visits:[1],color:"#C2667A",prereq:{tx:"implant",count:4}}),
  TX("ti_bar","prost",["Titanyum bar","Titanium bar","Titansteg","قضيب تيتانيوم"],"arch","arch",300,{visits:[2,3],color:"#7C8A93",prereq:{tx:"implant",count:4}}),
  TX("denture","prost",["Akrilik total protez","Acrylic full denture","Acryl-Vollprothese","طقم أكريليك كامل"],"arch","arch",450,{visits:[1,2],color:"#E06A86"}),
  TX("snapon","prost",["Snap-on protez","Snap-on denture","Druckknopfprothese","طقم سناب أون"],"arch","arch",900,{visits:[2,3],color:"#CC5C7C",prereq:{tx:"implant",count:2}}),
  TX("hybrid","prost",["Hibrit sabit protez (zirkonyum)","Hybrid fixed prosthesis (zirconia)","Hybride Brücke (Zirkon)","تركيبة هجينة ثابتة (زركونيا)"],"arch","arch",3200,{visits:[2,3],color:"#2E6F95",prereq:{tx:"implant",count:4}}),

  TX("consult","diag",["Muayene ve konsültasyon","Consultation & examination","Beratung & Untersuchung","استشارة وفحص"],"piece","none",0,{visits:[1,2,3],color:"#64748B"}),
  TX("pano","diag",["Panoramik röntgen","Panoramic X-ray","Panoramaröntgen","أشعة بانورامية"],"piece","none",30,{visits:[1,2,3],color:"#64748B"}),
  TX("cbct","diag",["3D tomografi (CBCT)","3D CT scan (CBCT)","3D-DVT (CBCT)","أشعة ثلاثية الأبعاد"],"piece","none",80,{visits:[1,2,3],color:"#64748B"}),

  TX("whitening","cos",["Diş beyazlatma","Teeth whitening","Bleaching","تبييض الأسنان"],"mouth","none",250,{visits:[1,2,3],color:"#FACC15"}),
  TX("nightguard","cos",["Gece plağı","Night guard","Knirscherschiene","واقي ليلي"],"piece","none",120,{visits:[1,2,3],color:"#A3A3A3"}),

  TX("sedation","other",["Sedasyon","Sedation","Sedierung","التخدير الواعي"],"piece","none",600,{visits:[1,2,3],color:"#8B5CF6",
    desc:["Hekiminiz önerirse.","If recommended by your dentist.","Falls von Ihrem Zahnarzt empfohlen.","إذا أوصى به طبيبك."]})
];

/* Paketler: imp = implant dişleri, crown = kron/köprü span dişleri */
function BU(id,n,jaw,o){ return Object.assign({id,n,jaw,imp:[],crown:[],mat:null,arch:null,minVisits:1,visits:[1,2,3],prereq:null,active:true},o); }
const BUNDLE_SEED = [
  BU("ao4_u",["All-on-4 üst çene","All-on-4 upper","All-on-4 Oberkiefer","أول أون 4 علوي"],"u",{imp:[15,12,22,25],minVisits:2,visits:[1],price:3200,color:"#475569"}),
  BU("ao4_l",["All-on-4 alt çene","All-on-4 lower","All-on-4 Unterkiefer","أول أون 4 سفلي"],"l",{imp:[45,42,32,35],minVisits:2,visits:[1],price:3200,color:"#475569"}),
  BU("ao6_u",["All-on-6 üst çene","All-on-6 upper","All-on-6 Oberkiefer","أول أون 6 علوي"],"u",{imp:[16,14,12,22,24,26],minVisits:2,visits:[1],price:4400,color:"#334155"}),
  BU("ao6_l",["All-on-6 alt çene","All-on-6 lower","All-on-6 Unterkiefer","أول أون 6 سفلي"],"l",{imp:[46,44,42,32,34,36],minVisits:2,visits:[1],price:4400,color:"#334155"}),
  BU("fp_u",["Sabit protez üst (14 üye)","Fixed prosthesis upper (14 units)","Festsitzende Brücke OK (14 Glieder)","تركيبة ثابتة علوية (14 وحدة)"],"u",{crown:[17,16,15,14,13,12,11,21,22,23,24,25,26,27],mat:"zr",brands:[{id:"fp_acr",n:"Akrilik hibrit + titanyum bar / Acrylic hybrid",price:2600},{id:"fp_zr",n:"Monolitik zirkonyum / Monolithic zirconia",price:3600},{id:"fp_zrp",n:"Zirkonyum + porselen / Layered zirconia",price:4600}],visits:[2,3],prereq:{tx:"implant",count:4},price:3600,color:"#2E6F95"}),
  BU("fp_l",["Sabit protez alt (14 üye)","Fixed prosthesis lower (14 units)","Festsitzende Brücke UK (14 Glieder)","تركيبة ثابتة سفلية (14 وحدة)"],"l",{crown:[47,46,45,44,43,42,41,31,32,33,34,35,36,37],mat:"zr",brands:[{id:"fp_acr",n:"Akrilik hibrit + titanyum bar / Acrylic hybrid",price:2600},{id:"fp_zr",n:"Monolitik zirkonyum / Monolithic zirconia",price:3600},{id:"fp_zrp",n:"Zirkonyum + porselen / Layered zirconia",price:4600}],visits:[2,3],prereq:{tx:"implant",count:4},price:3600,color:"#2E6F95"}),
  BU("smile_emax_u",["Gülüş tasarımı E-max üst (10)","Smile makeover E-max upper (10)","Smile Makeover E-max OK (10)","ابتسامة هوليود إي ماكس علوي (10)"],"u",{crown:[15,14,13,12,11,21,22,23,24,25],mat:"emax",visits:[1,2],price:2900,color:"#9A4F84"}),
  BU("smile_zr_u",["Gülüş tasarımı zirkonyum üst (10)","Smile makeover zirconia upper (10)","Smile Makeover Zirkon OK (10)","ابتسامة هوليود زركونيا علوي (10)"],"u",{crown:[15,14,13,12,11,21,22,23,24,25],mat:"zr",visits:[1,2],price:2200,color:"#2E6F95"}),
  BU("smile_zr_l",["Gülüş tasarımı zirkonyum alt (10)","Smile makeover zirconia lower (10)","Smile Makeover Zirkon UK (10)","ابتسامة هوليود زركونيا سفلي (10)"],"l",{crown:[45,44,43,42,41,31,32,33,34,35],mat:"zr",visits:[1,2],price:2000,color:"#2E6F95"}),
  BU("snap_u",["Snap-on protez üst · 2 implant","Snap-on denture upper · 2 implants","Druckknopfprothese OK · 2 Implantate","طقم سناب أون علوي · زرعتان"],"u",{imp:[13,23],arch:"snapon",minVisits:2,visits:[1],price:2600,color:"#CC5C7C"}),
  BU("snap_l",["Snap-on protez alt · 2 implant","Snap-on denture lower · 2 implants","Druckknopfprothese UK · 2 Implantate","طقم سناب أون سفلي · زرعتان"],"l",{imp:[43,33],arch:"snapon",minVisits:2,visits:[1],price:2600,color:"#CC5C7C"})
];
BUNDLE_SEED.forEach(b=> b.teeth = [...new Set([...b.imp, ...b.crown])]);

/* Mevcut durum paleti (16 durum + 2 bulgu) */
const SIT = [
  ["intact","#F3EBD9"],["missing","#FFFFFF"],["root","#B9895A"],["rct","#C0392B"],["crown","#C9D0D4"],["caries","#5B3A1E"],
  ["comp","#8DB3CF"],["amalg","#6B7378"],["impab","#9DA8AD"],["impcr","#7E8C93"],["bridge","#AEB8BE"],["pontic","#D5DBDE"],
  ["impacted","#E6D7B8"],["inlay","#B9A3D6"],["veneer","#E8D6E2"],["other","#94A3B8"]
];
const FINDINGS = [["sinusSark","#5E97BD"],["kemikAz","#D4A017"]];

const ROLES = {
  admin:{perm:["leads","cases","dx","price","send","approve","deals","tasks","catalog","settings","money"]},
  manager:{perm:["leads","cases","dx","price","send","approve","deals","tasks","catalog","money"]},
  sales:{perm:["leads","cases","price","send","deals","tasks","money"]},
  dentist:{perm:["cases","dx","tasks"]},
  coordinator:{perm:["leads","cases","deals","tasks"]}
};
const LEAD_ST = ["new","contacted","interested","awaiting","plan_ready","offer_sent","won","lost"];
const LEAD_ST_COL = {new:"#0EA5E9",contacted:"#6366F1",interested:"#8B5CF6",awaiting:"#F59E0B",plan_ready:"#14B8A6",offer_sent:"#0E7C86",won:"#10B981",lost:"#94A3B8"};
const SOURCES = ["meta","google","tiktok","website","referral","walkin","whatsapp"];
const COUNTRIES = {GB:"🇬🇧",DE:"🇩🇪",NL:"🇳🇱",FR:"🇫🇷",US:"🇺🇸",SA:"🇸🇦",IE:"🇮🇪",AU:"🇦🇺",AE:"🇦🇪",TR:"🇹🇷",BE:"🇧🇪",CH:"🇨🇭",SE:"🇸🇪",IT:"🇮🇹",ES:"🇪🇸"};
const MED = ["diabetes","anticoag","bisph","pregnant","chemo","smoker","heart"];

/* ---------------- store ---------------- */
const KEY = "dc_state_v1";
let S = null;
let saveT = 0;
function save(){ clearTimeout(saveT); saveT = setTimeout(()=>{ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }, 250); }
function load(){ try{ const j = localStorage.getItem(KEY); if(j){ const o = JSON.parse(j); if(o && o.v===1) return o; } }catch(e){} return null; }
function uid(p){ S.seq = S.seq||{}; S.seq[p] = (S.seq[p]||100) + 1; return p + S.seq[p]; }
const now = () => Date.now();
const DAY = 864e5;
const clone = o => JSON.parse(JSON.stringify(o));
const byId = (arr, id) => arr.find(x=>x.id===id);
const tx = id => byId(S.catalog.tx, id);
const bundle = id => byId(S.catalog.bundles, id);
const lead = id => byId(S.leads, id);
const kase = id => byId(S.cases, id);
const user = id => byId(S.users, id);
const me = () => user(S.me) || S.users[0];
const can = p => ROLES[me().role].perm.includes(p);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const initials = n => String(n||"?").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
const avColor = s => { let h=0; for(const c of String(s)) h=(h*31+c.charCodeAt(0))%360; return `hsl(${h} 45% 45%)`; };
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b=>b.toString(36).padStart(2,"0")).join("").slice(0,16);

function addActivity(leadId, type, text){ const l = lead(leadId); if(!l) return; (l.activity = l.activity||[]).unshift({at:now(), type, text, by:S.me}); l.lastAct = now(); }
function setLeadStatus(leadId, st, silent){ const l = lead(leadId); if(!l || l.status===st) return; const from = l.status; l.status = st; addActivity(leadId, "status", from+"→"+st); if(!silent) runWorkflow("lead_status", {leadId, status:st}); }

/* Workflow kuralları — otomatik görev üretimi */
const WORKFLOWS = [
  {on:"lead_created", task:"wf_contact", type:"call", prio:"high", dueH:1},
  {on:"lead_status", status:"interested", task:"wf_call2", type:"call", prio:"high", dueH:2},
  {on:"lead_status", status:"awaiting", task:"wf_dx", type:"follow", prio:"med", dueH:24},
  {on:"lead_status", status:"plan_ready", task:"wf_send", type:"follow", prio:"high", dueH:0},
  {on:"lead_status", status:"offer_sent", task:"wf_follow", type:"follow", prio:"med", dueH:48},
  {on:"deal_created", task:"wf_travel", type:"general", prio:"med", dueH:24}
];
function runWorkflow(ev, ctx){
  WORKFLOWS.filter(w=>w.on===ev && (!w.status || w.status===ctx.status)).forEach(w=>{
    const l = lead(ctx.leadId); if(!l) return;
    S.tasks.unshift({id:uid("t"), title:w.task, tParams:{name:l.name}, type:w.type, prio:w.prio, due:now()+w.dueH*36e5, leadId:l.id, owner:l.owner||S.me, done:false, auto:true});
  });
}

function seedState(){
  const d = n => now() - n*DAY;
  const st = {
    v:1, seq:{}, me:"u1",
    ui:{lang:"tr", theme:"auto", leadView:"list", collapsed:false, tour:true},
    clinic:{name:"Demo Dental Clinic", legal:"Demo Dental Clinic Ltd.", city:"İstanbul", country:"TR", address:"Örnek Mah. Sağlık Cad. No:1", phone:"+90 555 000 00 00", email:"hello@demodental.example", web:"demodental.example",
      color:"#0E7C86", cur:"EUR", fx:{EUR:1,USD:1.08,GBP:.85,TRY:38,AED:3.97,SAR:4.05}, numbering:"FDI",
      limits:{admin:100,manager:15,sales:5,dentist:0,coordinator:5}, deposit:10, rounding:10, valid:14, hotelNight:65, transfer:60,
      gapMin:3, gapMax:6, approvalAll:false},
    users:[
      {id:"u1",name:"Selin Kaya",role:"admin"},{id:"u2",name:"Dr. Emre Aydın",role:"dentist"},{id:"u3",name:"Mert Demir",role:"sales"},
      {id:"u4",name:"Aylin Öz",role:"manager"},{id:"u5",name:"Can Yıldız",role:"coordinator"}],
    catalog:{tx:clone(TX_SEED), bundles:clone(BUNDLE_SEED), rules:{B6:true,BRIDGE:true,SINUS_NOIMP:true,BONE:true,SINUS_LOW:true,E1:true,D1:true,PREREQ:true,PRESENT:true,M1:true,M2:true,M3:true,M4:true,M5:true,M6:true}},
    leads:[], cases:[], quotes:[], deals:[], tasks:[]
  };
  S = st;
  const L = (o) => { const l = Object.assign({id:uid("L"), status:"new", temp:"warm", owner:"u3", created:now(), lang:"en", med:{}, notes:[], activity:[], tags:[]}, o); l.lastAct = l.created; S.leads.push(l); return l; };
  const l1 = L({name:"James O'Brien", phone:"+44 7700 900123", email:"james.obrien@example.com", country:"GB", lang:"en", source:"meta", status:"awaiting", temp:"hot", interest:"All-on-4", age:54, created:d(3), med:{diabetes:true}, medNote:"Tip 2 diyabet · Metformin", issue:"Most upper teeth are loose or missing, wants fixed teeth."});
  const l2 = L({name:"Anna Müller", phone:"+49 151 2345 6789", email:"anna.mueller@example.de", country:"DE", lang:"de", source:"google", status:"plan_ready", temp:"warm", interest:"Zirconia crowns", age:41, created:d(6), issue:"Old crowns, discoloured front teeth."});
  const l3 = L({name:"Layla Al-Sayed", phone:"+966 50 123 4567", email:"layla@example.sa", country:"SA", lang:"ar", source:"tiktok", status:"offer_sent", temp:"hot", interest:"Hollywood smile", age:33, created:d(9), issue:"Wants a brighter smile."});
  const l4 = L({name:"Pieter de Vries", phone:"+31 6 1234 5678", email:"pieter@example.nl", country:"NL", lang:"en", source:"referral", status:"won", temp:"hot", interest:"Implants", age:62, created:d(21), med:{anticoag:true}, medNote:"Antikoagülan (Warfarin)", issue:"Missing lower molars."});
  L({name:"Sophie Martin", phone:"+33 6 12 34 56 78", email:"sophie.m@example.fr", country:"FR", lang:"en", source:"website", status:"new", temp:"warm", interest:"Veneers", created:now()-2*36e5});
  L({name:"Michael Brown", phone:"+1 202 555 0147", email:"mbrown@example.com", country:"US", lang:"en", source:"meta", status:"contacted", temp:"cold", interest:"Implants", created:d(2)});
  L({name:"Siobhán Kelly", phone:"+353 85 123 4567", email:"siobhan@example.ie", country:"IE", lang:"en", source:"whatsapp", status:"interested", temp:"warm", interest:"All-on-6", created:d(4)});
  L({name:"Liam Walker", phone:"+61 412 345 678", email:"liam.w@example.au", country:"AU", lang:"en", source:"google", status:"lost", temp:"cold", interest:"Crowns", created:d(30), lost:"price"});
  S.leads.forEach(l=>{ l.activity.push({at:l.created, type:"created", text:l.source, by:l.owner}); });

  const sit = o => o;
  const C = o => { const c = Object.assign({id:uid("C"), status:"pool", dentist:null, created:now(), situation:{}, sitDone:false, visits:1, items:[], step:1, pricing:null, notes:[]}, o); S.cases.push(c); return c; };
  // c1: havuzda — üst çene çoğunlukla eksik
  const s1 = {}; [17,16,15,14,24,25,26,27].forEach(t=>s1[t]={s:"missing"}); [13,12,11,21,22,23].forEach(t=>s1[t]={s:"root"}); s1[46]={s:"crown"}; s1[36]={s:"amalg"}; s1[16]={s:"missing",f:{sinusSark:true}}; s1[26]={s:"missing",f:{sinusSark:true}};
  C({leadId:l1.id, created:d(2), situation:s1, sitDone:true, step:2});
  // c2: teşhis edildi
  const it = (v,txId,teeth,o) => Object.assign({id:uid("i"), v, tx:txId, teeth}, o||{});
  const c2 = C({leadId:l2.id, status:"diagnosed", dentist:"u2", created:d(5), visits:2, sitDone:true, step:3,
    situation:{11:{s:"crown"},21:{s:"crown"},12:{s:"comp"},22:{s:"comp"},36:{s:"rct"},46:{s:"caries"}},
    items:[it(1,"rct",[46]), it(1,"crown_temp",[13,12,11,21,22,23]), it(2,"crown_zr",[13,12,11,21,22,23]), it(2,"crown_zr",[46]), it(1,"whitening",[],{qty:1})]});
  // c3: teklif gönderildi — gülüş tasarımı
  const c3 = C({leadId:l3.id, status:"sent", dentist:"u2", created:d(8), visits:2, sitDone:true, step:4,
    situation:{14:{s:"comp"},24:{s:"comp"}}, items:[it(1,"scaling",[],{qty:1}), it(2,null,BUNDLE_SEED[6].teeth,{b:"smile_emax_u"}), it(1,"whitening",[],{qty:1})]});
  // c4: kabul edildi — alt azı implantları
  const c4 = C({leadId:l4.id, status:"sent", dentist:"u2", created:d(18), visits:2, sitDone:true, step:4,
    situation:{36:{s:"missing"},37:{s:"missing"},46:{s:"missing"},47:{s:"root"},38:{s:"impacted"}},
    items:[it(1,"ext_surg",[47]), it(1,"implant",[36,37,46,47],{brand:"b_neod"}), it(1,"graft",[46],{brand:"g1"}), it(2,"crown_imp",[36,37,46,47])]});
  S.cases.forEach(c=>{ if(c.items.length) c.visits = Math.max(c.visits, ...c.items.map(i=>i.v)); });
  // fiyatlandırma + teklifler (engine yüklendikten sonra)
  [c2,c3,c4].forEach(c=> initPricing(c, lead(c.leadId)));
  c3.pricing.nOpt = 2; c3.pricing.opts = [makeOpt(c3, 0), makeOpt(c3, 1)]; c3.pricing.opts[1].items.forEach(i=>{ if(i.b==="smile_emax_u") i.b="smile_zr_u"; }); c3.pricing.opts[0].rec = true; c3.pricing.cur = "USD"; c3.pricing.lang = "ar";
  c4.pricing.lang = "en";
  const q3 = createQuote(c3, {silent:true}); q3.created = d(2); q3.status = "viewed"; q3.viewedAt = d(1);
  const q4 = createQuote(c4, {silent:true}); q4.created = d(12); q4.status = "accepted"; q4.viewedAt = d(11); q4.response = {opt:0, at:d(10), msg:""};
  const deal4 = createDeal(q4, {silent:true}); deal4.stage = "v1"; deal4.created = d(10); deal4.payments.push({id:uid("p"), amount:Math.round(deal4.value*.1), at:Math.max(d(9), new Date(new Date().getFullYear(), new Date().getMonth(), 1, 10).getTime()), v:1, note:"deposit"}); deal4.visitsInfo[0].date = d(-6); deal4.visitsInfo[0].paid = Math.round(deal4.value*.1);
  // walk-in deal
  S.deals.push({id:uid("D"), leadId:l2.id, caseId:null, quoteId:null, title:"Anna Müller — Konsültasyon", value:0, cur:"EUR", stage:"accepted", created:d(1), visitsInfo:[{v:1,planned:0,paid:0,date:d(-14)}], payments:[], owner:"u3"});
  S.deals[S.deals.length-1].value = 0;
  // görevler
  const T = o => S.tasks.push(Object.assign({id:uid("t"), type:"call", prio:"med", done:false, owner:"u3"}, o));
  T({title:"wf_contact", tParams:{name:"Sophie Martin"}, due:now()+36e5, leadId:S.leads[4].id, prio:"high", auto:true});
  T({title:"wf_dx", tParams:{name:"James O'Brien"}, due:now()-5*36e5, leadId:l1.id, type:"follow", owner:"u2"});
  T({title:"wf_send", tParams:{name:"Anna Müller"}, due:now()+2*36e5, leadId:l2.id, prio:"high", type:"follow", auto:true});
  T({title:"wf_follow", tParams:{name:"Layla Al-Sayed"}, due:now()+DAY, leadId:l3.id, type:"follow", auto:true});
  T({title:"wf_travel", tParams:{name:"Pieter de Vries"}, due:now()+3*DAY, leadId:l4.id, type:"general", owner:"u5", auto:true});
  T({title:"Liam — fiyat itirazı notu", due:d(4), leadId:S.leads[7].id, done:true, type:"general"});
  return S;
}
