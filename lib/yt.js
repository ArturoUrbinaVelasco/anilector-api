/* ============================================================
   AniLector API — YouTube del lado servidor
   Obtiene las páginas de YouTube y extrae los datos de
   `ytInitialData` (como hacen los frontends abiertos tipo NewPipe).
   La reproducción en la app es con el iframe OFICIAL de YouTube.

   Cubre las DOS formas en que YouTube devuelve los datos:
     · clásica  → videoRenderer / playlistRenderer / compactVideoRenderer
     · nueva    → lockupViewModel (desde 2024, cada vez más común)
   Si solo se leyera una, media página de resultados desaparecería.
   ============================================================ */

/* Extrae el objeto JSON balanceado que sigue a un marcador. */
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

function parseInitialData(htmlOrObj) {
  if (htmlOrObj && typeof htmlOrObj === "object") return htmlOrObj;
  const raw = extractJson(String(htmlOrObj || ""), "ytInitialData");
  try { return JSON.parse(raw); } catch { return null; }
}

/* Recorre cualquier estructura anidada llamando a fn en cada objeto. */
function walk(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) walk(x, fn); return; }
  fn(node);
  for (const k in node) walk(node[k], fn);
}

/* El texto llega de cuatro maneras distintas según la parte de YouTube:
   una cadena pelada (insignias del formato nuevo), {simpleText}, {runs[]}
   o {content}. Si solo se cubriera una, se perderían duraciones y conteos. */
const textOf = (o) => {
  if (typeof o === "string") return o;
  if (!o || typeof o !== "object") return "";
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) return o.runs.map((r) => r?.text ?? "").join("");
  if (typeof o.content === "string") return o.content;
  return "";
};

const bestThumb = (list) => (Array.isArray(list) && list.length ? list[list.length - 1].url : "");

