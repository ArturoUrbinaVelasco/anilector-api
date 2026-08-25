/* AniLector API — YouTube (JSON)
     GET /api/yt?q=<texto>            → búsqueda: videos + listas + nextPage
     GET /api/yt?page=<token>         → siguiente página de esa búsqueda
     GET /api/yt?related=<videoId>    → videos relacionados (para autoplay)
     GET /api/yt?playlist=<listId>    → videos de una lista de reproducción
   Añade &playlists=0 para excluir las listas de la búsqueda. */
import { searchYouTube, searchMore, relatedVideos, playlistVideos } from "../lib/yt.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = (req.query.q || "").trim();
  const page = (req.query.page || "").trim();
  const related = (req.query.related || "").trim();
  const playlist = (req.query.playlist || "").trim();
  const playlists = req.query.playlists !== "0";

  try {
    if (related) return res.status(200).json(await relatedVideos(related));
    if (playlist) return res.status(200).json(await playlistVideos(playlist));
    if (page) return res.status(200).json(await searchMore(page, { playlists }));
    if (!q) return res.status(400).json({ error: "Falta 'q'." });
    return res.status(200).json(await searchYouTube(q, { playlists }));
  } catch (e) {
    // Nunca 500: el frontend tiene respaldo con Piped/Invidious y no debe
    // tratar una caída de YouTube como un error fatal.
    return res.status(200).json({ items: [], nextPage: null, error: String(e.message || e) });
  }
}
