/* DentaFlow web sohbet widget'ı — <script src="https://…/widget.js" data-key="w_…" async></script> */
(function () {
  var s = document.currentScript || document.querySelector('script[data-key][src*="widget.js"]');
  if (!s || window.__dfWidget) return; window.__dfWidget = 1;
  var KEY = s.getAttribute("data-key"), BASE = s.src.replace(/\/widget\.js.*$/, ""), API = BASE + "/api/public/widget/" + KEY;
  var LS = "df_w_" + KEY, st = {}; try { st = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) {}
  var save = function () { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} };
  var lang = (st.lang || navigator.language || "en").slice(0, 2);
  var T = { tr: { title: "Bize yazın", name: "Adınız", phone: "WhatsApp / telefon", email: "E-posta (isteğe bağlı)", treat: "İlgilendiğiniz tedavi", msg: "Mesajınız", start: "Sohbeti başlat", ph: "Mesaj yazın…", consent: "Bilgilerimin iletişim amacıyla işlenmesini kabul ediyorum", need: "Ad ve telefon/e-posta gerekli", ai: "AI asistan" },
    en: { title: "Chat with us", name: "Your name", phone: "WhatsApp / phone", email: "Email (optional)", treat: "Treatment you're interested in", msg: "Your message", start: "Start chat", ph: "Type a message…", consent: "I agree to my details being used to contact me", need: "Name and phone/email are required", ai: "AI assistant" },
    de: { title: "Schreiben Sie uns", name: "Ihr Name", phone: "WhatsApp / Telefon", email: "E-Mail (optional)", treat: "Gewünschte Behandlung", msg: "Ihre Nachricht", start: "Chat starten", ph: "Nachricht schreiben…", consent: "Ich stimme der Kontaktaufnahme zu", need: "Name und Telefon/E-Mail erforderlich", ai: "KI-Assistent" },
    ar: { title: "تواصل معنا", name: "الاسم", phone: "واتساب / هاتف", email: "البريد (اختياري)", treat: "العلاج المطلوب", msg: "رسالتك", start: "ابدأ المحادثة", ph: "اكتب رسالة…", consent: "أوافق على استخدام بياناتي للتواصل", need: "الاسم والهاتف أو البريد مطلوبان", ai: "مساعد ذكي" } };
  var t = T[lang] || T.en, cfg = { color: "#0E7C86", clinic: "", greeting: {}, position: "right" }, last = st.last || 0, timer = null, open = false;
  var el = function (tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  var esc = function (x) { return String(x || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var root = el("div", "position:fixed;bottom:18px;z-index:2147483000;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif");
  var btn = el("button", "width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.18);color:#fff;font-size:26px", "💬");
  var panel = el("div", "display:none;position:absolute;bottom:72px;width:min(360px,calc(100vw - 24px));height:min(540px,calc(100vh - 110px));background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.2);overflow:hidden;flex-direction:column;color:#1B2730");
  var head = el("div", "padding:14px 16px;color:#fff;font-weight:700;display:flex;align-items:center;gap:8px");
  var body = el("div", "flex:1;overflow:auto;padding:12px;background:#F5F7F8;display:flex;flex-direction:column;gap:8px");
  var foot = el("div", "border-top:1px solid #E3E8EC;padding:8px;display:flex;gap:6px");
  panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot); root.appendChild(panel); root.appendChild(btn);
  var bubble = function (m) {
    var mine = m.from === "visitor", b = el("div", "max-width:82%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-break:break-word;" + (mine ? "align-self:flex-end;color:#fff;background:" + cfg.color : "align-self:flex-start;background:#fff;border:1px solid #E3E8EC"));
    b.innerHTML = esc(m.body) + (!mine && (m.agent || m.ai) ? '<div style="font-size:11px;opacity:.6;margin-top:2px">' + esc(m.ai ? t.ai : m.agent) + "</div>" : ""); body.appendChild(b); body.scrollTop = 1e9;
  };
  var api = function (path, opts) { return fetch(API + path, opts).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); }); };
  var poll = function () { if (!st.token) return; api("/messages?token=" + encodeURIComponent(st.token) + "&after=" + last).then(function (r) { r.messages.forEach(function (m) { if (m.id > last) { last = m.id; bubble(m); } }); st.last = last; save(); }).catch(function () {}); };
  var chatUI = function () {
    foot.innerHTML = ""; var inp = el("input", "flex:1;border:1px solid #D7DEE3;border-radius:10px;padding:10px;font:inherit"); inp.placeholder = t.ph;
    var send = el("button", "border:0;border-radius:10px;padding:0 14px;color:#fff;cursor:pointer;background:" + cfg.color, "➤");
    var go = function () { var v = inp.value.trim(); if (!v) return; inp.value = ""; api("/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: st.token, body: v, id: "v" + Date.now() }) }).then(poll).catch(function () {}); };
    send.onclick = go; inp.onkeydown = function (e) { if (e.key === "Enter") go(); }; foot.appendChild(inp); foot.appendChild(send);
    body.innerHTML = ""; last = 0; poll(); clearInterval(timer); timer = setInterval(function () { if (open) poll(); }, 3500);
  };
  var formUI = function () {
    foot.innerHTML = ""; body.innerHTML = "";
    var g = cfg.greeting[lang] || cfg.greeting.en || ""; if (g) bubble({ from: "clinic", body: g });
    var f = el("form", "display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #E3E8EC;border-radius:12px;padding:12px");
    var inS = "border:1px solid #D7DEE3;border-radius:8px;padding:9px;font:inherit";
    f.innerHTML = '<input name="name" required placeholder="' + t.name + '" style="' + inS + '"><input name="phone" placeholder="' + t.phone + '" style="' + inS + '"><input name="email" type="email" placeholder="' + t.email + '" style="' + inS + '">' +
      '<input name="treatment" placeholder="' + t.treat + '" style="' + inS + '"><textarea name="message" rows="2" placeholder="' + t.msg + '" style="' + inS + '"></textarea>' +
      '<label style="font-size:12px;color:#5B6B76;display:flex;gap:6px"><input type="checkbox" name="consent" required>' + t.consent + '</label><div class="err" style="color:#B91C1C;font-size:12px"></div>' +
      '<button style="border:0;border-radius:10px;padding:11px;color:#fff;font-weight:700;cursor:pointer;background:' + cfg.color + '">' + t.start + "</button>";
    f.onsubmit = function (e) { e.preventDefault(); var d = new FormData(f); var p = { name: d.get("name"), phone: d.get("phone") || undefined, email: d.get("email") || undefined, treatment: d.get("treatment") || undefined, message: d.get("message") || undefined, consent: !!d.get("consent"), lang: lang, page: location.href };
      var u = {}; new URLSearchParams(location.search).forEach(function (v, k) { if (/^utm_|^ref$|^gclid$|^fbclid$/.test(k)) u[k.replace(/^utm_/, "")] = v; }); p.utm = u;
      if (!p.name || (!p.phone && !p.email)) { f.querySelector(".err").textContent = t.need; return; }
      api("/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).then(function (r) { st.token = r.token; save(); chatUI(); }).catch(function (x) { f.querySelector(".err").textContent = (x && x.message) || "Error"; }); };
    body.appendChild(f);
  };
  btn.onclick = function () { open = !open; panel.style.display = open ? "flex" : "none"; btn.innerHTML = open ? "✕" : "💬"; if (open) (st.token ? chatUI : formUI)(); };
  api("/config").then(function (c) { cfg = c; if (!T[lang] && T[c.lang]) t = T[c.lang];
    root.style[c.position === "left" ? "left" : "right"] = "18px"; panel.style[c.position === "left" ? "left" : "right"] = "0";
    btn.style.background = c.color; head.style.background = c.color; head.innerHTML = "🦷 " + esc(c.title || c.clinic || t.title);
    document.body.appendChild(root); }).catch(function () {});
})();
