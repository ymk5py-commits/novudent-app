import { describe, it, expect } from "vitest";
import { ubicarPanel, type RectAncla } from "./ubicarPanel";

/* Dónde va el menú flotante (`Desplegable`) respecto del botón que lo abre. Lo que no puede pasar nunca: que una parte del menú
   quede fuera de la pantalla sin forma de llegar a ella (con estados de cita propios y una ventana de 760 px de alto, los
   últimos quedaban fuera y no se podían tocar). */

const VENTANA = { ancho: 1440, alto: 760 };
const boton = (top: number, left = 600, alto = 28, ancho = 120): RectAncla => ({ top, bottom: top + alto, left, right: left + ancho });

describe("ubicarPanel — vertical", () => {
  it("si entra abajo del botón, se abre abajo, a 6 px", () => {
    const r = ubicarPanel({ ancla: boton(100), alto: 200, ancho: 220, alinear: "izquierda", ventana: VENTANA });
    expect(r.top).toBe(128 + 6);
    expect(r.altoMax).toBeGreaterThanOrEqual(200);
  });

  it("si no entra abajo pero sí arriba, se abre arriba, pegado al botón", () => {
    const r = ubicarPanel({ ancla: boton(650), alto: 300, ancho: 220, alinear: "izquierda", ventana: VENTANA });
    expect(r.top).toBe(650 - 6 - 300);
    expect(r.top).toBeGreaterThanOrEqual(8);
  });

  it("si no entra ni arriba ni abajo, se queda del lado con más lugar y se achica: el resto se recorre con scroll", () => {
    // Botón a 300 px del borde de arriba: abajo hay 760 − 328 − 14 = 418 px y arriba 300 − 14 = 286.
    const r = ubicarPanel({ ancla: boton(300), alto: 1300, ancho: 220, alinear: "izquierda", ventana: VENTANA });
    expect(r.top).toBe(328 + 6);
    expect(r.altoMax).toBe(760 - 328 - 6 - 8);
    expect(r.top + r.altoMax).toBeLessThanOrEqual(VENTANA.alto - 8);
  });

  it("si hay más lugar arriba que abajo y no entra, se pega al borde de arriba con el máximo posible", () => {
    const r = ubicarPanel({ ancla: boton(600), alto: 1300, ancho: 220, alinear: "izquierda", ventana: VENTANA });
    expect(r.top).toBe(8);
    expect(r.altoMax).toBe(600 - 6 - 8);
    expect(r.top + r.altoMax).toBeLessThanOrEqual(600 - 6); // termina antes del botón
  });

  it("el menú, tan alto como sea, nunca se sale de la ventana", () => {
    for (const top of [0, 8, 100, 300, 380, 500, 700, 740]) {
      for (const alto of [40, 200, 500, 900, 3000]) {
        const r = ubicarPanel({ ancla: boton(top), alto, ancho: 220, alinear: "izquierda", ventana: VENTANA });
        const altoReal = Math.min(alto, r.altoMax);
        expect(r.top, `botón en ${top}, menú de ${alto}`).toBeGreaterThanOrEqual(8 - 1e-9);
        expect(r.top + altoReal, `botón en ${top}, menú de ${alto}`).toBeLessThanOrEqual(VENTANA.alto - 8 + 1e-9);
      }
    }
  });

  it("en una ventana muy baja (celular de costado) usa toda la ventana en vez de quedarse con una rendija", () => {
    const baja = { ancho: 900, alto: 300 };
    const r = ubicarPanel({ ancla: boton(140, 400), alto: 900, ancho: 220, alinear: "izquierda", ventana: baja });
    expect(r.top).toBe(8);
    expect(r.altoMax).toBe(300 - 16);
  });
});

describe("ubicarPanel — horizontal", () => {
  it("alineado a la izquierda del botón", () => {
    const r = ubicarPanel({ ancla: boton(100, 600), alto: 100, ancho: 220, alinear: "izquierda", ventana: VENTANA });
    expect(r.left).toBe(600);
    expect(r.ancho).toBe(220);
  });

  it("alineado a la derecha del botón: el borde derecho del menú coincide con el del botón", () => {
    const r = ubicarPanel({ ancla: boton(100, 600, 28, 120), alto: 100, ancho: 220, alinear: "derecha", ventana: VENTANA });
    expect(r.left + r.ancho).toBe(720);
  });

  it("no se sale por la derecha ni por la izquierda", () => {
    expect(ubicarPanel({ ancla: boton(100, 1400), alto: 100, ancho: 220, alinear: "izquierda", ventana: VENTANA }).left).toBe(1440 - 220 - 8);
    expect(ubicarPanel({ ancla: boton(100, 0, 28, 40), alto: 100, ancho: 220, alinear: "derecha", ventana: VENTANA }).left).toBe(8);
  });

  it("si la ventana se angosta (girar el celular) el menú se achica para entrar: nunca más ancho que la pantalla", () => {
    const angosta = { ancho: 300, alto: 700 };
    const r = ubicarPanel({ ancla: boton(100, 200, 28, 60), alto: 100, ancho: 360, alinear: "derecha", ventana: angosta });
    expect(r.ancho).toBe(300 - 16);
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.left + r.ancho).toBeLessThanOrEqual(300 - 8);
  });
});
