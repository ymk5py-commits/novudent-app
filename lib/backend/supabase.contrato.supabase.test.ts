/** Corre el contrato de datos contra Supabase de verdad (un stack descartable con el esquema de la fase B). `npm run test:supabase`.
 *  OJO: cada prueba VACÍA todas las tablas (también `cl_demo`): usarlo solo con el stack descartable.
 *  Usa la clave de servicio: lo que se prueba acá es la capa de datos (qué se guarda y qué se escucha), no los permisos; los permisos los prueban las
 *  pruebas de RLS de la fase B (test/rls) y los e2e con sesiones de verdad (e2e-supabase). */
import { createClient } from "@supabase/supabase-js";
import { describeContratoDeDatos } from "./contrato-de-datos";
import { COLECCIONES_DE_CLINICA } from "./colecciones";
import { TABLAS_RAIZ } from "./supabase-esquema";
import { crearDatosSupabase } from "./supabase";

describeContratoDeDatos("Supabase (stack local)", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY: usá scripts/adaptadores/correr.sh");
  const admin = createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } });
  const usuarioId = "u-sesion";

  const sembrar = async (ruta: string, data: Record<string, unknown>) => {
    const s = ruta.split("/");
    let fila: Record<string, unknown>;
    let tabla: string;
    let conflicto: string;
    if (s[0] === "directory") {
      // `directory` no existe: el uid de login → clínica sale de `users.authUid`. Se arma el usuario que lo representa.
      tabla = "users"; conflicto = "clinic_id,id";
      fila = { clinic_id: data.clinicId, id: s[1], data: { id: s[1], authUid: s[1], email: data.email } };
    } else if (s[0] === "clinics" && s.length === 4) {
      tabla = s[2]; conflicto = "clinic_id,id"; fila = { clinic_id: s[1], id: s[3], data };
    } else {
      tabla = s[0]; conflicto = "id"; fila = { id: s[1], data };
    }
    const { error } = await admin.from(tabla).upsert(fila, { onConflict: conflicto });
    if (error) throw new Error(`sembrar ${ruta}: ${error.message}`);
  };

  return {
    backend: crearDatosSupabase(admin, async () => usuarioId),
    usuarioId,
    sembrar,
    vaciar: async () => {
      for (const t of [...COLECCIONES_DE_CLINICA, ...TABLAS_RAIZ]) {
        // Un reintento: el túnel SSH a veces cierra una conexión inactiva que `fetch` quería reutilizar.
        let error = (await admin.from(t).delete().not("id", "is", null)).error;
        if (error && /fetch failed/i.test(error.message)) error = (await admin.from(t).delete().not("id", "is", null)).error;
        if (error) throw new Error(`vaciar ${t}: ${error.message}`);
      }
    },
    cerrar: async () => { await admin.removeAllChannels(); },
  };
});
