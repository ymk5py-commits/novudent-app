# Respaldos de la base de Supabase de Novudent

**Estado (17-oct-2026):** los scripts están hechos y probados (respaldo cifrado + restauración en una base descartable, 0 errores); **todavía no hay bucket de R2 ni temporizador**: faltan
las credenciales de Croman (abajo). Sin pacientes reales hoy, un volcado diario alcanza; el objetivo del spec (RPO ≤ 15 min con archivado continuo de WAL y `pgBackRest`) queda como mejora
para cuando haya datos reales: **hoy el RPO es de 24 horas**.

| Script | Qué hace |
|---|---|
| `infra/supabase/respaldo.sh` | `pg_dump` de la base → cifrado AES-256 (`openssl`, clave en `RESPALDO_CLAVE`) → comprobación (se descifra y se lista con `pg_restore`; si no abre, **no se sube**) → copia local (7 días) → Cloudflare R2 (14 diarios + 1 mensual el día 1, que dura 400 días) → verifica que el tamaño en R2 sea igual → avisa a Uptime Kuma solo si todo salió bien |
| `infra/supabase/restaurar-prueba.sh` | Restaura un respaldo en un `supabase/postgres` descartable (misma versión que el compose), cuenta tablas, usuarios y filas, y lo destruye. Es **la prueba mensual**: un respaldo que no se restauró no cuenta |

`./respaldo.sh --solo-local` no sube nada (sirve para probar). El volcado en claro nunca toca el disco: se cifra al vuelo.

## Lo que tiene que hacer Croman (una vez)

1. **R2:** en Cloudflare › R2, crear un bucket **privado** (p. ej. `novudent-respaldos`) y un token de API de R2 con permiso de **lectura y escritura solo sobre ese bucket**. R2 puede pedir
   un medio de pago aunque el uso sea chico.
2. **Guardar la configuración en el servidor con entrada oculta** (nada de esto pasa por el chat ni entra al repositorio):

```bash
ssh -t gmktec 'umask 077; read -rsp "Frase para cifrar los respaldos: " c; echo; read -rp "Endpoint R2 (https://<cuenta>.r2.cloudflarestorage.com): " e; read -rp "Bucket: " b; read -rp "Access key id: " i; read -rsp "Secret access key: " s; echo; printf "RESPALDO_CLAVE=%s\nR2_ENDPOINT=%s\nR2_BUCKET=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n" "$c" "$e" "$b" "$i" "$s" > ~/.respaldo-novudent.env && echo guardado'
```

3. **Guardar la frase de cifrado también fuera del servidor** (gestor de contraseñas): sin ella los respaldos no se pueden abrir, y si el servidor se rompe se pierde junto con ellos.
4. (Opcional) crear un monitor «push» en Uptime Kuma y poner su URL en `AVISO_URL`.

## Temporizador (cuando exista `~/.respaldo-novudent.env`)

Servicio y temporizador **de usuario** de systemd (el servidor ya corre `cloudflared-novum` así). `~/.config/systemd/user/respaldo-novudent.service`:

```ini
[Unit]
Description=Respaldo cifrado de la base de Supabase de Novudent
[Service]
Type=oneshot
ExecStart=%h/novudent-infra/respaldo.sh
```

`~/.config/systemd/user/respaldo-novudent.timer`:

```ini
[Unit]
Description=Respaldo diario de Novudent
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
```

`systemctl --user enable --now respaldo-novudent.timer` (y una sola vez `loginctl enable-linger novum` para que corra sin sesión abierta; pide `sudo`, lo teclea Croman).

## Recuperación real

1. Levantar el stack (Coolify › `supabase-prueba` › Deploy): Realtime crea solo su rol `supabase_realtime_admin`.
2. Descifrar y restaurar: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:RESPALDO_CLAVE < respaldo.dump.enc | docker exec -i <db-…> pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner`.
3. Reiniciar `auth`, `rest` y `realtime`, y probar con `probar-local.sh` (adaptado) o a mano: login, una lectura, el WebSocket.

## Riesgos que quedan

- **El servidor está en una casa:** luz e internet. Con R2 los datos sobreviven; el servicio no. Un UPS chico es lo más barato que mejora esto.
- **RPO de 24 h** hasta que haya WAL archivado.
- **Una sola frase de cifrado:** perderla = perder todos los respaldos.
