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

`GET /api/health` → estado y proveedores soportados.

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
