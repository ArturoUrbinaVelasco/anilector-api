import {
  extractJson, extractVideos, extractItems, extractContinuation,
  extractClientInfo, extractContinuationItems, unpackToken,
  durationToSeconds, parseViews,
} from "../lib/yt.js";

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { c ? (pass++, console.log("✓", n)) : (fail++, console.log("✗", n, extra)); };

/* ============ 1. Formato CLÁSICO: búsqueda con videos ============ */
const yt = {
  contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [
      { videoRenderer: {
        videoId: "abc12345678",
        title: { runs: [{ text: "Video de prueba" }] },
        ownerText: { runs: [{ text: "Canal Demo" }] },
        thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/small.jpg" }, { url: "https://i.ytimg.com/big.jpg" }] },
        lengthText: { simpleText: "4:20" },
        viewCountText: { simpleText: "1,234,567 vistas" },
      } },
      { videoRenderer: {
        videoId: "def12345678",
        title: { simpleText: "Otro video" },
        longBylineText: { runs: [{ text: "Otro Canal" }] },
        thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/two.jpg" }] },
      } },
      { promotedVideoRenderer: { videoId: "IGNORAR" } },
    ] } },
  ] } } } },
};
const html = `<html><script>var ytInitialData = ${JSON.stringify(yt)};</script></html>`;

ok("extractJson recupera el objeto", !!extractJson(html, "ytInitialData"));
const vids = extractVideos(html);
ok("extrae 2 videos e ignora el promocionado", vids.length === 2, `→ ${vids.length}`);
ok("título desde runs", vids[0].title === "Video de prueba");
ok("título desde simpleText", vids[1].title === "Otro video");
ok("canal desde ownerText", vids[0].uploader === "Canal Demo");
ok("canal desde longBylineText", vids[1].uploader === "Otro Canal");
ok("miniatura de mayor calidad", vids[0].thumb === "https://i.ytimg.com/big.jpg");
ok("duración", vids[0].duration === "4:20");
ok("id correcto", vids[0].id === "abc12345678");
ok("compatibilidad: extractVideos no trae 'type'", vids[0].type === undefined);

/* ============ 2. Listas de reproducción (clásico) ============ */
const conListas = {
  contents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [
      { videoRenderer: { videoId: "vid00000001", title: { simpleText: "Un video" } } },
      { playlistRenderer: {
        playlistId: "PLabcdef123456",
        title: { simpleText: "Mi lista de anime" },
        shortBylineText: { runs: [{ text: "Canal de listas" }] },
        videoCount: "27",
        thumbnails: [{ thumbnails: [{ url: "https://i.ytimg.com/pl-small.jpg" }, { url: "https://i.ytimg.com/pl-big.jpg" }] }],
        navigationEndpoint: { watchEndpoint: { videoId: "firstvid001" } },
      } },
    ] } },
  ] } },
};
const items = extractItems(conListas);
ok("mezcla videos y listas", items.length === 2, `→ ${items.length}`);
const pl = items.find((i) => i.type === "playlist");
ok("detecta la lista", !!pl);
ok("id de la lista", pl?.id === "PLabcdef123456");
ok("título de la lista", pl?.title === "Mi lista de anime");
ok("número de videos", pl?.videoCount === 27, `→ ${pl?.videoCount}`);
ok("miniatura de la lista", pl?.thumb === "https://i.ytimg.com/pl-big.jpg", `→ ${pl?.thumb}`);
ok("primer video de la lista", pl?.firstVideo === "firstvid001");
ok("playlists=false las excluye",
  extractItems(conListas, { includePlaylists: false }).every((i) => i.type !== "playlist"));

