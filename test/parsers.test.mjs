import { _parseFor, pickBest, score } from "../lib/resolve.js";
import assert from "node:assert";

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("✓", name); }
  else { fail++; console.log("✗", name); }
}

/* ---- AnimeFLV ---- */
const animeflvHtml = `
<ul class="ListAnimes AX Rows A03 C02 D02">
  <li><article class="Anime alt B">
    <a href="/anime/one-piece"><h3 class="Title">One Piece</h3></a>
  </article></li>
  <li><article class="Anime alt B">
    <a href="/anime/one-piece-log-fish-man-island"><h3 class="Title">One Piece: Otro</h3></a>
  </article></li>
</ul>`;
let r = _parseFor("animeflv", animeflvHtml);
ok("animeflv: 2 resultados", r.length === 2);
ok("animeflv: slug correcto", r[0].slug === "one-piece");
ok("animeflv: título", r[0].title === "One Piece");

/* ---- TioAnime ---- */
const tioHtml = `
<ul class="animes list-unstyled">
  <li><article class="serie">
    <a href="/anime/naruto" title="Naruto"><h3 class="title">Naruto</h3></a>
  </article></li>
</ul>`;
r = _parseFor("tioanime", tioHtml);
ok("tioanime: 1 resultado", r.length === 1);
ok("tioanime: slug", r[0].slug === "naruto");
ok("tioanime: título", r[0].title === "Naruto");

/* ---- JKAnime ---- */
const jkHtml = `
<div class="listados">
  <div class="anime__item">
    <a href="https://jkanime.net/bleach/"></a>
    <div class="anime__item__text"><h5><a href="https://jkanime.net/bleach/">Bleach</a></h5></div>
  </div>
</div>`;
r = _parseFor("jkanime", jkHtml);
ok("jkanime: 1 resultado", r.length === 1);
ok("jkanime: slug", r[0].slug === "bleach");
ok("jkanime: título", r[0].title === "Bleach");

/* ---- elección del mejor match ---- */
const cands = [
  { title: "One Piece Film: Red", slug: "a" },
  { title: "One Piece", slug: "b" },
  { title: "One Piece: Episode of Luffy", slug: "c" },
];
ok("pickBest: exacto gana", pickBest("One Piece", cands).slug === "b");
ok("score: exacto=100", score("Naruto", "Naruto") === 100);
ok("score: contiene > 0", score("Naruto", "Naruto Shippuden") > 0);

console.log(`\n${pass} ok, ${fail} fallos`);
assert.strictEqual(fail, 0, "Hay pruebas fallidas");
