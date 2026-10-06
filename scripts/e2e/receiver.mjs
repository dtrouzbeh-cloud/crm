// Test alıcısı: giden webhook'ları yakalar (HTTPS, kendinden imzalı sertifika). GET /log → kayıtlar, GET /fail?n=1 → sonraki n isteğe 500
import { createServer } from "node:https";
import { readFileSync } from "node:fs";

const [cert, key, port] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 4299)];
const log = []; let failNext = 0;
createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const u = new URL(req.url, "https://x");
    if (req.method === "GET" && u.pathname === "/log") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(log)); }
    if (req.method === "GET" && u.pathname === "/fail") { failNext = Number(u.searchParams.get("n") ?? 1); return res.end("ok"); }
    const status = failNext > 0 ? (failNext--, 500) : 200;
    log.push({ at: Date.now(), path: u.pathname, headers: req.headers, body, status });
    res.statusCode = status; res.end(status === 200 ? "received" : "temporary error");
  });
}).listen(port, "127.0.0.1", () => console.log("receiver on", port));
