import type { Procedure, RecoveryMonitor, RecoveryTouchpoint } from "./types";

/** CPTs quirúrgicos por default (el dentista puede marcar otros con surgical) */
export const SURGICAL_CPTS = new Set(["D7140", "D7210", "D3310", "D3320", "D3330", "D6010"]);

export function isSurgicalProcedure(p: Pick<Procedure, "cpt" | "surgical">): boolean {
  if (typeof p.surgical === "boolean") return p.surgical; // el flag explícito manda
  return SURGICAL_CPTS.has(p.cpt);
}

const SEV_RANK = { verde: 0, amarillo: 1, rojo: 2 } as const;

export function worstSeverity(
  tps: Pick<RecoveryTouchpoint, "severity">[]
): RecoveryTouchpoint["severity"] | undefined {
  const sevs = tps.map((t) => t.severity).filter(Boolean) as ("verde" | "amarillo" | "rojo")[];
  if (!sevs.length) return undefined;
  return sevs.reduce((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a));
}

export function buildMonitor(args: {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  procedure: string;
  now: Date;
}): RecoveryMonitor {
  const offsets: (24 | 48 | 72)[] = [24, 48, 72];
  const touchpoints: RecoveryTouchpoint[] = offsets.map((offsetHours) => ({
    offsetHours,
    dueAt: new Date(args.now.getTime() + offsetHours * 3600 * 1000).toISOString(),
    status: "pendiente",
  }));
  return {
    id: args.id,
    clinicId: args.clinicId,
    patientId: args.patientId,
    dentistId: args.dentistId,
    procedure: args.procedure,
    startedAt: args.now.toISOString(),
    touchpoints,
    status: "activo",
  };
}