/* ============ 3. Formato NUEVO: lockupViewModel ============ */
const nuevo = { contents: { c: [
  { lockupViewModel: {
    contentId: "newvid00001",
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: { lockupMetadataViewModel: {
      title: { content: "Video en formato nuevo" },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: "Canal Nuevo" } }] },
        { metadataParts: [{ text: { content: "3.4 M de vistas" } }, { text: { content: "hace 2 años" } }] },
      ] } },
    } },
    contentImage: { thumbnailViewModel: {
      image: { sources: [{ url: "https://i.ytimg.com/n1.jpg" }, { url: "https://i.ytimg.com/n2.jpg" }] },
      overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: "12:34" } }] } }],
    } },
  } },
  { lockupViewModel: {
    contentId: "PLnueva0001",
    contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
    metadata: { lockupMetadataViewModel: {
      title: { content: "Lista en formato nuevo" },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: "Canal Nuevo" } }] },
      ] } },
    } },
    contentImage: { collectionThumbnailViewModel: {
      primaryThumbnail: { thumbnailViewModel: {
        image: { sources: [{ url: "https://i.ytimg.com/pl-nueva.jpg" }] },
        overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: "48" } }] } }],
      } },
    } },
  } },
] } };
const nItems = extractItems(nuevo);
ok("formato nuevo: 2 elementos", nItems.length === 2, `→ ${nItems.length}`);
const nv = nItems.find((i) => i.type === "video");
const np = nItems.find((i) => i.type === "playlist");
ok("nuevo: video detectado", nv?.id === "newvid00001");
ok("nuevo: título del video", nv?.title === "Video en formato nuevo");
ok("nuevo: canal del video", nv?.uploader === "Canal Nuevo", `→ ${nv?.uploader}`);
ok("nuevo: miniatura del video", nv?.thumb === "https://i.ytimg.com/n2.jpg", `→ ${nv?.thumb}`);
ok("nuevo: duración desde la insignia", nv?.duration === "12:34", `→ ${nv?.duration}`);
ok("nuevo: lista detectada", np?.id === "PLnueva0001");
ok("nuevo: título de la lista", np?.title === "Lista en formato nuevo");
ok("nuevo: miniatura de la lista", np?.thumb === "https://i.ytimg.com/pl-nueva.jpg", `→ ${np?.thumb}`);
ok("nuevo: número de videos", np?.videoCount === 48, `→ ${np?.videoCount}`);

/* ============ 4. Relacionados (página de un video) ============ */
const watch = { contents: { twoColumnWatchNextResults: {
  results: { results: { contents: [
    { videoPrimaryInfoRenderer: { title: { runs: [{ text: "El video actual" }] } } },
    { videoSecondaryInfoRenderer: { owner: { videoOwnerRenderer: { title: { runs: [{ text: "Canal Actual" }] } } } } },
  ] } },
  secondaryResults: { secondaryResults: { results: [
    { compactVideoRenderer: {
      videoId: "rel00000001",
      title: { simpleText: "Relacionado 1" },
      longBylineText: { runs: [{ text: "Canal A" }] },
      thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/r1.jpg" }] },
      lengthText: { simpleText: "10:00" },
      shortViewCountText: { simpleText: "45 K de vistas" },
    } },
    { compactVideoRenderer: {
      videoId: "rel00000002",
      title: { simpleText: "Relacionado 2" },
      thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/r2.jpg" }] },
    } },
  ] } },
} } };
const rel = extractItems(watch, { includePlaylists: false });
ok("relacionados: 2 videos", rel.length === 2, `→ ${rel.length}`);
ok("relacionados: título", rel[0].title === "Relacionado 1");
ok("relacionados: canal", rel[0].uploader === "Canal A");
ok("relacionados: duración en segundos", rel[0].seconds === 600, `→ ${rel[0].seconds}`);

/* ============ 5. Videos dentro de una lista ============ */
const plPage = { contents: { c: [
  { playlistVideoRenderer: {
    videoId: "plv00000001", title: { runs: [{ text: "Capítulo 1" }] },
    index: { simpleText: "1" }, lengthText: { simpleText: "23:45" },
    thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/p1.jpg" }] },
    shortBylineText: { runs: [{ text: "Canal Serie" }] },
  } },
  { playlistVideoRenderer: {
    videoId: "plv00000002", title: { runs: [{ text: "Capítulo 2" }] },
    index: { simpleText: "2" },
  } },
] } };
const plv = extractItems(plPage);
ok("lista: 2 videos", plv.length === 2);
ok("lista: mantiene el orden", plv[0].index === 1 && plv[1].index === 2);
ok("lista: título del capítulo", plv[0].title === "Capítulo 1");

