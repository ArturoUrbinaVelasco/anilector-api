/* AniLector API — GET /api/file?url=<archivo>
   Proxy CORS para abrir en el visor archivos alojados en servidores que
   no permiten al navegador descargarlos directamente.

   Corre en el runtime EDGE a propósito: las funciones normales de Vercel
   topan la respuesta en 4.5 MB, y un CBZ o un PDF pasan de eso fácil.
   En Edge se devuelve el cuerpo del origen en STREAMING (sin cargarlo en
   memoria), que es la forma soportada de servir archivos grandes.

   Nota: sigue habiendo un tope de tiempo (300 s en streaming). Para
   archivos muy pesados conviene el servidor local (server.mjs), que no
   tiene ninguno de estos límites. */
import {
  validateTarget, upstreamHeaders, responseHeaders,
  looksLikeSharePage, MAX_BYTES,
} from "../lib/file.js";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
};
const fail = (status, error, extra = {}) =>
  new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET" && req.method !== "HEAD")
    return fail(405, "Método no permitido.");

  const target = new URL(req.url).searchParams.get("url");
  const check = validateTarget(target);
  if (!check.ok) return fail(check.status, check.error);

  let up;
  try {
    up = await fetch(check.url, {
      method: req.method,
      headers: upstreamHeaders({ range: req.headers.get("range") }, check.url),
      redirect: "follow",
    });
  } catch (e) {
    return fail(502, "No se pudo alcanzar el archivo.", { detail: String(e.message || e) });
  }

  if (!up.ok && up.status !== 206)
    return fail(502, `El servidor de origen respondió ${up.status}.`, { upstream: up.status });

  // ¿Nos dieron una página en lugar de un archivo? (Terabox, Mega, etc.)
  const ctype = up.headers.get("content-type") || "";
  if (looksLikeSharePage(ctype, check.url))
    return fail(415, "Ese enlace devuelve una página web, no un archivo directo.", { sharePage: true });

  const len = Number(up.headers.get("content-length") || 0);
  if (len && len > MAX_BYTES)
    return fail(413, "El archivo es demasiado grande para el proxy.", { bytes: len, max: MAX_BYTES });

  const headers = responseHeaders(up, check.url);
  if (req.method === "HEAD") return new Response(null, { status: up.status, headers });

  // Streaming directo: el cuerpo pasa tal cual, sin bufferizar.
  return new Response(up.body, { status: up.status, headers });
}
