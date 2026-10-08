import { describe, it, expect, afterEach } from "vitest";
import {
  can, ROLES, ROLE_LABEL, ROLE_DESCRIPCION, ROLES_CONFIGURABLES, PERMISOS_SOLO_ADMIN, ALL_PERMISSIONS,
  permisoDeFabrica, permisoEfectivo, normalizarPermisos, mismosPermisos, aplicarPermisosDeLaClinica,
  type Permission, type PermisosDeLaClinica,
} from "./rbac";

const ALL: Permission[] = [
  "users.manage", "practice.config", "agenda.view", "agenda.create", "agenda.edit", "agenda.all",
  "patients.personal", "emr.read", "emr.write", "plans.view", "plans.create", "money.view", "billing.submit",
  "billing.finalize", "billing.reports", "engagement.forms", "tasks.use", "budgets.manage",
  "payments.manage", "expenses.manage", "inventory.manage", "labs.manage",
];
const PLATA: Permission[] = ["money.view", "payments.manage", "billing.submit", "billing.finalize", "budgets.manage"];

describe("can — matriz RBAC (roles v3)", () => {
  it("admin puede TODO", () => {
    for (const p of ALL) expect(can("admin", p)).toBe(true);
  });

  it("los cinco roles tienen nombre y descripción", () => {
    expect(ROLES).toEqual(["admin", "cashier", "receptionist", "dentist", "assistant"]);
    expect(ROLE_LABEL.admin).toBe("Administrador");
    expect(ROLE_LABEL.cashier).toBe("Recepción y caja");
    expect(ROLE_LABEL.receptionist).toBe("Recepcionista");
    expect(ROLE_LABEL.dentist).toBe("Dentista");
    expect(ROLE_LABEL.assistant).toBe("Asistente de doctores");
    for (const r of ROLES) expect(ROLE_DESCRIPCION[r].length).toBeGreaterThan(20);
  });

  it("todos ven la agenda y usan las tareas", () => {
    for (const r of ROLES) {
      expect(can(r, "agenda.view")).toBe(true);
      expect(can(r, "tasks.use")).toBe(true);
    }
  });

  it("solo la recepción, la caja y el admin dan o cambian citas: lo clínico ve la agenda en lectura", () => {
    for (const r of ROLES) {
      const recepcion = r === "admin" || r === "cashier" || r === "receptionist";
      expect(can(r, "agenda.create")).toBe(recepcion);
      expect(can(r, "agenda.edit")).toBe(recepcion);
    }
  });
});

describe("recepción: agenda de todos y datos del paciente, sin plata", () => {
  it("la recepcionista ve la agenda de todos y carga los datos personales", () => {
    expect(can("receptionist", "agenda.all")).toBe(true);
    expect(can("receptionist", "patients.personal")).toBe(true);
    expect(can("receptionist", "engagement.forms")).toBe(true);
  });

  it("la recepcionista no ve montos ni la ficha clínica, pero sí los tratamientos (sin montos)", () => {
    for (const p of PLATA) expect(can("receptionist", p)).toBe(false);
    expect(can("receptionist", "emr.read")).toBe(false);
    expect(can("receptionist", "plans.view")).toBe(true);
    expect(can("receptionist", "plans.create")).toBe(false);
  });

  it("«Recepción y caja» es la recepcionista más el cobro y el arqueo", () => {
    for (const p of ALL) if (can("receptionist", p)) expect(can("cashier", p)).toBe(true);
    expect(can("cashier", "money.view")).toBe(true);
    expect(can("cashier", "payments.manage")).toBe(true);
    expect(can("cashier", "billing.submit")).toBe(true);
    expect(can("cashier", "budgets.manage")).toBe(true);
  });
});

