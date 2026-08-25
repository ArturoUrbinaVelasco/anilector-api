/* ============================================================
   AniLector API — proxy HLS
   Resuelve reproducción embebida de canales que el navegador
   bloquea por CORS o por "mixed content" (stream HTTP en web HTTPS).
   El servidor trae el stream y lo re-sirve por HTTPS + CORS, y
   reescribe la lista para que también los segmentos pasen por aquí.
   ============================================================ */

/* Reescribe una playlist .m3u8: cada URI (segmentos, sub-listas,
   llaves y pistas) pasa a apuntar a /api/hls?url=<absoluta>. */
export function rewritePlaylist(text, targetUrl, selfBase) {
  const wrap = (abs) => `${selfBase}/api/hls?url=${encodeURIComponent(abs)}`;
  const toAbs = (uri) => {
    try { return new URL(uri, targetUrl).href; } catch { return uri; }
  };
  const rewriteAttrUri = (line) =>
    line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${wrap(toAbs(u))}"`);

  return text
    .split(/\r?\n/)
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.startsWith("#")) {
        // Reescribe URIs embebidas en etiquetas (EXT-X-KEY, EXT-X-MEDIA, MAP…)
        return /URI="/.test(l) ? rewriteAttrUri(l) : line;
      }
      // Línea de recurso (segmento o sub-playlist)
      return wrap(toAbs(l));
    })
    .join("\n");
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function isPlaylist(url, contentType) {
  return /\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(contentType || "");
}

export async function fetchUpstream(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  // Algunos servidores de streaming exigen Referer/Origin de su propio dominio.
  let ref = "";
  try { const u = new URL(url); ref = `${u.protocol}//${u.host}/`; } catch (_) {}
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(ref ? { Referer: ref, Origin: ref.replace(/\/$/, "") } : {}),
      },
    });
  } finally { clearTimeout(timer); }
}
