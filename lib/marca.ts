/** Identidad de Novudent (27/9/2026): logotipo «NOVUdent» + isologo del diente.
 *
 *  Fuente única de la marca. Los trazos del logotipo salen de la pieza que mandó
 *  Novum: «NOVU» en Montserrat Black ensanchada 26 % y «dent» en Montserrat Light,
 *  convertidas a curvas para que el logo no dependa de ninguna fuente cargada.
 *  El diente se redibujó en vectores sobre la misma pieza.
 *
 *  Lo usan el componente <Logotipo>/<Isologo> (components/Marca.tsx), la imagen
 *  para redes y `scripts/generar-marca.mjs`, que regenera los íconos y los PNG de
 *  `public/marca/`. Si cambia algo acá, correr `npm run marca`. */

export type Tono = "color" | "blanco" | "negro";

/** Paleta de la marca, medida sobre la pieza original. */
export const MARCA = {
  /** Texto del logotipo sobre fondo claro. */
  tinta: "#032253",
  /** Fondo navy de la marca (versión invertida, íconos, redes). */
  navy: "#051735",
  /** Azul del diente: del celeste de arriba al azul profundo de abajo. */
  celeste: "#04A9F2",
  azul: "#086BCD",
  profundo: "#04255F",
  negro: "#111418",
} as const;

/** Degradés del diente por tono: [cuerpo, arco interior]. */
const DEGRADES: Record<"color" | "negro", { cuerpo: [number, string][]; arco: [number, string][]; sombra: string }> = {
  color: {
    cuerpo: [[0, "#36D2FF"], [0.3, "#04A9F2"], [0.56, "#086BCD"], [0.8, "#0A3F95"], [1, "#04255F"]],
    arco: [[0, "#5AD8FC"], [0.5, "#1693E8"], [1, "#0A57BA"]],
    sombra: "#00225B",
  },
  negro: {
    cuerpo: [[0, "#9AA1AA"], [0.35, "#5E656E"], [0.7, "#2B3036"], [1, "#111418"]],
    arco: [[0, "#B8BEC6"], [0.5, "#6B727B"], [1, "#2F343A"]],
    sombra: "#000000",
  },
};

/** Diente en una caja de 100 × 110. La silueta y los dos arcos cierran en
 *  punta; el espacio entre las raíces deja ver el fondo. */
export const ISO = {
  ancho: 100,
  alto: 110,
  cuerpo: "M27.5 104 C19 90 9 70 7.5 48 C6 30 10 13 26 10 C35 8.5 42 13 49 17 C58 11 67 7 78 9 C92 12 95 27 93 44 C91 65 76 88 67 104 C64 75 59 48 46.5 48 C34 48 29 75 27.5 104 Z",
  hueco: "M27.5 104 C27.5 72 33.5 45 46.5 45 C60 45 66.5 72 67 104 C62 81 56 60 46.5 60 C37 60 32 81 27.5 104 Z",
  arco: "M34 104 C33.5 80 38 62 46.5 62 C55 62 60 80 59.5 104 C56 86 52.5 73 46.5 73 C40.5 73 37 86 34 104 Z",
} as const;

/** Logotipo en unidades donde la altura de mayúscula de «NOVU» = 100 y la línea
 *  de base está en y = 0. */
