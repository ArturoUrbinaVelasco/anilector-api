import { extractJson, extractVideos } from "../lib/yt.js";
import assert from "node:assert";

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log("✓", n)) : (fail++, console.log("✗", n)); };

const yt = {
  contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
    { itemSectionRenderer: { contents: [
      { videoRenderer: {
        videoId: "abc12345678",
        title: { runs: [{ text: "Video de prueba" }] },
        ownerText: { runs: [{ text: "Canal Demo" }] },
        thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/small.jpg" }, { url: "https://i.ytimg.com/big.jpg" }] },
        lengthText: { simpleText: "4:20" },
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
ok("extrae 2 videos", vids.length === 2);
ok("id correcto", vids[0].id === "abc12345678");
ok("título por runs", vids[0].title === "Video de prueba");
ok("título por simpleText", vids[1].title === "Otro video");
ok("uploader por ownerText", vids[0].uploader === "Canal Demo");
ok("uploader por longBylineText", vids[1].uploader === "Otro Canal");
ok("miniatura de mayor tamaño", vids[0].thumb === "https://i.ytimg.com/big.jpg");
ok("duración", vids[0].duration === "4:20");
ok("ignora no-videoRenderer", !vids.find((v) => v.id === "IGNORAR"));

console.log(`\n${pass} ok, ${fail} fallos`);
assert.strictEqual(fail, 0);