describe("lo clínico: dentista y asistente de doctores, sin plata ni datos personales", () => {
  it("el dentista escribe la ficha, ve sus planes y los arma", () => {
    expect(can("dentist", "plans.create")).toBe(true);
    expect(can("dentist", "emr.read")).toBe(true);
    expect(can("dentist", "emr.write")).toBe(true);
    expect(can("dentist", "plans.view")).toBe(true);
  });

  it("el asistente de doctores lee la ficha y los planes, sin escribir", () => {
    expect(can("assistant", "emr.read")).toBe(true);
    expect(can("assistant", "plans.view")).toBe(true);
    expect(can("assistant", "emr.write")).toBe(false);
    expect(can("assistant", "plans.create")).toBe(false);
  });

  it("ninguno de los dos ve montos, datos personales ni la agenda de todos", () => {
    for (const r of ["dentist", "assistant"] as const) {
      for (const p of PLATA) expect(can(r, p)).toBe(false);
      expect(can(r, "patients.personal")).toBe(false);
      expect(can(r, "agenda.all")).toBe(false);
      expect(can(r, "engagement.forms")).toBe(false);
      expect(can(r, "inventory.manage")).toBe(false);
      expect(can(r, "labs.manage")).toBe(false);
    }
  });
});

describe("números del negocio — solo el dueño", () => {
  it("reportes, gastos, inventario, laboratorios y configuración son del admin", () => {
    for (const p of ["billing.reports", "expenses.manage", "inventory.manage", "labs.manage", "users.manage", "practice.config"] as const) {
      for (const r of ROLES) expect(can(r, p)).toBe(r === "admin");
    }
  });
});

/* ===== Permisos que la clínica reparte o saca (Configuración › Permisos del equipo) =====
 * La matriz de arriba es la de fábrica. La clínica guarda solo la DIFERENCIA por rol
 * (`dar`: lo que gana; `quitar`: lo que pierde) y `can()` la aplica encima. */

describe("catálogo de permisos y roles que se pueden configurar", () => {
  it("ALL_PERMISSIONS lista exactamente las claves de la matriz", () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...ALL].sort());
  });

  it("se configuran los cuatro roles que no son el administrador, en el orden de ROLES", () => {
    expect(ROLES_CONFIGURABLES).toEqual(["cashier", "receptionist", "dentist", "assistant"]);
  });

  it("crear usuarios y configurar la clínica no se reparten: son solo del administrador", () => {
    expect(PERMISOS_SOLO_ADMIN).toEqual(["users.manage", "practice.config"]);
    for (const p of PERMISOS_SOLO_ADMIN) for (const r of ROLES) expect(permisoDeFabrica(r, p)).toBe(r === "admin");
  });

  it("permisoDeFabrica es la matriz sin ajustes de la clínica", () => {
    for (const r of ROLES) for (const p of ALL) expect(permisoDeFabrica(r, p)).toBe(can(r, p));
  });
});

