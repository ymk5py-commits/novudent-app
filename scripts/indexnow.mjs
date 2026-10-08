// Avisa a los buscadores que usan IndexNow (Bing, Yandex, Seznam, Naver…) las URLs públicas del sitemap, para que las indexen sin esperar
// a pasar. Se corre DESPUÉS de publicar (la clave tiene que estar en línea):
//   npm run indexnow                          → lee https://novudent.novumholding.lat/sitemap.xml
//   npm run indexnow -- --url https://otro    → otro dominio
// La clave es pública por diseño (se sirve en /<clave>.txt, ver public/). Solo manda las URLs del sitemap: nunca el panel ni las páginas
// por link, que no se indexan (lib/seo.ts, app/robots.ts). Google no usa IndexNow: para Google está Search Console (ver lib/seo.ts).
const CLAVE = "63061bacb6ba2dbcbd4447685129bcaa";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const BASE = arg("--url", "https://novudent.novumholding.lat").replace(/\/$/, "");

const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(BASE));
if (urls.length === 0) {
  console.error(`El sitemap de ${BASE} no trae URLs del dominio.`);
  process.exit(1);
}

const publicada = await fetch(`${BASE}/${CLAVE}.txt`);
if (!publicada.ok || (await publicada.text()).trim() !== CLAVE) {
  console.error(`La clave no está publicada en ${BASE}/${CLAVE}.txt: publicá primero.`);
  process.exit(1);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(BASE).host, key: CLAVE, keyLocation: `${BASE}/${CLAVE}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} — ${urls.length} URLs`);
process.exit(res.ok ? 0 : 1);
