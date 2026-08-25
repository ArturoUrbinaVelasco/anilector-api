# AniLector API

Microservicio mínimo que resuelve el **enlace exacto** de un anime en AnimeFLV, TioAnime y JKAnime. Necesario porque el navegador no puede leer esos sitios directamente (CORS + sin API pública).

## Qué hace

`GET /api/resolve?site=animeflv&q=one%20piece` →

```json
{
  "site": "animeflv",
  "found": true,
  "title": "One Piece",
  "slug": "one-piece",
  "animeUrl": "https://www3.animeflv.net/anime/one-piece",
  "episodeTemplate": "https://www3.animeflv.net/ver/one-piece-{n}"
}
```

El frontend arma los enlaces de cada episodio reemplazando `{n}`.

`GET /api/hls?url=<stream>` → **proxy de TV en vivo**. Trae un stream HLS del lado servidor y lo re-sirve por HTTPS + CORS, reescribiendo la lista para que los segmentos también pasen por el proxy. Resuelve los canales que el navegador bloquea por CORS o por "mixed content" (stream HTTP en una web HTTPS), para que se reproduzcan **dentro de la app** sin abrir pestañas.

`GET /api/file?url=<archivo>` → **proxy de archivos para el visor**. Trae un archivo (PDF, CBZ, CBR, EPUB…) del lado servidor y lo re-sirve con CORS, para que el visor pueda abrirlo cuando el servidor de origen no deja descargarlo desde el navegador. Reenvía las peticiones `Range`, así que pdf.js puede pedir solo el trozo que necesita.

Corre en el **runtime Edge** a propósito: las funciones normales de Vercel topan la respuesta en 4,5 MB y un CBZ pasa de eso fácilmente; en Edge el cuerpo se devuelve en streaming. Aun así hay un tope de tiempo, por lo que para archivos muy pesados conviene usar el **servidor local** de la app (`node server.mjs`, que expone el mismo `/api/file` sin límites).

Seguridad: solo `http`/`https`, y se rechazan destinos de red privada o de metadatos (`localhost`, `10.x`, `192.168.x`, `172.16-31.x`, `169.254.169.254`, IPv6 locales…) para que no sirva de puente hacia la red interna (SSRF).

`GET /api/health` → estado y proveedores soportados.

> Nota de uso: el proxy de video consume ancho de banda y tiempo de función. En el plan gratuito de Vercel es ideal para **uso personal**; no está pensado para servir a muchos usuarios.

Si un sitio no responde o cambia su HTML, la API devuelve `{ "found": false }` y AniLector cae automáticamente a la búsqueda normal (nunca se rompe).

## Desplegar en Vercel (gratis, ~3 minutos)

1. Sube esta carpeta a un repositorio nuevo en tu GitHub (p. ej. `anilector-api`).
2. Entra a [vercel.com](https://vercel.com) e inicia sesión con GitHub.
3. **Add New → Project** → importa el repo `anilector-api` → **Deploy** (no requiere configuración; Vercel detecta las funciones en `/api`).
4. Al terminar te da una URL como `https://anilector-api.vercel.app`.
5. Pega esa URL en el archivo `js/config.js` de AniLector:

   ```js
   export const BACKEND_URL = "https://anilector-api.vercel.app";
   ```

6. Sube ese cambio de AniLector (`git add -A && git commit -m "backend" && git push`).

Listo: al abrir un anime, los sitios compatibles llevarán al enlace exacto y el listado de capítulos abrirá el episodio correcto.

## Proveedores

| Proveedor | Búsqueda del lado servidor | Enlace de episodio |
| --- | --- | --- |
| AnimeFLV | ✅ | `/ver/{slug}-{n}` |
| TioAnime | ✅ | `/ver/{slug}-{n}` |
| JKAnime | ✅ | `/{slug}/{n}/` |

Los dominios de estos portales cambian con el tiempo; si alguno deja de resolver, actualiza su `base`/`searchUrl` en `lib/resolve.js`.

## Local

```bash
npm install
npm test          # pruebas de los parsers
npx vercel dev    # servidor local en http://localhost:3000
```

## Nota legal

La API solo devuelve **enlaces a páginas públicas** (como un buscador); no aloja ni redistribuye contenido. AnimeFLV, TioAnime y JKAnime son portales de terceros no oficiales: úsalos bajo tu criterio y prefiere plataformas oficiales cuando el título esté disponible.
