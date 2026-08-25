/* AniLector API — GET /api/resolve?site=animeflv&q=one%20piece
   Devuelve el enlace exacto del anime y la plantilla de episodios. */
import { resolve } from "../lib/resolve.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
  if (req.method === "OPTIONS") return res.status(204).end();

  const site = (req.query.site || "").toLowerCase();
  const q = (req.query.q || "").trim();
  if (!site || !q) return res.status(400).json({ error: "Faltan parámetros 'site' y 'q'." });

  try {
    const data = await resolve(site, q);
    return res.status(200).json(data);
  } catch (e) {
    // No romper la app: el frontend cae a la búsqueda normal.
    return res.status(200).json({ site, found: false, error: String(e.message || e) });
  }
}