/* "1:02:03" o "4:20" → segundos (para poder ordenar/filtrar). */
export function durationToSeconds(str) {
  if (!str) return null;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/* "3.4 M de vistas" / "1,234,567 views" -> numero aproximado.
   Ojo con los separadores: SIN unidad ("1,234,567") las comas y puntos son
   MILES; CON unidad ("3,4 M") son el DECIMAL. Confundirlos devolvia 1 en
   lugar de 1234567. */
export function parseViews(str) {
  if (!str) return null;
  const s = String(str).replace(/\u00a0/g, " ");
  // El número se toma VORAZ: con `*?` se quedaba en el primer dígito y
  // "1,234,567" se leía como 1.
  const m = s.match(/([\d][\d.,]*)\s*(K|M|B|mil(?:lones)?|mill)?/i);
  if (!m) return null;
  const unit = (m[2] || "").toLowerCase();
  const mult = { k: 1e3, mil: 1e3, m: 1e6, millones: 1e6, mill: 1e6, b: 1e9 }[unit] || 1;
  const num = m[1].replace(/[\s.,]+$/, "");
  let n;
  if (mult > 1) {
    // Con unidad: el ultimo separador, si lo hay, es el decimal.
    n = parseFloat(num.replace(/[.,](?=[^.,]*$)/, "|").replace(/[.,]/g, "").replace("|", "."));
  } else {
    // Sin unidad: todos los separadores son de miles.
    n = parseFloat(num.replace(/[.,]/g, ""));
  }
  return Number.isNaN(n) ? null : Math.round(n * mult);
}

/* ---------- formato NUEVO: lockupViewModel ---------- */
function fromLockup(l) {
  const type = l.contentType || "";
  const meta = l.metadata?.lockupMetadataViewModel;
  const title = textOf(meta?.title);
  const id = l.contentId;
  if (!id || !title) return null;

  // Subtítulos: canal, vistas, antigüedad…
  const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts = [];
  walk(rows, (o) => { if (typeof o.content === "string") parts.push(o.content); });
  const uploader = parts[0] || "";

  const img = l.contentImage || {};
  const thumb =
    bestThumb(img.thumbnailViewModel?.image?.sources) ||
    bestThumb(img.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources) ||
    "";

  if (/PLAYLIST|PODCAST|ALBUM/i.test(type)) {
    let count = null;
    walk(img, (o) => {
      const txt = textOf(o.text);
      if (count == null && /^\d+$/.test(String(txt).trim())) count = Number(txt);
    });
    return { type: "playlist", id, title, uploader, thumb, videoCount: count };
  }
  if (/VIDEO|SHORT|MOVIE/i.test(type) || /^[\w-]{11}$/.test(id)) {
    let duration = "";
    walk(img, (o) => {
      const txt = textOf(o.text);
      if (!duration && /^\d{1,2}(:\d{2}){1,2}$/.test(String(txt).trim())) duration = String(txt).trim();
    });
    return {
      type: "video", id, title, uploader, thumb, duration,
      seconds: durationToSeconds(duration),
      views: parseViews(parts.find((p) => /view|vista/i.test(p))),
    };
  }
  return null;
}

/* ---------- formato CLÁSICO ---------- */
function fromVideoRenderer(v) {
  if (!v?.videoId) return null;
  const duration = textOf(v.lengthText) || "";
  return {
    type: "video",
    id: v.videoId,
    title: textOf(v.title),
    uploader: textOf(v.ownerText) || textOf(v.longBylineText) || textOf(v.shortBylineText) || "",
    thumb: bestThumb(v.thumbnail?.thumbnails),
    duration,
    seconds: durationToSeconds(duration),
    views: parseViews(textOf(v.viewCountText) || textOf(v.shortViewCountText)),
  };
}

function fromPlaylistRenderer(p) {
  if (!p?.playlistId) return null;
  return {
    type: "playlist",
    id: p.playlistId,
    title: textOf(p.title),
    uploader: textOf(p.shortBylineText) || textOf(p.longBylineText) || "",
    thumb:
      bestThumb(p.thumbnails?.[0]?.thumbnails) ||
      bestThumb(p.thumbnail?.thumbnails) ||
      bestThumb(p.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails) ||
      "",
    videoCount: Number(p.videoCount) || Number(textOf(p.videoCountText).replace(/\D/g, "")) || null,
    firstVideo: p.navigationEndpoint?.watchEndpoint?.videoId ||
      p.videos?.[0]?.childVideoRenderer?.videoId || null,
  };
}

/* Un elemento de dentro de una lista de reproducción. */
function fromPlaylistVideo(v) {
  if (!v?.videoId) return null;
  const duration = textOf(v.lengthText) || "";
  return {
    type: "video",
    id: v.videoId,
    title: textOf(v.title),
    uploader: textOf(v.shortBylineText) || textOf(v.ownerText) || "",
    thumb: bestThumb(v.thumbnail?.thumbnails),
    duration,
    seconds: durationToSeconds(duration),
    index: Number(textOf(v.index)) || null,
  };
}

/* Los "relacionados" de la página de un video. */
function fromCompactVideo(v) {
  if (!v?.videoId) return null;
  const duration = textOf(v.lengthText) || "";
  return {
    type: "video",
    id: v.videoId,
    title: textOf(v.title),
    uploader: textOf(v.longBylineText) || textOf(v.shortBylineText) || "",
    thumb: bestThumb(v.thumbnail?.thumbnails),
    duration,
    seconds: durationToSeconds(duration),
    views: parseViews(textOf(v.viewCountText) || textOf(v.shortViewCountText)),
  };
}

/* ---------- extractor general ---------- */
/* Recoge videos y listas de cualquier página, en cualquiera de los dos
   formatos, sin duplicar y respetando el orden de aparición. */
export function extractItems(htmlOrObj, { includePlaylists = true } = {}) {
  const data = parseInitialData(htmlOrObj);
  if (!data) return [];
  const out = [];
  const seen = new Set();
  const push = (it) => {
    if (!it) return;
    const k = `${it.type}:${it.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(it);
  };
  walk(data, (o) => {
    // Los promocionados (anuncios) se ignoran a propósito.
    if (o.promotedVideoRenderer || o.adSlotRenderer || o.promotedSparklesWebRenderer) return;
    if (o.videoRenderer) push(fromVideoRenderer(o.videoRenderer));
    if (o.playlistVideoRenderer) push(fromPlaylistVideo(o.playlistVideoRenderer));
    if (o.compactVideoRenderer) push(fromCompactVideo(o.compactVideoRenderer));
    if (o.gridVideoRenderer) push(fromVideoRenderer(o.gridVideoRenderer));
    if (includePlaylists) {
      if (o.playlistRenderer) push(fromPlaylistRenderer(o.playlistRenderer));
      if (o.gridPlaylistRenderer) push(fromPlaylistRenderer(o.gridPlaylistRenderer));
      if (o.compactPlaylistRenderer) push(fromPlaylistRenderer(o.compactPlaylistRenderer));
    }
    if (o.lockupViewModel) {
      const it = fromLockup(o.lockupViewModel);
      if (it && (includePlaylists || it.type !== "playlist")) push(it);
    }
  });
  return out;
}

/* Compatibilidad: la versión anterior solo devolvía videos. */
export function extractVideos(htmlOrObj) {
  return extractItems(htmlOrObj, { includePlaylists: false })
    .filter((i) => i.type === "video")
    .map(({ type, ...v }) => v);
}

/* Token para pedir la SIGUIENTE página de resultados. */
export function extractContinuation(htmlOrObj) {
  const data = parseInitialData(htmlOrObj);
  if (!data) return null;
  let token = null;
  walk(data, (o) => {
    if (token) return;
    const t =
      o.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
      o.continuationCommand?.token ||
      o.nextContinuationData?.continuation;
    if (t) token = t;
  });
  return token;
}

/* Claves internas de la web de YouTube, necesarias para pedir la
   continuación por su API (InnerTube). Vienen en el propio HTML. */
export function extractClientInfo(html) {
  const s = String(html || "");
  const key = s.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || null;
  const version =
    s.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] ||
    s.match(/"clientVersion":"([\d.]+)"/)?.[1] || null;
  return { key, version };
}

/* La respuesta de la API de continuación trae los elementos aquí. */
export function extractContinuationItems(json) {
  const cmds = json?.onResponseReceivedCommands || json?.onResponseReceivedActions || [];
  const items = [];
  walk(cmds, (o) => {
    const list = o.appendContinuationItemsAction?.continuationItems ||
      o.reloadContinuationItemsCommand?.continuationItems;
    if (Array.isArray(list)) items.push(...list);
  });
  return items.length ? items : null;
}

/* ---------- peticiones ---------- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
  // Salta la pantalla de consentimiento (UE) para obtener resultados directos
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

async function getPage(url, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: HEADERS });
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

const LIMIT = 40;

/* Búsqueda. Devuelve videos Y listas, más el token de la página siguiente. */
export async function searchYouTube(q, { playlists = true } = {}) {
  const html = await getPage(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=MX`);
  return {
    items: extractItems(html, { includePlaylists: playlists }).slice(0, LIMIT),
    nextPage: packToken(extractContinuation(html), extractClientInfo(html)),
  };
}

/* El frontend recibe un solo string opaco con todo lo necesario. */
function packToken(token, info) {
  if (!token) return null;
  try {
    return Buffer.from(JSON.stringify({ t: token, k: info?.key || null, v: info?.version || null }))
      .toString("base64url");
  } catch { return null; }
}
export function unpackToken(packed) {
  try {
    const o = JSON.parse(Buffer.from(String(packed), "base64url").toString("utf8"));
    return o && o.t ? o : null;
  } catch { return null; }
}

/* Siguiente página de resultados usando la API interna de YouTube. */
export async function searchMore(packed, { playlists = true } = {}) {
  const info = unpackToken(packed);
  if (!info) throw new Error("Token de continuación inválido.");
  const key = info.k || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // clave pública de la web
  const version = info.v || "2.20240101.00.00";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${key}&prettyPrint=false`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: version, hl: "es", gl: "MX" } },
        continuation: info.t,
      }),
    });
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    const json = await res.json();
    const items = extractContinuationItems(json);
    return {
      items: extractItems(items || json, { includePlaylists: playlists }).slice(0, LIMIT),
      nextPage: packToken(extractContinuation(items || json), { key: info.k, version: info.v }),
    };
  } finally { clearTimeout(timer); }
}

/* Videos RELACIONADOS con uno dado (los de la columna derecha de YouTube).
   Es lo que permite que, al terminar un video, siga otro que tenga sentido. */
export async function relatedVideos(videoId) {
  if (!/^[\w-]{11}$/.test(String(videoId || ""))) throw new Error("videoId inválido.");
  const html = await getPage(`https://www.youtube.com/watch?v=${videoId}&hl=es&gl=MX`);
  const items = extractItems(html, { includePlaylists: false })
    .filter((i) => i.type === "video" && i.id !== videoId)
    .slice(0, 25);
  const data = parseInitialData(html);
  let title = "", uploader = "";
  walk(data, (o) => {
    if (!title && o.videoPrimaryInfoRenderer) title = textOf(o.videoPrimaryInfoRenderer.title);
    if (!uploader && o.videoOwnerRenderer) uploader = textOf(o.videoOwnerRenderer.title);
  });
  return { id: videoId, title, uploader, items };
}

/* Contenido de una lista de reproducción. */
export async function playlistVideos(listId) {
  if (!/^[\w-]{2,60}$/.test(String(listId || ""))) throw new Error("listId inválido.");
  const html = await getPage(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=es&gl=MX`);
  const items = extractItems(html, { includePlaylists: false }).filter((i) => i.type === "video");
  const data = parseInitialData(html);
  let title = "";
  walk(data, (o) => {
    if (!title && o.playlistHeaderRenderer) title = textOf(o.playlistHeaderRenderer.title);
    if (!title && o.pageHeaderRenderer) title = textOf(o.pageHeaderRenderer.pageTitle);
  });
  return { id: listId, title, items };
}
