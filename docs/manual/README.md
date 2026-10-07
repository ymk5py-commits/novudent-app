# Manuales de Novudent

Hay dos, con públicos distintos:

| | Para quién | Cómo se arma |
|---|---|---|
| **Manual de procedimientos** (este) | El equipo de cada clínica: qué hace cada rol, paso a paso, con capturas | `npm run manual:capturas` y `npm run manual:pdf` |
| **Manual de operación** (`generar-manual.py`, de agosto) | El dueño (Carlos): alta de clínicas, planes, mantenimiento y el guion de la demo de venta | `python3 docs/manual/generar-manual.py ~/Desktop/Novudent-Manual-de-Operacion.pdf` (necesita `reportlab`, que no está en todas las máquinas) |

El de operación habla de tres roles y de cosas que cambiaron: **al tocar `lib/plan.ts`, `lib/rbac.ts` o el alta de
`/superadmin`, revisá si quedó desactualizado**. Nunca pongas acá la clave de propietario (`OWNER_PANEL_KEY`) ni ninguna contraseña.

## El manual de procedimientos

Un PDF con un capítulo «Para todos» y uno por rol (Recepcionista, Recepción y caja, Dentista, Asistente de doctores, Administrador).
Cada procedimiento («Dar una cita», «Ingresar un pago»…) tiene pasos numerados y **capturas reales de la demo, tomadas solas**, con el
botón a tocar marcado en rojo. Es un borrador para que Angel y Camila lo afinen: lo que hay que confirmar sale en un recuadro amarillo
«Para revisar» y se junta en una lista al final. Diseño completo: `docs/superpowers/specs/2026-10-07-manual-de-procedimientos-design.md`.

```bash
npm run build                  # la app compilada (es lo que se fotografía, igual que el E2E)
npm run manual:capturas        # saca TODAS las capturas → docs/manual/salida/capturas/<procedimiento>/<paso>.png
npm run manual:pdf             # arma docs/manual/salida/manual-novudent.pdf (y manual.html)
```

Para trabajar un solo capítulo sin esperar al resto:

```bash
MANUAL_SOLO=recepcion npm run manual:capturas                 # los módulos de contenido/ que nombres, separados por coma
npm run manual:capturas -- --grep dar-una-cita                # un procedimiento
MANUAL_PERMISIVO=1 npm run manual:pdf                         # arma el PDF aunque falten capturas (salen marcadas)
```

Hace falta tener **WeasyPrint** (`python3 -m weasyprint`) y **poppler** (`pdfinfo`). `docs/manual/salida/` no se commitea: se regenera en un minuto.

### Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `contenido/<módulo>.ts` | El texto de los procedimientos y cómo sacar sus capturas (`capturar`) |
| `contenido/capitulos.ts` | Título e introducción de cada capítulo |
| `contenido/tipos.ts` | Los tipos (`Procedimiento`, `Paso`, `Captor`…) |
| `montar.ts` | Arma el HTML y valida el contenido. Puro, con tests (`montar.test.ts`) |
| `captor.ts` | Recorre la app con Playwright, marca lo que hay que tocar y recorta |
| `permisos.ts` | Los permisos de `lib/rbac.ts` en palabras: el apéndice «Qué puede hacer cada rol» sale de acá |
| `estilo.css` | La hoja de estilo del PDF (marca de Novudent) |

### Cómo se escribe un procedimiento

```ts
{
  id: "dar-una-cita",                      // único en todo el manual
  capitulo: "receptionist",                // dónde vive
  titulo: "Dar una cita",                  // empieza con un verbo
  roles: ["receptionist", "cashier", "admin"],   // quiénes lo hacen (aparece en el índice de cada uno)
  verComo: ["assistant"],                        // (opcional) roles que no lo hacen pero cuya pantalla se muestra: «así la ve ella»
  paraQue: "Cuando un paciente pide un horario.",
  antes: ["El paciente ya tiene ficha."],
  pasos: [
    { texto: "Entrá a **Agenda** y tocá «Dar cita».", captura: "agenda" },
    { texto: "Elegí al paciente y el horario." },
  ],
  avisos: [{ tipo: "ojo" | "tip" | "revisar", texto: "…" }],
  capturar: async (c) => {
    await c.entrar("receptionist", "/app/agenda");
    await c.foto("agenda", { resaltar: c.page.getByRole("button", { name: "Dar cita" }) });
  },
}
```

- `capturar` entra con `c.entrar("rol", …)`: el validador exige que ese rol esté en `roles` o en `verComo` (si no, el manual enseñaría
  la pantalla de quien no lo hace).
- Marcas en el texto: `**negrita**`, `«Botón o menú»` (se dibuja como botón), `[[otro-id]]` (referencia con la página).
- `c.foto(nombre, { resaltar, recorte, alto, pantalla, conAyuda })`: `resaltar` dibuja el recuadro rojo (con número si son varios) y
  `recorte` elige qué parte de la pantalla sale. Si lo que se muestra es más alto que la ventana, la ventana se agranda sola.
- Cada paso con `captura` tiene que tener su `c.foto` con el mismo nombre, y al revés. `npm test` valida el texto; al armar el PDF se
  exige que no falte ni sobre ninguna imagen.

Al recortar a un diálogo, `foto` pinta liso el fondo oscurecido mientras saca la imagen (si no, los bordes traen letras de la página de
atrás cortadas por la mitad); con `pantalla: true` se deja el fondo como está.

### Reglas del manual

1. **Nada inventado.** Cada paso se corre en la app: si el botón no está, la captura falla. Lo que no se puede fotografiar (la IA en la
   demo pública, las pantallas que dependen de un plan) se explica con texto y lo dudoso va como «Para revisar».
2. Voseo y verbos en imperativo («Tocá», «Elegí»). Los botones, entre «comillas angulares».
3. No se nombra a otros sistemas ni se pone un dato real: todo es de la clínica de demostración.
4. Si cambia un permiso en `lib/rbac.ts`, `npm test` se rompe hasta que `permisos.ts` lo explique.