describe("permisoEfectivo — la matriz de fábrica más lo que la clínica da o saca", () => {
  it("sin ajustes es la matriz de fábrica, para todos los roles y permisos", () => {
    for (const r of ROLES) for (const p of ALL) {
      expect(permisoEfectivo(r, p, undefined)).toBe(permisoDeFabrica(r, p));
      expect(permisoEfectivo(r, p, {})).toBe(permisoDeFabrica(r, p));
    }
  });

  it("dar: el rol gana ese permiso y solo ese, y no se contagia a otros roles", () => {
    const permisos: PermisosDeLaClinica = { dentist: { dar: ["money.view"] } };
    expect(permisoEfectivo("dentist", "money.view", permisos)).toBe(true);
    expect(permisoEfectivo("dentist", "payments.manage", permisos)).toBe(false);
    expect(permisoEfectivo("assistant", "money.view", permisos)).toBe(false);
    expect(permisoEfectivo("receptionist", "money.view", permisos)).toBe(false);
  });

  it("quitar: el rol pierde ese permiso y solo ese, y los otros roles lo conservan", () => {
    const permisos: PermisosDeLaClinica = { cashier: { quitar: ["payments.manage"] } };
    expect(permisoEfectivo("cashier", "payments.manage", permisos)).toBe(false);
    expect(permisoEfectivo("cashier", "money.view", permisos)).toBe(true);
    expect(permisoEfectivo("admin", "payments.manage", permisos)).toBe(true);
  });

  it("dar algo que ya tenía o quitar algo que no tenía no cambia nada", () => {
    const permisos: PermisosDeLaClinica = { dentist: { dar: ["emr.write"], quitar: ["money.view"] } };
    expect(permisoEfectivo("dentist", "emr.write", permisos)).toBe(true);
    expect(permisoEfectivo("dentist", "money.view", permisos)).toBe(false);
  });

  it("si un permiso figura en dar y en quitar, gana dar (igual que firestore.rules)", () => {
    const permisos: PermisosDeLaClinica = { receptionist: { dar: ["money.view"], quitar: ["money.view", "agenda.edit"] } };
    expect(permisoEfectivo("receptionist", "money.view", permisos)).toBe(true);
    expect(permisoEfectivo("receptionist", "agenda.edit", permisos)).toBe(false);
  });

  it("el administrador no se toca, ni siquiera con datos forzados a mano", () => {
    const forzado = { admin: { quitar: [...ALL] } } as unknown as PermisosDeLaClinica;
    for (const p of ALL) expect(permisoEfectivo("admin", p, forzado)).toBe(true);
  });

  it("users.manage y practice.config no se pueden dar a nadie, aunque estén escritos en la configuración", () => {
    const permisos: PermisosDeLaClinica = {
      cashier: { dar: ["users.manage", "practice.config"] },
      dentist: { dar: ["users.manage", "practice.config"] },
    };
    for (const r of ROLES_CONFIGURABLES) for (const p of PERMISOS_SOLO_ADMIN) {
      expect(permisoEfectivo(r, p, permisos)).toBe(false);
    }
    expect(permisoEfectivo("admin", "practice.config", permisos)).toBe(true);
  });

  it("tolera ajustes a medio llenar", () => {
    expect(permisoEfectivo("dentist", "emr.write", { dentist: {} })).toBe(true);
    expect(permisoEfectivo("dentist", "money.view", { dentist: { dar: undefined, quitar: undefined } })).toBe(false);
    expect(permisoEfectivo("hacker" as never, "emr.read", { dentist: { dar: ["money.view"] } })).toBe(false);
  });
});

describe("can() con los ajustes de la clínica aplicados", () => {
  afterEach(() => aplicarPermisosDeLaClinica(undefined));

  it("sin tercer argumento usa los ajustes aplicados, y aplicar undefined vuelve a la fábrica", () => {
    expect(can("receptionist", "payments.manage")).toBe(false);
    aplicarPermisosDeLaClinica({ receptionist: { dar: ["payments.manage", "money.view"] } });
    expect(can("receptionist", "payments.manage")).toBe(true);
    expect(can("receptionist", "money.view")).toBe(true);
    expect(can("dentist", "payments.manage")).toBe(false);
    aplicarPermisosDeLaClinica(undefined);
    expect(can("receptionist", "payments.manage")).toBe(false);
  });

  it("con tercer argumento manda ese (así lo usan las rutas del servidor) y no toca lo aplicado", () => {
    aplicarPermisosDeLaClinica({ dentist: { dar: ["money.view"] } });
    expect(can("dentist", "money.view", {})).toBe(false);
    expect(can("assistant", "money.view", { assistant: { dar: ["money.view"] } })).toBe(true);
    expect(can("dentist", "money.view")).toBe(true);
  });

  it("aplicar basura no rompe nada y deja la matriz de fábrica", () => {
    for (const basura of ["basura", 3, null, [], { dentist: { dar: "money.view" } }, { dentist: { dar: ["inventada"] } }]) {
      aplicarPermisosDeLaClinica(basura);
      for (const r of ROLES) for (const p of ALL) expect(can(r, p)).toBe(permisoDeFabrica(r, p));
    }
  });
});

