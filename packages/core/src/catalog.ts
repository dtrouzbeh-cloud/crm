// Varsayılan tedavi kataloğu (global seed). Klinik oluşturulurken kopyalanır; klinik dilediği gibi düzenler.
// Ad dizileri: [tr, en, de, ar]. Fiyatlar EUR baz (kur tablosu ile diğer para birimlerine çevrilir).
export type Unit = "tooth" | "side" | "arch" | "mouth" | "piece";
export type Render = "implant" | "crown" | "veneer" | "ext" | "fill" | "inlay" | "rct" | "graft" | "sinus" | "arch" | "none";
export type Material = "zr" | "emax" | "srm" | "por" | "old" | "temp" | "acr";
export interface Brand { id: string; n: string; price: number; form?: "std" | "short" | "narrow" }
export interface Treatment {
  id: string; cat: string; n: string[]; unit: Unit; render: Render; price: number; visits: number[]; active: boolean; desc: string[] | null;
  color?: string; mat?: Material; brands?: Brand[]; tiers?: [number, number][]; needsImplant?: boolean; prereq?: { tx: string; count: number } | null;
  prices?: Record<string, number>;
}
export interface Bundle {
  id: string; n: string[]; jaw: "u" | "l"; imp: number[]; crown: number[]; teeth: number[]; mat: Material | null; arch: string | null;
  minVisits: number; visits: number[]; prereq: { tx: string; count: number } | null; active: boolean; price: number; color: string; brands?: Brand[];
  prices?: Record<string, number>;
}

export const CATEGORIES: Record<string, string[]> = {
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

function TX(id: string, cat: string, n: string[], unit: Unit, render: Render, price: number, o: Partial<Treatment> = {}): Treatment { return Object.assign({ id, cat, n, unit, render, price, visits: [1, 2, 3], active: true, desc: null }, o); }
export const DEFAULT_TREATMENTS: Treatment[] = [
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
function BU(id: string, n: string[], jaw: "u" | "l", o: Partial<Bundle>): Bundle { const b = Object.assign({ id, n, jaw, imp: [] as number[], crown: [] as number[], teeth: [] as number[], mat: null, arch: null, minVisits: 1, visits: [1, 2, 3], prereq: null, active: true, price: 0, color: "#64748B" }, o) as Bundle; b.teeth = [...new Set([...b.imp, ...b.crown])]; return b; }
export const DEFAULT_BUNDLES: Bundle[] = [
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


