/** Generación de calendario iCalendar (.ics) — estándar abierto que importa
 *  CUALQUIER app de calendario (Outlook, Apple Calendar, Google, etc.) sin
 *  cuenta ni credenciales. Reemplaza la dependencia de Google Calendar. */

export interface ICSEvent {
  uid: string;
  start: string;   // ISO
  end: string;     // ISO
  title: string;
  description?: string;
  location?: string;
}

/** ISO → formato UTC básico iCal (YYYYMMDDTHHMMSSZ). */
export function toICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapa texto según RFC 5545 (\\ ; , y saltos de línea). */
export function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Construye un VCALENDAR válido. `stamp` = DTSTAMP en UTC básico (lo pasa el caller). */
export function buildICS(events: ICSEvent[], stamp: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Novudent//Agenda//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toICSDate(e.start)}`,
      `DTEND:${toICSDate(e.end)}`,
      `SUMMARY:${escapeICS(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Descarga el contenido como archivo .ics en el navegador. */
export function downloadICS(filename: string, content: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