/* ============ 6. Sin duplicados ============ */
const dup = { a: { videoRenderer: { videoId: "same0000001", title: { simpleText: "X" } } },
              b: { compactVideoRenderer: { videoId: "same0000001", title: { simpleText: "X" } } } };
ok("no duplica el mismo id", extractItems(dup).length === 1);

/* ============ 7. Continuación (ver más resultados) ============ */
const conCont = { contents: { c: [
  { videoRenderer: { videoId: "vvvvvvvvvvv", title: { simpleText: "V" } } },
  { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "TOKEN_ABC123" } } } },
] } };
ok("encuentra el token de continuación", extractContinuation(conCont) === "TOKEN_ABC123");
ok("sin token devuelve null", extractContinuation({ contents: {} }) === null);
ok("soporta nextContinuationData (formato viejo)",
  extractContinuation({ x: { nextContinuationData: { continuation: "OLD_TOKEN" } } }) === "OLD_TOKEN");

const htmlKeys = `<script>"INNERTUBE_API_KEY":"AIzaSyTEST123","INNERTUBE_CONTEXT_CLIENT_VERSION":"2.20260101.00.00"</script>`;
const info = extractClientInfo(htmlKeys);
ok("extrae la clave de InnerTube", info.key === "AIzaSyTEST123", `→ ${info.key}`);
ok("extrae la versión del cliente", info.version === "2.20260101.00.00", `→ ${info.version}`);
ok("sin claves no revienta", extractClientInfo("<html></html>").key === null);

const contResp = { onResponseReceivedCommands: [
  { appendContinuationItemsAction: { continuationItems: [
    { videoRenderer: { videoId: "pag00000001", title: { simpleText: "Página 2" } } },
    { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "TOKEN_PAG3" } } } },
  ] } },
] };
const contItems = extractContinuationItems(contResp);
ok("respuesta de continuación: items", Array.isArray(contItems) && contItems.length === 2);
const pag = extractItems(contItems);
ok("continuación: extrae el video", pag.length === 1 && pag[0].id === "pag00000001", `→ ${pag.length}`);
ok("continuación: token de la 3ª página", extractContinuation(contItems) === "TOKEN_PAG3");
ok("respuesta sin continuación → null", extractContinuationItems({}) === null);

/* Ida y vuelta del token empaquetado que ve el frontend. */
const packed = Buffer.from(JSON.stringify({ t: "TK", k: "KEY", v: "1.0" })).toString("base64url");
ok("desempaqueta el token", unpackToken(packed)?.t === "TK");
ok("token corrupto → null", unpackToken("no-es-base64-valido!!") === null);

/* ============ 8. Utilidades ============ */
ok("duración m:ss", durationToSeconds("4:20") === 260);
ok("duración h:mm:ss", durationToSeconds("1:02:03") === 3723);
ok("duración vacía", durationToSeconds("") === null);
ok("duración inválida", durationToSeconds("en vivo") === null);
ok("vistas con separador de miles", parseViews("1,234,567 vistas") === 1234567, `→ ${parseViews("1,234,567 vistas")}`);
ok("vistas en K", parseViews("45 K de vistas") === 45000, `→ ${parseViews("45 K de vistas")}`);
ok("vistas en M", parseViews("3.4 M de vistas") === 3400000, `→ ${parseViews("3.4 M de vistas")}`);
ok("vistas vacías", parseViews("") === null);

/* ============ 9. Robustez ============ */
ok("HTML sin ytInitialData", extractItems("<html>nada</html>").length === 0);
ok("JSON roto no revienta", extractItems("ytInitialData = {roto").length === 0);
ok("objeto vacío", extractItems({}).length === 0);
ok("null no revienta", extractItems(null).length === 0);
ok("lockup sin título se ignora",
  extractItems({ a: { lockupViewModel: { contentId: "x", contentType: "LOCKUP_CONTENT_TYPE_VIDEO" } } }).length === 0);
ok("videoRenderer sin id se ignora",
  extractItems({ a: { videoRenderer: { title: { simpleText: "sin id" } } } }).length === 0);

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
