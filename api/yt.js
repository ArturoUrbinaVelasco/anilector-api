/* AniLector API — GET /api/yt?q=...  → búsqueda de YouTube (JSON). */
import { searchYouTube } from "../lib/yt.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
  if (req.method === "OPTIONS") return res.status(204).end();
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Falta 'q'." });
  try {
    const items = await searchYouTube(q);
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(200).json({ items: [], error: String(e.message || e) });
  }
}
