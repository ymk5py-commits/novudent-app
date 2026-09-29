/** Regenera los archivos de la marca a partir de lib/marca.ts:
 *
 *    app/icon.svg              favicon (diente sobre navy, esquinas redondeadas)
 *    app/apple-icon.png        180 × 180 para iOS
 *    app/opengraph-image.png   1200 × 630 para redes (WhatsApp, Facebook, X)
 *    app/favicon.ico           16/32/48 px, el que piden solos los navegadores
 *    public/marca/*.svg|png    logotipo e isologo en color, blanco y negro,
 *                              e íconos 192/512 del manifest
 *
 *  Uso: `npm run marca`. Rasteriza con el Chromium de Playwright (ya está en
 *  devDependencies), así el PNG sale idéntico a lo que dibuja el navegador. */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { svgIcono, svgIsologo, svgLogotipo, MARCA } from "../lib/marca.ts";

const pub = "public/marca";
mkdirSync(pub, { recursive: true });

const svgs = {
  "novudent-logo.svg": svgLogotipo("color"),
  "novudent-logo-blanco.svg": svgLogotipo("blanco"),
  "novudent-logo-negro.svg": svgLogotipo("negro"),
  "novudent-isologo.svg": svgIsologo("color"),
  "novudent-isologo-negro.svg": svgIsologo("negro"),
  "novudent-icono.svg": svgIcono({ redondo: true }),
  "novudent-icono-blanco.svg": svgIcono({ redondo: true, fondo: "blanco" }),
};
for (const [nombre, svg] of Object.entries(svgs)) writeFileSync(`${pub}/${nombre}`, svg);
writeFileSync("app/icon.svg", svgIcono({ lado: 64, redondo: true }));

const og = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;
  background:radial-gradient(900px 520px at 88% 12%, #0A3E80 0%, rgba(10,62,128,0) 70%), ${MARCA.navy};font-family:Montserrat,Arial,sans-serif;color:#fff">
  <div style="width:560px">${svgLogotipo("blanco")}</div>
  <div>
    <div style="font-size:60px;font-weight:300;line-height:1.08;letter-spacing:-0.01em;max-width:980px">Software de gestión para clínicas dentales</div>
    <div style="margin-top:22px;font-size:26px;color:#A9D8F5">Agenda · Odontograma FDI · Ficha clínica · Facturación</div>
  </div>
  <div style="font-size:18px;letter-spacing:0.3em;color:rgba(255,255,255,0.45)">HECHO EN PARAGUAY · NOVUM</div>
</div></body></html>`;

const pngs = [
  { archivo: "app/apple-icon.png", lado: 180, html: svgIcono({ lado: 180 }) },
  { archivo: `${pub}/icono-192.png`, lado: 192, html: svgIcono({ lado: 192 }) },
  { archivo: `${pub}/icono-512.png`, lado: 512, html: svgIcono({ lado: 512 }) },
  { archivo: `${pub}/icono-blanco-512.png`, lado: 512, html: svgIcono({ lado: 512, redondo: true, fondo: "blanco" }) },
  // Para correos: los clientes de mail no muestran SVG.
  { archivo: `${pub}/novudent-logo.png`, ancho: 600, alto: 114, html: svgLogotipo("color") },
  { archivo: `${pub}/novudent-logo-blanco.png`, ancho: 600, alto: 114, html: svgLogotipo("blanco") },
  { archivo: `${pub}/novudent-logo-negro.png`, ancho: 600, alto: 114, html: svgLogotipo("negro") },
  { archivo: "app/opengraph-image.png", ancho: 1200, alto: 630, pagina: og },
];

const navegador = await chromium.launch();
for (const p of pngs) {
  const ancho = p.ancho ?? p.lado, alto = p.alto ?? p.lado;
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  await pagina.setContent(
    p.pagina ?? `<!doctype html><html><body style="margin:0;background:transparent">${p.html.replace("<svg ", `<svg width="${ancho}" height="${alto}" `)}</body></html>`,
  );
  await pagina.screenshot({ path: p.archivo, omitBackground: !p.pagina });
  await pagina.close();
  console.log("✓", p.archivo);
}
await navegador.close();
console.log("✓", Object.keys(svgs).length, "SVG en", pub, "+ app/icon.svg");

// favicon.ico: los navegadores lo piden solos en /favicon.ico aunque haya icon.svg.
// Se arma con 16/32/48 px a partir del ícono; la imagen para X/Twitter es la misma de redes.
{
  const { execFileSync } = await import("node:child_process");
  const { copyFileSync } = await import("node:fs");
  execFileSync("python3", ["-c", [
    "from PIL import Image",
    `im = Image.open('${pub}/icono-512.png').convert('RGBA')`,
    "im.save('app/favicon.ico', sizes=[(16,16),(32,32),(48,48)])",
  ].join("\n")]);
  copyFileSync("app/opengraph-image.png", "app/twitter-image.png");
  copyFileSync("app/opengraph-image.alt.txt", "app/twitter-image.alt.txt");
  console.log("✓ app/favicon.ico + app/twitter-image.png");
}
