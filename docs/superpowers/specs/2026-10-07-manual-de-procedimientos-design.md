# Manual de procedimientos por rol — diseño

**Fecha:** 7-oct-2026 · **Pedido de:** Camila y Angel (grupo Novum): «hay que armar un boceto y afinar
minuciosamente» · **Decide:** Croman

## Qué es

Un manual **en PDF** que le enseña a cada persona de la clínica a hacer *su* trabajo en Novudent: cinco
capítulos, uno por rol, más uno «Para todos». Cada procedimiento es una tarea concreta («Dar una cita»,
«Ingresar un pago», «Armar un plan de tratamiento») con pasos numerados y **capturas reales de la demo**
tomadas automáticamente, con el botón a tocar marcado en la imagen. Sirve para capacitar al equipo del cliente
(día 5 de la puesta en marcha) y como material de venta. El PDF de agosto (`generar-manual.py`) explicaba
tres roles; quedó atrás y sigue ahí solo por lo que dice para el dueño (alta de clínica, planes, guion de demo).

Es un **borrador**: Angel y Camila lo afinan. Por eso el PDF marca lo que hay que confirmar con un recuadro
«Para revisar» y junta todos esos puntos en una lista al final.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Estructura | Capítulo «Para todos» + un capítulo por rol (Recepcionista, Recepción y caja, Dentista, Asistente de doctores, Administrador). Un procedimiento vive en UN capítulo; en los otros roles que también lo hacen aparece en su índice con la página | No repetir páginas, pero que cada persona vea todo lo suyo en un solo lugar |
| Fuente de verdad | El texto vive en `docs/manual/contenido/*.ts` (datos tipados), las capturas salen de correr la app, y los permisos del apéndice salen de `lib/rbac.ts` | Si cambia un botón o un permiso, se vuelve a correr y el manual no miente |
| Capturas | Playwright contra la app compilada, con la demo sembrada y Firebase cortado (igual que el E2E): deterministas y sin tocar producción | Repetibles; nunca ensucian la demo del equipo |
| Marcado en la imagen | `foto(nombre, { resaltar })` dibuja un recuadro rojo (numerado si son varios) sobre lo que hay que tocar | Un manual sin flechas no se sigue |
| Armado | Node arma un HTML; **WeasyPrint** lo pasa a PDF (índice con números de página, encabezado por capítulo, saltos de página) | Chromium no calcula el índice; WeasyPrint sí y ya está instalado |
| Lo que NO se commitea | `docs/manual/salida/` (capturas, HTML y PDF) | Son binarios que se regeneran en un minuto |
| Mentiras | Cada paso se verifica corriéndolo: si el flujo falla, la captura falla. La IA no se captura (en la demo pública está apagada); se explica con texto | «Nada acá es inventado» (la regla del manual de agosto) |
| Tono | Voseo, imperativo, frases cortas; los botones van entre «comillas angulares» y se dibujan como botón | Es como habla la app |

## Formato de un procedimiento

```ts
{ id: "dar-una-cita", capitulo: "recepcion", titulo: "Dar una cita",
  roles: ["receptionist", "cashier", "admin"],          // quiénes lo hacen
  paraQue: "Cuando un paciente pide un horario.",
  antes: ["El paciente ya tiene ficha"],
  pasos: [{ texto: "Entrá a **Agenda** y tocá «Dar cita».", captura: "agenda" }, …],
  avisos: [{ tipo: "ojo" | "tip" | "revisar", texto: "…" }],
  capturar: async (c) => { await c.entrar("receptionist", "/app/agenda"); await c.foto("agenda", { resaltar: … }); … } }
```

Marcas dentro del texto: `**negrita**`, `«Botón»` (se dibuja como botón), `[[otro-id]]` (referencia con página).

## Controles automáticos (`npm test`)

- ids únicos, todo paso con texto, capturas sin repetir dentro de un procedimiento, roles y capítulos válidos;
- marcas balanceadas (`**`, `«»`, `[[ ]]` que apunten a un procedimiento que existe);
- el apéndice de permisos cubre TODAS las claves de `Permission` en `lib/rbac.ts`;
- el armado de HTML escapa el texto y arma índice, capítulos y lista de «Para revisar».

Al generar el PDF también se exige que cada captura nombrada en un paso exista como imagen y que ninguna
imagen quede sin usar.

## Cómo se corre

```bash
npm run build                    # la app compilada (lo mismo que el E2E)
npm run manual:capturas          # saca todas las capturas (o: -- --grep dar-una-cita)
npm run manual:pdf               # arma docs/manual/salida/manual-novudent.pdf
```

## Fuera de alcance (esta versión)

Capturas del celular; videos; las pantallas de IA (dictado, Copilot, radiografía IA: dependen de una clínica con
plan y de Gemini); el panel del dueño (`/superadmin`), que sigue en el manual de agosto.
