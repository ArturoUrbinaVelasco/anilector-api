/* AniLector API — GET /api/hls?url=<stream>
   Proxy CORS/HTTPS para reproducción embebida de HLS. */
import { rewritePlaylist, isPlaylist, fetchUpstream } from "../lib/hls.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: "Parámetro 'url' inválido." });
  }

  let up;
  try {
    up = await fetchUpstream(target);
  } catch (e) {
    return res.status(502).json({ error: "No se pudo alcanzar el stream.", detail: String(e.message || e) });
  }
  if (!up.ok) return res.status(502).json({ error: `Upstream ${up.status}` });

  const ct = up.headers.get("content-type") || "";
  const selfBase = `https://${req.headers.host}`;

  if (isPlaylist(target, ct)) {
    const text = await up.text();
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(rewritePlaylist(text, up.url || target, selfBase));
  }

  // Segmento u otro binario: reenviar bytes con CORS.
  const buf = Buffer.from(await up.arrayBuffer());
  res.setHeader("Content-Type", ct || "video/mp2t");
  res.setHeader("Cache-Control", "public, max-age=10");
  return res.status(200).send(buf);
}
