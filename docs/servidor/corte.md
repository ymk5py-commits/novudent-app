# Corte de Novudent: de Firebase a Supabase (guía de la fase F)

Actualiza el §11.3 del spec del 9-oct a la realidad del 17-oct-2026: **el hosting ya está en el servidor** (Coolify + túnel, `novudent.novumholding.lat`), así que el corte **no cambia el DNS ni la URL
pública**: cambia de dónde lee y escribe la app. Eso lo hace un redeploy con otras variables.

## Antes de la ventana (todo tiene que estar en verde)

- [ ] Fases B, C y D terminadas y mergeadas: esquema y RLS con las 144 pruebas, adaptador Supabase, cargador con verificación.
- [ ] **Simulacro completo, dos veces**, contra una copia exportada y un stack descartable, cronometrado. Criterio: carga repetible sin diferencias y SHA-256 igual en todos los documentos.
- [ ] Respaldos a R2 corriendo y **una restauración de prueba hecha** (`docs/servidor/respaldos.md`).
- [ ] Integración externa por *outbox* (`docs/INTEGRACION-BOTIKA.md`): **fuera del alcance de este proyecto** (Novum y Novudent). Hoy lee y escribe `clinics/{id}/outbox` en Firestore; cuando Firestore pase a solo lectura (y más aún al apagarlo) esa integración deja de funcionar hasta que quien la mantenga la cambie. Tenerlo presente al decidir la fecha de apagado de Firebase.
- [ ] Confirmar que **ningún otro sistema** lee o escribe el Firestore de Novudent (el código de las otras carpetas de Croman no lo usa; falta confirmarlo con él).
- [ ] Aviso a las clínicas con 7 días: cada usuario real recibe un correo para **elegir contraseña nueva** (no se importan los hashes de Firebase). Hoy son 4 clínicas dadas de alta con 1 usuario cada una, y la demo.
- [ ] Un dominio público definitivo para Supabase: `api-novudent.novumholding.lat` (un solo nivel; ver §3 del diseño de la fase A) o promover el de prueba. Es un CNAME más y una ruta en el túnel (una edición, un reinicio).

## La ventana (fuera del horario de las clínicas)

1. **Congelar Firestore:** publicar reglas que **nieguen toda escritura** (`firebase deploy --only firestore:rules` con el archivo de mantenimiento) y poner el aviso de mantenimiento en la app.
2. **Exportar:** `npm run migracion:exportar` (guarda fuera del repo, en `~/novudent-export`; revisar `manifiesto.json`).
3. **Esquema y carga:** `scripts/supabase/aplicar-esquema.sh` contra la base de producción; `scripts/migracion/cargar-postgres.mjs`; el informe tiene que dar **cero diferencias**.
4. **Respaldo inmediato** de la base ya cargada (`respaldo.sh`).
5. **Pruebas de humo** (login, abrir ficha, dar cita, cobrar, chat en tiempo real, reserva online, webhook de pago de prueba, `/api/health` con la base).
6. **Cambiar la app** en Coolify (`novudent-app`, hoy de la sesión SERVIDOR GMKTEC): variables de build `NEXT_PUBLIC_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; de ejecución `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`; redeploy. Lemon Squeezy y las demás URL **no cambian** (mismo dominio).
7. Avisar que volvió y mirar los registros las primeras horas.

## Después

- Firestore queda **solo lectura 14 días**; después se archiva y se apaga Firebase (Firestore, Auth y App Check) y se borran las variables `FIREBASE_*` y `SERVICE_USER_*` de Coolify.
- **Vercel:** los proyectos están pausados; se borran pasados esos 14 días. El dominio ya no apunta ahí.
- **Marcha atrás:** limpia solo *dentro de la ventana* (nada se escribió todavía en Supabase): se republican las reglas viejas de Firestore y se vuelve a desplegar la app con `NEXT_PUBLIC_BACKEND=firestore`. Pasada la ventana no hay retorno automático; el riesgo se cubre con los simulacros.
