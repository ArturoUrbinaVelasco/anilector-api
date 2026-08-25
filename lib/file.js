/* ============================================================
   AniLector API — proxy de archivos
   El navegador no puede descargar un archivo de otro dominio si ese
   servidor no manda cabeceras CORS. Este proxy lo trae y lo re-sirve
   con CORS, sin guardar nada.

   IMPORTANTE (seguridad): al ser un proxy abierto hay que impedir que
   se use para alcanzar la red interna del servidor (SSRF) o para
   convertirlo en un descargador de cualquier cosa. De eso se encargan
   `validateTarget` y el límite de tamaño.
   ============================================================ */

export const MAX_BYTES = 190 * 1024 * 1024; // 190 MB: tope de cordura

/* Rangos que jamás deben alcanzarse desde un proxy público. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal", "instance-data",
]);

function isPrivateIPv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (m.slice(1).some((n) => Number(n) > 255)) return true; // malformada → fuera
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // loopback
  if (a === 0 || a >= 224) return true;                       // reservadas/multicast
  if (a === 169 && b === 254) return true;                    // link-local (metadata AWS)
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT 100.64.0.0/10
  return false;
}

function isPrivateIPv6(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (/^f[cd]/.test(h)) return true;      // fc00::/7 únicas locales
  if (/^fe[89ab]/.test(h)) return true;   // fe80::/10 link-local
  // IPv4 embebida (::ffff:10.0.0.1)
  const v4 = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4 && isPrivateIPv4(v4[1])) return true;
  return false;
}

/* Devuelve { ok: true, url } o { ok: false, status, error }. */
export function validateTarget(raw) {
  if (!raw || typeof raw !== "string")
    return { ok: false, status: 400, error: "Falta el parámetro 'url'." };

  let u;
  try { u = new URL(raw); }
  catch { return { ok: false, status: 400, error: "URL inválida." }; }

  if (u.protocol !== "http:" && u.protocol !== "https:")
    return { ok: false, status: 400, error: "Solo se permiten http y https." };

  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal"))
    return { ok: false, status: 403, error: "Destino no permitido." };
  if (isPrivateIPv4(host) || isPrivateIPv6(host))
    return { ok: false, status: 403, error: "Destino no permitido (red privada)." };

  return { ok: true, url: u.toString() };
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* Cabeceras que se reenvían al origen (Range permite que pdf.js pida
   solo un trozo del PDF en vez del archivo completo). */
export function upstreamHeaders(reqHeaders = {}, targetUrl) {
  const h = { "User-Agent": UA, Accept: "*/*" };
  const range = reqHeaders.range || reqHeaders.Range;
  if (range) h.Range = range;
  try { h.Referer = new URL(targetUrl).origin + "/"; } catch (_) {}
  return h;
}

/* Nombre de archivo sugerido, a partir de la URL o del Content-Disposition. */
export function fileNameFrom(targetUrl, contentDisposition) {
  const cd = contentDisposition || "";
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) { try { return decodeURIComponent(star[1].replace(/"/g, "")); } catch (_) {} }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  try {
    const p = new URL(targetUrl).pathname;
    const base = decodeURIComponent(p.split("/").filter(Boolean).pop() || "");
    if (base) return base;
  } catch (_) {}
  return "archivo";
}

/* Un HTML donde se esperaba un archivo casi siempre significa que el
   enlace era una PÁGINA de descarga (Terabox, Mega…), no el archivo. */
export function looksLikeSharePage(contentType, targetUrl) {
  if (!/text\/html/i.test(contentType || "")) return false;
  return !/\.html?($|\?)/i.test(targetUrl);
}

/* Cabeceras de respuesta hacia el navegador. */
export function responseHeaders(upstream, targetUrl) {
  const out = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition":
      `inline; filename="${fileNameFrom(targetUrl, upstream.headers.get("content-disposition")).replace(/["\\]/g, "")}"`,
  };
  for (const h of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
    const v = upstream.headers.get(h);
    if (v) out[h.replace(/(^|-)(\w)/g, (m) => m.toUpperCase())] = v;
  }
  return out;
}
