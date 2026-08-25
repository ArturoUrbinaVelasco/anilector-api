import { rewritePlaylist, isPlaylist } from "../lib/hls.js";
import assert from "node:assert";

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("✓", n)) : (fail++, console.log("✗", n)); };

const base = "https://proxy.test";
const target = "http://cdn.example.com/live/canal/index.m3u8";

const media = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:6.0,
seg1.ts
#EXTINF:6.0,
sub/seg2.ts
#EXTINF:6.0,
https://otro.cdn.com/abs/seg3.ts`;

const out = rewritePlaylist(media, target, base);

ok("segmento relativo → absoluto proxied",
  out.includes(`${base}/api/hls?url=${encodeURIComponent("http://cdn.example.com/live/canal/seg1.ts")}`));
ok("subcarpeta relativa resuelta",
  out.includes(encodeURIComponent("http://cdn.example.com/live/canal/sub/seg2.ts")));
ok("segmento absoluto proxied",
  out.includes(encodeURIComponent("https://otro.cdn.com/abs/seg3.ts")));
ok("llave AES proxied",
  out.includes(`URI="${base}/api/hls?url=${encodeURIComponent("http://cdn.example.com/live/canal/key.bin")}"`));
ok("comentarios EXTINF intactos", out.includes("#EXTINF:6.0,"));

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
720p.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/es.m3u8"`;
const mo = rewritePlaylist(master, "https://x.com/master.m3u8", base);
ok("sub-playlist de variante proxied", mo.includes(encodeURIComponent("https://x.com/720p.m3u8")));
ok("pista de audio EXT-X-MEDIA proxied", mo.includes(encodeURIComponent("https://x.com/audio/es.m3u8")));

ok("isPlaylist detecta .m3u8", isPlaylist("http://a/b.m3u8", "") === true);
ok("isPlaylist detecta por content-type", isPlaylist("http://a/x", "application/vnd.apple.mpegurl") === true);
ok("isPlaylist falso para .ts", isPlaylist("http://a/seg.ts", "video/mp2t") === false);

console.log(`\n${pass} ok, ${fail} fallos`);
assert.strictEqual(fail, 0);
