/** Escape de texto para interpolación SEGURA en HTML armado por concatenación.
 *
 *  React auto-escapa en JSX, así que la UI normal NO necesita esto. Es para los
 *  pocos lugares donde construimos HTML a mano y lo mandamos afuera —p. ej. el
 *  cuerpo del email de presupuesto (`/api/email` → Resend)—, donde un dato del
 *  paciente (nombre, descripción) podría inyectar markup/`<script>` en el cliente
 *  de correo del destinatario. El nombre del paciente puede venir del formulario
 *  PÚBLICO de reserva (sin sesión), así que es entrada no confiable. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