export const PALABRA = {
  novu: "M10.3 0V-100H45.2L109.3 -39.1H93.1V-100H134.5V0H99.5L35.5 -60.9H51.7V0ZM220.5 2.3Q205 2.3 192 -1.6Q178.9 -5.4 169.4 -12.5Q159.8 -19.6 154.5 -29.1Q149.2 -38.7 149.2 -50Q149.2 -61.4 154.5 -70.9Q159.8 -80.4 169.4 -87.5Q178.9 -94.6 192 -98.4Q205 -102.3 220.3 -102.3Q235.8 -102.3 248.8 -98.4Q261.7 -94.6 271.3 -87.5Q280.8 -80.4 286.1 -70.9Q291.4 -61.4 291.4 -50Q291.4 -38.7 286.1 -29.1Q280.8 -19.6 271.3 -12.5Q261.7 -5.4 248.8 -1.6Q235.8 2.3 220.5 2.3ZM220.3 -25Q226.3 -25 231.4 -26.7Q236.5 -28.4 240.4 -31.6Q244.3 -34.9 246.4 -39.5Q248.6 -44.1 248.6 -50Q248.6 -55.9 246.4 -60.5Q244.3 -65.1 240.4 -68.4Q236.5 -71.6 231.4 -73.3Q226.3 -75 220.3 -75Q214.4 -75 209.2 -73.3Q204.1 -71.6 200.2 -68.4Q196.4 -65.1 194.2 -60.5Q192.1 -55.9 192.1 -50Q192.1 -44.1 194.2 -39.5Q196.4 -34.9 200.2 -31.6Q204.1 -28.4 209.2 -26.7Q214.4 -25 220.3 -25ZM345.8 0 292.5 -100H338.2L381.6 -15.6H354.4L399.1 -100H440.8L387.5 0ZM507.2 2.3Q478.3 2.3 462.1 -10.1Q445.9 -22.6 445.9 -45V-100H488.3V-46Q488.3 -34.6 493.6 -29.8Q498.8 -25 507.6 -25Q516.6 -25 521.7 -29.8Q526.9 -34.6 526.9 -46V-100H568.6V-45Q568.6 -22.6 552.4 -10.1Q536.2 2.3 507.2 2.3Z",
  dent: "M630.1 0.6Q619.1 0.6 610.3 -4.6Q601.5 -9.9 596.3 -19.3Q591.2 -28.8 591.2 -41Q591.2 -53.4 596.3 -62.8Q601.5 -72.1 610.3 -77.4Q619.1 -82.7 630.1 -82.7Q640.5 -82.7 648.9 -77.6Q657.3 -72.6 662.2 -63.3Q667.1 -54.1 667.1 -41Q667.1 -28.3 662.2 -18.9Q657.4 -9.4 649 -4.4Q640.7 0.6 630.1 0.6ZM630.6 -6.4Q639.6 -6.4 646.8 -10.8Q653.9 -15.1 658.1 -22.9Q662.2 -30.8 662.2 -41Q662.2 -51.4 658.1 -59.2Q653.9 -66.9 646.8 -71.3Q639.6 -75.6 630.6 -75.6Q621.5 -75.6 614.3 -71.3Q607.2 -66.9 603 -59.2Q598.9 -51.4 598.9 -41Q598.9 -30.8 603 -22.9Q607.2 -15.1 614.3 -10.8Q621.5 -6.4 630.6 -6.4ZM662.4 0V-26.9L663.8 -41.2L662.2 -55.5V-116.6H669.8V0ZM729.1 0.6Q717.2 0.6 708 -4.7Q698.9 -10.1 693.7 -19.5Q688.5 -28.9 688.5 -41Q688.5 -53.3 693.4 -62.6Q698.3 -72 706.9 -77.3Q715.5 -82.7 726.2 -82.7Q736.9 -82.7 745.4 -77.5Q754 -72.3 758.9 -62.9Q763.8 -53.6 763.8 -41.3Q763.8 -40.9 763.7 -40.3Q763.6 -39.8 763.6 -39.1H694.1V-45.3H759.5L756.5 -42.3Q756.7 -51.9 752.7 -59.5Q748.7 -67.1 741.9 -71.4Q735.1 -75.7 726.2 -75.7Q717.5 -75.7 710.6 -71.4Q703.7 -67.1 699.8 -59.5Q695.9 -51.9 695.9 -42.1V-40.7Q695.9 -30.6 700.2 -22.9Q704.5 -15.1 712 -10.8Q719.6 -6.4 729.2 -6.4Q736.8 -6.4 743.3 -9.3Q749.9 -12.1 754.4 -17.9L758.8 -12.7Q753.7 -6.1 745.9 -2.8Q738.1 0.6 729.1 0.6ZM782.6 0V-82H789.9V-59.2L788.8 -61.8Q792.4 -71.5 800.7 -77.1Q809 -82.7 821.1 -82.7Q830.8 -82.7 837.9 -78.8Q845.1 -75 849.1 -67.2Q853.1 -59.4 853.1 -47.9V0H845.5V-47.3Q845.5 -61.1 838.8 -68.4Q832.1 -75.6 820 -75.6Q810.8 -75.6 804.1 -71.7Q797.3 -67.7 793.7 -60.7Q790.2 -53.6 790.2 -43.7V0ZM902.6 0.6Q892.2 0.6 886.6 -5.3Q881.1 -11.3 881.1 -21.7V-99.9H888.7V-22.5Q888.7 -14.6 892.5 -10.4Q896.2 -6.1 903.3 -6.1Q910.7 -6.1 915.5 -10.7L918.7 -5.2Q915.7 -2.2 911.4 -0.8Q907.1 0.6 902.6 0.6ZM866.7 -75.3V-82H913.7V-75.3Z",
} as const;

