/** Aviso fijo de la Agenda para quien solo puede mirarla (dentista, asistente de doctores o un rol propio sin permisos de agenda).
 *  Sin esto, la grilla semanal quedaba muda: se tocaba un espacio y no pasaba nada, y no había botón «Dar cita». Se muestra cuando el rol
 *  no puede ni dar citas (`agenda.create`) ni bloquear espacios (`agenda.edit`); si tiene uno de los dos, los menús ya muestran lo suyo. */
import { Eye } from "lucide-react";

export function AvisoSoloLectura({ rol }: { rol: string }) {
  return (
    <p role="note" className="flex items-start gap-2 rounded-xl border border-clinic-border bg-white px-4 py-2.5 text-sm text-clinic-muted print:hidden">
      <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <b className="text-clinic-text">Agenda en solo lectura.</b> Tu rol ({rol}) puede ver las citas, pero no dar citas ni bloquear espacios. Pedile a recepción o al administrador que lo haga.
      </span>
    </p>
  );
}
