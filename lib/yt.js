/* ============================================================
   AniLector API — búsqueda de YouTube del lado servidor
   Obtiene la página de resultados de YouTube y extrae los videos
   de ytInitialData (como hacen los frontends abiertos tipo NewPipe).
   La reproducción en la app es con el iframe OFICIAL de YouTube.
   ============================================================ */

// Extrae el objeto JSON balanceado que sigue a un marcador.
export function extractJson(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const s = html.indexOf("{", i);
  if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = s; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return html.slice(s, j + 1); }
    }
  }
  return null;
}

// Recorre ytInitialData y junta todos los videoRenderer.
export function extractVideos(html) {
  const raw = extractJson(html, "ytInitialData");
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const out = [];
  const seen = new Set();
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    const v = o.videoRenderer;
    if (v && v.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      out.push({
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || v.title?.simpleText || "",
        uploader: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || "",
        thumb: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || "",
        duration: v.lengthText?.simpleText || "",
      });
    }
    for (const k in o) walk(o[k]);
  })(data);
  return out;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function searchYouTube(q) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=MX`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
        // Salta la pantalla de consentimiento (UE) para obtener resultados directos
        Cookie: "CONSENT=YES+cb; SOCS=CAI",
      },
    });
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    const html = await res.text();
    return extractVideos(html).slice(0, 30);
  } finally { clearTimeout(timer); }
}