/** Composición horizontal (palabra + diente), como en la pieza: el diente mide
 *  2,19 mayúsculas y cae media mayúscula por debajo de la base. */
const ESCALA_ISO = 1.99;
export const LOGO = {
  // El diente necesita aire debajo de las raíces; antes tocaba el borde del SVG.
  viewBox: "8 -170 1114 230",
  ancho: 1114,
  alto: 230,
  iso: { x: 929, y: -168, escala: ESCALA_ISO },
} as const;

/** Colores del texto por tono. */
export function tintaDe(tono: Tono): string {
  return tono === "blanco" ? "#FFFFFF" : tono === "negro" ? MARCA.negro : MARCA.tinta;
}

const stops = (s: [number, string][]) => s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");

/** Definiciones y trazos del diente, en SVG plano (para archivos, correos y la
 *  imagen de redes). `id` evita choques de degradés si hay varios en la página. */
export function isoInterno(tono: Tono, id = "nd"): string {
  const g = DEGRADES[tono === "negro" ? "negro" : "color"];
  return (
    `<defs>` +
    `<linearGradient id="${id}-c" x1="0.92" y1="0.04" x2="0.12" y2="0.96">${stops(g.cuerpo)}</linearGradient>` +
    `<radialGradient id="${id}-s" cx="0.24" cy="0.26" r="0.46"><stop offset="0" stop-color="${g.sombra}" stop-opacity="0.85"/><stop offset="1" stop-color="${g.sombra}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}-a" x1="0.9" y1="0.1" x2="0.1" y2="1">${stops(g.arco)}</linearGradient>` +
    `</defs>` +
    `<path fill="url(#${id}-c)" d="${ISO.cuerpo}"/>` +
    `<path fill="url(#${id}-s)" d="${ISO.cuerpo}"/>` +
    `<path fill="#FFFFFF" d="${ISO.hueco}"/>` +
    `<path fill="url(#${id}-a)" d="${ISO.arco}"/>`
  );
}

/** Isologo suelto como documento SVG. */
export function svgIsologo(tono: Tono = "color"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ISO.ancho} ${ISO.alto}">${isoInterno(tono)}</svg>`;
}

/** Logotipo completo (palabra + diente) como documento SVG. */
export function svgLogotipo(tono: Tono = "color"): string {
  const t = tintaDe(tono);
  const { x, y, escala } = LOGO.iso;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO.viewBox}">` +
    `<path fill="${t}" d="${PALABRA.novu}"/><path fill="${t}" d="${PALABRA.dent}"/>` +
    `<g transform="translate(${x} ${y}) scale(${escala})">${isoInterno(tono)}</g>` +
    `</svg>`
  );
}

/** Ícono de app: el diente sobre el cuadrado navy (como en la pieza). `redondo`
 *  redondea las esquinas (favicon); iOS y Android recortan solos. */
export function svgIcono({ lado = 512, redondo = false, fondo = "navy" }: { lado?: number; redondo?: boolean; fondo?: "navy" | "blanco" } = {}): string {
  const r = redondo ? lado * 0.22 : 0;
  const bg = fondo === "navy"
    ? `<defs><linearGradient id="ic-f" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#0A3E80"/><stop offset="1" stop-color="#001434"/></linearGradient></defs><rect width="${lado}" height="${lado}" rx="${r}" fill="url(#ic-f)"/>`
    : `<rect width="${lado}" height="${lado}" rx="${r}" fill="#FFFFFF"/>`;
  const esc = (lado * 0.66) / ISO.alto;
  // El diente visible va de x 7,5 a 93 y de y 8 a 104: lo centro por esa caja, no por la del viewBox.
  const cx = (7.5 + 93) / 2, cy = (8 + 104.4) / 2;
  const tx = lado / 2 - cx * esc, ty = lado / 2 - cy * esc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}">${bg}<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${esc.toFixed(4)})">${isoInterno("color", "ic")}</g></svg>`;
}
