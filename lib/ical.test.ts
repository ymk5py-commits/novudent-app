import { describe, it, expect } from "vitest";
import { buildICS, toICSDate, escapeICS } from "./ical";

describe("toICSDate", () => {
  it("convierte ISO a UTC básico iCal", () => {
    expect(toICSDate("2026-06-22T14:30:00.000Z")).toBe("20260622T143000Z");
  });
});

describe("escapeICS", () => {
  it("escapa coma, punto y coma y salto de línea", () => {
    expect(escapeICS("Dr. Pérez; control, mañana\nOK")).toBe("Dr. Pérez\\; control\\, mañana\\nOK");
  });
});

describe("buildICS", () => {
  it("arma un VCALENDAR válido con un evento", () => {
    const ics = buildICS([{ uid: "a1@novudent", start: "2026-06-22T14:00:00Z", end: "2026-06-22T15:00:00Z", title: "Control", description: "Ortodoncia", location: "Sede Central" }], "20260101T000000Z");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:a1@novudent");
    expect(ics).toContain("DTSTART:20260622T140000Z");
    expect(ics).toContain("DTEND:20260622T150000Z");
    expect(ics).toContain("SUMMARY:Control");
    expect(ics).toContain("LOCATION:Sede Central");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    // CRLF entre líneas (RFC 5545)
    expect(ics.includes("\r\n")).toBe(true);
  });
  it("soporta múltiples eventos", () => {
    const ics = buildICS([
      { uid: "1", start: "2026-06-22T14:00:00Z", end: "2026-06-22T15:00:00Z", title: "A" },
      { uid: "2", start: "2026-06-23T14:00:00Z", end: "2026-06-23T15:00:00Z", title: "B" },
    ], "20260101T000000Z");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  });
});