describe("normalizarPermisos — lo que viene de Firestore se limpia antes de usarlo", () => {
  it("lo que no es un mapa de roles es «sin ajustes»", () => {
    for (const basura of [undefined, null, "x", 3, true, [], {}, { dentist: {} }, { dentist: { dar: [], quitar: [] } }]) {
      expect(normalizarPermisos(basura)).toBeUndefined();
    }
  });

  it("deja ambas listas siempre, aunque una venga vacía", () => {
    expect(normalizarPermisos({ dentist: { dar: ["money.view"] } })).toEqual({ dentist: { dar: ["money.view"], quitar: [] } });
    expect(normalizarPermisos({ cashier: { quitar: ["payments.manage"] } })).toEqual({ cashier: { dar: [], quitar: ["payments.manage"] } });
  });

  it("descarta al administrador y a los roles que no existen", () => {
    const limpio = normalizarPermisos({
      admin: { quitar: ["money.view"] }, jefe: { dar: ["money.view"] }, dentist: { dar: ["money.view"] },
    });
    expect(Object.keys(limpio ?? {})).toEqual(["dentist"]);
  });

  it("descarta permisos inventados y los que no se reparten", () => {
    const limpio = normalizarPermisos({ cashier: { dar: ["inventada", "users.manage", "practice.config", "inventory.manage"] } });
    expect(limpio).toEqual({ cashier: { dar: ["inventory.manage"], quitar: [] } });
  });

  it("descarta lo que no es texto y las listas que no son listas", () => {
    const limpio = normalizarPermisos({ dentist: { dar: [1, null, {}, "money.view"], quitar: "emr.write" } });
    expect(limpio).toEqual({ dentist: { dar: ["money.view"], quitar: [] } });
  });

  it("saca repetidos y deja los permisos en el orden de la matriz", () => {
    const limpio = normalizarPermisos({ assistant: { dar: ["labs.manage", "money.view", "money.view"] } });
    expect(limpio).toEqual({ assistant: { dar: ["money.view", "labs.manage"], quitar: [] } });
  });

  it("no modifica lo que recibe", () => {
    const entrada = Object.freeze({ dentist: Object.freeze({ dar: Object.freeze(["money.view"]), quitar: Object.freeze([]) }) });
    expect(() => normalizarPermisos(entrada)).not.toThrow();
  });
});

describe("mismosPermisos — ¿dicen lo mismo dos configuraciones?", () => {
  it("lo mismo escrito distinto (orden, repetidos, listas vacías, basura) es lo mismo", () => {
    expect(mismosPermisos(
      { dentist: { dar: ["labs.manage", "money.view"] } },
      { dentist: { quitar: [], dar: ["money.view", "labs.manage", "money.view", "inventada"] }, assistant: {} },
    )).toBe(true);
  });

  it("«sin ajustes» es lo mismo que todo vacío", () => {
    expect(mismosPermisos(undefined, { cashier: { dar: [], quitar: [] } })).toBe(true);
    expect(mismosPermisos(undefined, null)).toBe(true);
  });

  it("detecta cualquier diferencia real", () => {
    expect(mismosPermisos({ dentist: { dar: ["money.view"] } }, { dentist: { dar: ["labs.manage"] } })).toBe(false);
    expect(mismosPermisos({ dentist: { dar: ["money.view"] } }, { assistant: { dar: ["money.view"] } })).toBe(false);
    expect(mismosPermisos({ dentist: { dar: ["money.view"] } }, undefined)).toBe(false);
    expect(mismosPermisos({ cashier: { quitar: ["agenda.all"] } }, { cashier: { dar: ["agenda.all"] } })).toBe(false);
  });
});
