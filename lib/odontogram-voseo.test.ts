import { describe, it, expect } from "vitest";
import { translations } from "../components/odontogram-engine/i18n/translations";

/** El odontograma habla español rioplatense con voseo (CLAUDE.md: «Elegí», «Tocá», «Podés»).
 *  El motor es una copia vendorizada del proyecto de origen, que escribió el locale `es` en tuteo
 *  («Haz clic…», «usa CMD/CTRL»). Se parchó a mano (ver components/odontogram-engine/NOTICE.md); este test
 *  avisa si al re-sincronizar con el origen vuelve el tuteo. */

const es = translations.es;

// Verbos en imperativo de tú que el origen usa para dar indicaciones. «marca» y «activa» solas son también un sustantivo/adjetivo
// ("Caries radicular activa"), así que van pegadas al arranque de una frase.
const TUTEO = [
  /\bhaz\b/i, /\busa\b/i, /\bmantén\b/i, /\btoca\b/i, /\belige\b/i, /\bselecciona\b/i, /\bcambia\b/i, /\bexporta\b/i, /\bcarga\b/i, /\bexplora\b/i,
  /(^|[.!?—]\s*)marca\b/i, /(^|[.!?—]\s*)activa\b/i,
];

describe("odontograma: textos en español rioplatense", () => {
  it("ninguna indicación del locale es queda en tuteo", () => {
    const tuteadas = Object.entries(es).filter(([, texto]) => TUTEO.some((re) => re.test(texto))).map(([clave, texto]) => `${clave}: ${texto}`);
    expect(tuteadas).toEqual([]);
  });

  it("las indicaciones que ve quien usa la carta dental, en voseo", () => {
    expect(es["chart.hint"]).toBe("Hacé clic en un diente. Para selección múltiple, usá Cmd/Ctrl + clic.");
    expect(es["chart.hint.touch"]).toBe("Tocá un diente para seleccionarlo. Mantené presionado para más opciones.");
    expect(es["caries.hint"]).toBe("Seleccioná las superficies de caries");
    expect(es["endo.hint"]).toBe("Seleccioná el estado de la raíz");
    expect(es["app.subtitle"]).toBe("Seleccioná un diente en el odontograma y configurá las capas.");
  });

  it("el recorrido guiado (hoy escondido) también", () => {
    expect(es["intro.step1.text"]).toBe("Hacé clic en un diente del odontograma para empezar a editar.");
    expect(es["intro.step5.text"]).toBe("Elegí un material y luego marcá las superficies — cada superficie puede tener su propio material.");
    expect(es["intro.step7.text"]).toBe("Hacé doble clic en un diente para añadir una nota.");
    expect(es["intro.step12.text"]).toBe("Eso es lo básico — explorá el resto de las funciones.");
  });

  it("no se perdió ni se agregó ningún texto: el locale es tiene las mismas claves que el original en húngaro (salvo las que Novudent agregó a propósito)", () => {
    // Textos que no existen en el origen y que Novudent sumó al motor (cada uno está en components/odontogram-engine/NOTICE.md).
    const AGREGADAS_POR_NOVUDENT = ["status.resetAllConfirm"];
    const delOrigen = Object.keys(es).filter((k) => !AGREGADAS_POR_NOVUDENT.includes(k));
    expect(delOrigen.sort()).toEqual(Object.keys(translations.hu).sort());
    for (const k of AGREGADAS_POR_NOVUDENT) expect(es[k], `falta el texto agregado ${k}`).toBeTruthy();
  });

  it("los otros idiomas no se tocaron (Novudent solo usa es)", () => {
    expect(translations.en["chart.hint"]).toMatch(/^Click a tooth/i);
  });
});
