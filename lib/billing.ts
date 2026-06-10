import type { BillingRecord, BillingFlag } from "./types";

/* ===== Máquina de estados de facturación (sec. 3.3 B) =====
 * Enviar a Cobro  -> MBILLED  (+HOLD si e-claim, +MGRHOLD si manual)
 * Release from Hold -> quita HOLD/MGRHOLD -> FACTURADO
 */

export function hasFlag(r: BillingRecord, f: BillingFlag) {
  return r.flags.includes(f);
}

export function canSubmit(r: BillingRecord) {
  return !hasFlag(r, "MBILLED") && !hasFlag(r, "FACTURADO");
}

export function canRelease(r: BillingRecord) {
  return hasFlag(r, "HOLD") || hasFlag(r, "MGRHOLD");
}

export function submitToBilling(r: BillingRecord, by: string): BillingRecord {
  if (!canSubmit(r)) return r;
  const flags = new Set(r.flags);
  flags.add("MBILLED");
  let holdReason: string;
  if (r.claimType === "electronic") {
    flags.add("HOLD");
    holdReason = "Retención automática: reclamo electrónico en cola de validación.";
  } else {
    flags.add("MGRHOLD");
    holdReason = "Retención manual: requiere revisión humana antes del envío.";
  }
  return {
    ...r,
    flags: [...flags],
    holdReason,
    history: [
      ...r.history,
      { at: new Date().toISOString(), action: "Enviado a cobro (MBILLED)", by },
      {
        at: new Date().toISOString(),
        action: r.claimType === "electronic" ? "Retención automática (HOLD)" : "Retención manual (MGRHOLD)",
        by: "sistema",
      },
    ],
  };
}

export function releaseFromHold(r: BillingRecord, by: string): BillingRecord {
  if (!canRelease(r)) return r;
  const flags = r.flags.filter((f) => f !== "HOLD" && f !== "MGRHOLD");
  flags.push("FACTURADO");
  return {
    ...r,
    flags,
    holdReason: undefined,
    history: [...r.history, { at: new Date().toISOString(), action: "Liberado y facturado (Release from Hold → FACTURADO)", by }],
  };
}

/* ===== Validación de emparejamientos (sec. 3.3 C) ===== */

/** CPT/CDT -> diagnósticos (DX) permitidos */
export const CPT_DX: Record<string, string[]> = {
  D0120: ["Z01.20", "K02.9"],
  D1110: ["Z01.20", "K05.10"],
  D2330: ["K02.9", "K02.61"],
  D2740: ["K08.531", "K02.9"],
  D3310: ["K04.0", "K04.7"],
  D4341: ["K05.30", "K05.10"],
  D7140: ["K08.3", "K04.7"],
  D8080: ["M26.4", "M26.30"],
};

/** POS permitidos por código (11 = consultorio, 02 = telemedicina) */
export const CPT_POS: Record<string, string[]> = {
  D0120: ["11", "02"],
  D1110: ["11"],
  D2330: ["11"],
  D2740: ["11"],
  D3310: ["11"],
  D4341: ["11"],
  D7140: ["11"],
  D8080: ["11"],
};

/** Modificadores permitidos (vacío = sin modificador permitido también) */
export const CPT_MOD: Record<string, string[]> = {
  D0120: ["", "25"],
  D1110: [""],
  D2330: ["", "59"],
  D2740: ["", "59"],
  D3310: ["", "59"],
  D4341: ["", "59"],
  D7140: ["", "51"],
  D8080: [""],
};

export interface ValidationIssue {
  field: "dx" | "pos" | "modifier";
  message: string;
}

export function validatePairings(r: Pick<BillingRecord, "cpt" | "dx" | "pos" | "modifier">): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dxOk = CPT_DX[r.cpt];
  const posOk = CPT_POS[r.cpt];
  const modOk = CPT_MOD[r.cpt];
  if (dxOk && !dxOk.includes(r.dx)) {
    issues.push({ field: "dx", message: `DX ${r.dx} no válido para ${r.cpt}. Permitidos: ${dxOk.join(", ")}` });
  }
  if (posOk && !posOk.includes(r.pos)) {
    issues.push({ field: "pos", message: `POS ${r.pos} no válido para ${r.cpt}. Permitidos: ${posOk.join(", ")}` });
  }
  if (modOk && !modOk.includes(r.modifier ?? "")) {
    issues.push({
      field: "modifier",
      message: `Modificador "${r.modifier || "—"}" no válido para ${r.cpt}. Permitidos: ${modOk.map((m) => m || "—").join(", ")}`,
    });
  }
  return issues;
}

export const FLAG_INFO: Record<BillingFlag, { label: string; desc: string; tone: "info" | "warn" | "hold" | "ok" | "err" }> = {
  ATHENA: { label: "ATHENA", desc: "Cuenta Athena asociada", tone: "info" },
  MBILLED: { label: "MBILLED", desc: "Enviado a la cola de facturación", tone: "info" },
  HOLD: { label: "HOLD", desc: "Retención automática (reclamo electrónico)", tone: "hold" },
  MGRHOLD: { label: "MGRHOLD", desc: "Retención manual — requiere revisión humana", tone: "warn" },
  FACTURADO: { label: "FACTURADO", desc: "Proceso completado", tone: "ok" },
  ACH: { label: "ACH", desc: "Pago automático activo", tone: "ok" },
};
