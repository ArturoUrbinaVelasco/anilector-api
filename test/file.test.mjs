import {
  validateTarget, fileNameFrom, looksLikeSharePage, upstreamHeaders, MAX_BYTES,
} from "../lib/file.js";

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("✓", n)) : (fail++, console.log("✗", n)); };

/* ---------- validateTarget: destinos legítimos ---------- */
ok("acepta https público", validateTarget("https://archive.org/download/x/y.cbz").ok);
ok("acepta http público", validateTarget("http://ejemplo.com/manga.pdf").ok);
ok("normaliza y devuelve la url", validateTarget("https://ejemplo.com/a b.pdf").url.includes("a%20b.pdf"));

/* ---------- validateTarget: entradas inválidas ---------- */
ok("rechaza vacío", !validateTarget("").ok);
ok("rechaza undefined", !validateTarget(undefined).ok);
ok("rechaza no-URL", !validateTarget("esto no es url").ok);
ok("rechaza file://", !validateTarget("file:///etc/passwd").ok);
ok("rechaza ftp://", !validateTarget("ftp://ejemplo.com/x.zip").ok);
ok("rechaza javascript:", !validateTarget("javascript:alert(1)").ok);
ok("da 400 en URL inválida", validateTarget("nope").status === 400);

/* ---------- SSRF: red interna bloqueada ---------- */
const blocked = [
  "http://localhost/x", "http://LOCALHOST/x", "http://127.0.0.1/x",
  "http://127.1.2.3/x", "http://10.0.0.5/secret", "http://192.168.1.1/admin",
  "http://172.16.0.1/x", "http://172.31.255.255/x", "http://169.254.169.254/latest/meta-data/",
  "http://metadata.google.internal/x", "http://0.0.0.0/x", "http://100.64.0.1/x",
  "http://[::1]/x", "http://[fd00::1]/x", "http://[fe80::1]/x",
  "http://algo.internal/x", "http://sub.localhost/x",
];
for (const u of blocked) ok(`bloquea ${u}`, !validateTarget(u).ok && validateTarget(u).status === 403);

/* ---------- SSRF: públicas parecidas NO deben bloquearse ---------- */
const allowed = [
  "http://172.32.0.1/x",   // fuera de 172.16/12
  "http://172.15.0.1/x",   // fuera por abajo
  "http://11.0.0.1/x",     // no es 10/8
  "http://192.169.1.1/x",  // no es 192.168/16
  "http://100.63.0.1/x",   // fuera de CGNAT
  "https://midominio-localhost.com/x",
];
for (const u of allowed) ok(`permite ${u}`, validateTarget(u).ok);

/* ---------- nombre de archivo ---------- */
ok("nombre desde la ruta", fileNameFrom("https://x.com/a/b/Naruto%2001.cbz") === "Naruto 01.cbz");
ok("nombre desde content-disposition", fileNameFrom("https://x.com/d?id=9", 'attachment; filename="One Piece.pdf"') === "One Piece.pdf");
ok("nombre desde filename*", fileNameFrom("https://x.com/d", "attachment; filename*=UTF-8''Bleach%20T1.epub") === "Bleach T1.epub");
ok("nombre por defecto", fileNameFrom("https://x.com/") === "archivo");
ok("content-disposition gana a la ruta", fileNameFrom("https://x.com/z.bin", 'inline; filename="real.cbz"') === "real.cbz");

/* ---------- detección de página de compartir ---------- */
ok("html donde se espera archivo → página", looksLikeSharePage("text/html; charset=utf-8", "https://terabox.com/s/abc"));
ok("html real no se marca", !looksLikeSharePage("text/html", "https://x.com/doc.html"));
ok("binario no se marca", !looksLikeSharePage("application/zip", "https://x.com/a.cbz"));
ok("sin content-type no se marca", !looksLikeSharePage("", "https://x.com/a.cbz"));

/* ---------- cabeceras hacia el origen ---------- */
const h = upstreamHeaders({ range: "bytes=0-1023" }, "https://cdn.ejemplo.com/a/b.pdf");
ok("reenvía Range", h.Range === "bytes=0-1023");
ok("manda User-Agent", /Mozilla/.test(h["User-Agent"]));
ok("Referer al origen", h.Referer === "https://cdn.ejemplo.com/");
ok("sin Range no lo inventa", upstreamHeaders({}, "https://x.com/a").Range === undefined);

/* ---------- tope de tamaño ---------- */
ok("MAX_BYTES razonable (>100MB)", MAX_BYTES > 100 * 1024 * 1024);

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
