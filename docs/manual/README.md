# Manual de operación (PDF)

`generar-manual.py` arma el PDF que se le entrega a Carlos (dueño), al
administrador de cada clínica y al equipo, más el guion de la demo de venta.

```bash
python3 docs/manual/generar-manual.py ~/Desktop/Novudent-Manual-de-Operacion.pdf
```

Requiere `reportlab` (ya instalado en la máquina de Carlos).

## Por qué el generador vive en el repo y no solo el PDF

El manual afirma cosas concretas —precios, límites de cada plan, qué puede y qué
no puede hacer cada rol— y todas salen del código: `lib/plan.ts` y `lib/rbac.ts`.
Si esos valores cambian y el PDF queda viejo, se le termina prometiendo al
cliente algo que el sistema no hace. Teniendo el generador acá, actualizar el
manual es editar un archivo y volver a correrlo.

**Al tocar `lib/plan.ts`, `lib/rbac.ts` o el alta de `/superadmin`, revisá si
este manual quedó desactualizado.**

## Qué NO poner acá

La clave de propietario (`OWNER_PANEL_KEY`) y cualquier contraseña. El manual
explica dónde está guardada, nunca cuál es.
