/* ============================================================
   AniLector API — resolución de enlaces por proveedor
   ------------------------------------------------------------
   El navegador no puede leer AnimeFLV/TioAnime/JKAnime (CORS +
   sin API). Este módulo corre en el servidor: busca el título en
   el sitio, elige el mejor resultado y devuelve:
     - animeUrl:       enlace EXACTO de la ficha del anime
     - episodeTemplate:plantilla del episodio (con {n})
   Con eso, el frontend arma los enlaces de cada capítulo solo.
   ============================================================ */
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- comparación de títulos para elegir el mejor match ---------- */
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function score(query, candidate) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 85;
  if (c.includes(q) || q.includes(c)) return 70;
  const qw = new Set(q.split(" "));
  const cw = c.split(" ");
  const hits = cw.filter((w) => qw.has(w)).length;
  return Math.round((hits / Math.max(qw.size, cw.length)) * 60);
}

function pickBest(query, results) {
  if (!results.length) return null;
  let best = results[0], bestScore = -1;
  for (const r of results) {
    const sc = score(query, r.title);
    if (sc > bestScore) { bestScore = sc; best = r; }
  }
  return best;
}

/* ---------- proveedores ---------- */
const PROVIDERS = {
  animeflv: {
    base: "https://www3.animeflv.net",
    searchUrl: (q) => `https://www3.animeflv.net/browse?q=${encodeURIComponent(q)}`,
    parse($, base) {
      const out = [];
      $("ul.ListAnimes li article, .ListAnimes article").each((_, el) => {
        const a = $(el).find('a[href^="/anime/"]').first();
        const href = a.attr("href");
        const title = $(el).find("h3.Title, .Title").first().text().trim() || a.text().trim();
        if (href) out.push({ title, slug: href.split("/anime/")[1]?.replace(/\/$/, "") });
      });
      return out;
    },
    animeUrl: (base, slug) => `${base}/anime/${slug}`,
    episodeTemplate: (base, slug) => `${base}/ver/${slug}-{n}`,
  },
  tioanime: {
    base: "https://tioanime.com",
    searchUrl: (q) => `https://tioanime.com/directorio?q=${encodeURIComponent(q)}`,
    parse($, base) {
      const out = [];
      $("ul.animes li article.serie, .animes article").each((_, el) => {
        const a = $(el).find('a[href^="/anime/"]').first();
        const href = a.attr("href");
        const title = $(el).find("h3.title, .title").first().text().trim() || a.attr("title") || "";
        if (href) out.push({ title, slug: href.split("/anime/")[1]?.replace(/\/$/, "") });
      });
      return out;
    },
    animeUrl: (base, slug) => `${base}/anime/${slug}`,
    episodeTemplate: (base, slug) => `${base}/ver/${slug}-{n}`,
  },
  jkanime: {
    base: "https://jkanime.net",
    searchUrl: (q) => `https://jkanime.net/buscar/${encodeURIComponent(q)}/`,
    parse($, base) {
      const out = [];
      $(".anime__item, .g-0 .anime__item, .listados .anime__item").each((_, el) => {
        const a = $(el).find("a").first();
        let href = a.attr("href") || "";
        const title = $(el).find("h5 a, .anime__item__text h5").first().text().trim() || a.attr("title") || "";
        const m = href.match(/jkanime\.net\/([^/]+)\/?$/);
        if (m) out.push({ title, slug: m[1] });
      });
      return out;
    },
    animeUrl: (base, slug) => `${base}/${slug}/`,
    episodeTemplate: (base, slug) => `${base}/${slug}/{n}/`,
  },
};

export function supportedProviders() {
  return Object.keys(PROVIDERS);
}

export async function resolve(site, query) {
  const p = PROVIDERS[site];
  if (!p) throw new Error(`Proveedor no soportado: ${site}`);
  const html = await getHtml(p.searchUrl(query));
  const $ = cheerio.load(html);
  const results = p.parse($, p.base).filter((r) => r.slug);
  const best = pickBest(query, results);
  if (!best) return { site, found: false };
  return {
    site,
    found: true,
    title: best.title,
    slug: best.slug,
    animeUrl: p.animeUrl(p.base, best.slug),
    episodeTemplate: p.episodeTemplate(p.base, best.slug),
    matchScore: score(query, best.title),
  };
}

// Exporta el parser para pruebas unitarias con HTML de ejemplo.
export function _parseFor(site, html) {
  const p = PROVIDERS[site];
  const $ = cheerio.load(html);
  return p.parse($, p.base).filter((r) => r.slug);
}
export { pickBest, score };
