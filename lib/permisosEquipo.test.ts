import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALL_PERMISSIONS, PERMISOS_SOLO_ADMIN, ROLES, ROLES_CONFIGURABLES, normalizarPermisos, permisoDeFabrica,
  type Permission, type PermisosDeLaClinica,
} from "./rbac";
import {
  efectivosDe, ajustesDesdeEfectivos, permisosParaGuardar, cambiarPermiso, REQUIERE, GRUPOS_DE_PERMISOS,
  PERMISOS_EN_PALABRAS, PERMISOS_QUE_EXIGE_EL_SERVIDOR, QUE_BLOQUEA_EL_SISTEMA, TIPO_DE_PERMISO,
} from "./permisosEquipo";

const deFabrica = (rol: (typeof ROLES)[number]) => ALL_PERMISSIONS.filter((p) => permisoDeFabrica(rol, p));

describe("efectivosDe — lo que puede hacer un rol en esta clínica", () => {
  it("sin ajustes es la matriz de fábrica, en el orden de la matriz", () => {
    for (const r of ROLES) expect(efectivosDe(r)).toEqual(deFabrica(r));
  });

  it("aplica lo que la clínica dio y sacó", () => {
    const efectivos = efectivosDe("dentist", { dentist: { dar: ["money.view"], quitar: ["emr.write"] } });
    expect(efectivos).toContain("money.view");
    expect(efectivos).not.toContain("emr.write");
    expect(efectivos).toContain("emr.read");
  });

  it("el administrador siempre tiene todo", () => {
    expect(efectivosDe("admin")).toEqual(ALL_PERMISSIONS);
  });
});

describe("ajustesDesdeEfectivos — la diferencia contra la fábrica, lo único que se guarda", () => {
  it("un rol tal como viene de fábrica no guarda diferencias", () => {
    for (const r of ROLES_CONFIGURABLES) expect(ajustesDesdeEfectivos(r, deFabrica(r))).toEqual({ dar: [], quitar: [] });
  });

  it("guarda como «dar» lo que la fábrica no daba y como «quitar» lo que daba, nada más", () => {
    const efectivos = new Set(deFabrica("dentist"));
    efectivos.add("money.view");
    efectivos.add("payments.manage");
    efectivos.delete("plans.create");
    expect(ajustesDesdeEfectivos("dentist", efectivos)).toEqual({
      dar: ["money.view", "payments.manage"],
      quitar: ["plans.create"],
    });
  });

  it("ida y vuelta: lo guardado da otra vez los mismos permisos", () => {
    const permisos: PermisosDeLaClinica = {
      cashier: { dar: ["billing.reports", "expenses.manage"], quitar: ["agenda.all"] },
      receptionist: { dar: ["money.view", "payments.manage"], quitar: [] },
      dentist: { dar: [], quitar: ["emr.write", "plans.create"] },
      assistant: { dar: ["emr.write"], quitar: ["tasks.use"] },
    };
    for (const r of ROLES_CONFIGURABLES) {
      expect(ajustesDesdeEfectivos(r, efectivosDe(r, permisos))).toEqual(normalizarPermisos(permisos)?.[r]);
    }
  });

  it("no guarda como «dar» lo que es solo del administrador", () => {
    const efectivos = [...deFabrica("assistant"), "users.manage", "practice.config"] as Permission[];
    expect(ajustesDesdeEfectivos("assistant", efectivos).dar).toEqual([]);
  });
});

describe("permisosParaGuardar — lo que va a config.permisos", () => {
  it("escribe siempre los cuatro roles con las dos listas, aunque estén vacías (setDoc merge no borra lo ausente)", () => {
    const guardado = permisosParaGuardar({
      cashier: deFabrica("cashier"), receptionist: deFabrica("receptionist"),
      dentist: deFabrica("dentist"), assistant: deFabrica("assistant"),
    });
    expect(Object.keys(guardado)).toEqual(["cashier", "receptionist", "dentist", "assistant"]);
    for (const r of ROLES_CONFIGURABLES) expect(guardado[r]).toEqual({ dar: [], quitar: [] });
  });

  it("lleva las diferencias de cada rol y deja vacíos los que no cambiaron", () => {
    const guardado = permisosParaGuardar({
      cashier: deFabrica("cashier"), receptionist: [...deFabrica("receptionist"), "money.view"],
      dentist: deFabrica("dentist"), assistant: deFabrica("assistant"),
    });
    expect(guardado.receptionist).toEqual({ dar: ["money.view"], quitar: [] });
    expect(guardado.cashier).toEqual({ dar: [], quitar: [] });
  });
});

describe("cambiarPermiso — dar o sacar uno arrastra lo que depende de él", () => {
  const set = (rol: (typeof ROLES)[number]) => new Set(deFabrica(rol));

  it("activar emr.write activa emr.read y lo informa", () => {
    const r = cambiarPermiso(set("assistant"), "emr.write", true);
    // el asistente ya lee la ficha: solo gana escribir
    expect(r.efectivos.has("emr.write")).toBe(true);
    expect(r.tambien.activados).toEqual([]);

    const sinLeer = new Set(deFabrica("receptionist"));
    const r2 = cambiarPermiso(sinLeer, "emr.write", true);
    expect(r2.efectivos.has("emr.read")).toBe(true);
    expect(r2.tambien.activados).toEqual(["emr.read"]);
  });

  it("sacar emr.read saca emr.write y lo informa", () => {
    const r = cambiarPermiso(set("dentist"), "emr.read", false);
    expect(r.efectivos.has("emr.read")).toBe(false);
    expect(r.efectivos.has("emr.write")).toBe(false);
    expect(r.tambien.sacados).toEqual(["emr.write"]);
  });

  it("sacar money.view saca todo lo que maneja plata", () => {
    const r = cambiarPermiso(set("cashier"), "money.view", false);
    for (const p of ["budgets.manage", "payments.manage", "billing.submit"] as const) expect(r.efectivos.has(p)).toBe(false);
    expect(r.tambien.sacados).toEqual(["billing.submit", "budgets.manage", "payments.manage"]);
  });

  it("dar payments.manage a la recepcionista le da también el ver montos", () => {
    const r = cambiarPermiso(set("receptionist"), "payments.manage", true);
    expect(r.efectivos.has("money.view")).toBe(true);
    expect(r.tambien.activados).toEqual(["money.view"]);
  });

  it("sacar agenda.view saca dar y cambiar citas y la agenda de todos", () => {
    const r = cambiarPermiso(set("receptionist"), "agenda.view", false);
    for (const p of ["agenda.create", "agenda.edit", "agenda.all"] as const) expect(r.efectivos.has(p)).toBe(false);
    expect(r.tambien.sacados).toEqual(["agenda.create", "agenda.edit", "agenda.all"]);
  });

  it("lo que ya estaba como se pide no informa nada", () => {
    expect(cambiarPermiso(set("dentist"), "emr.write", true).tambien).toEqual({ activados: [], sacados: [] });
    expect(cambiarPermiso(set("dentist"), "money.view", false).tambien).toEqual({ activados: [], sacados: [] });
  });

  it("no modifica el conjunto que recibe", () => {
    const original = set("dentist");
    const copia = [...original];
    cambiarPermiso(original, "emr.read", false);
    expect([...original]).toEqual(copia);
  });

  it("los permisos que son solo del administrador no se pueden mover", () => {
    for (const p of PERMISOS_SOLO_ADMIN) {
      const r = cambiarPermiso(set("cashier"), p, true);
      expect(r.efectivos.has(p)).toBe(false);
      expect(r.tambien).toEqual({ activados: [], sacados: [] });
    }
  });

  it("nunca deja un permiso sin lo que necesita, se parta de donde se parta", () => {
    for (const rol of ROLES_CONFIGURABLES) for (const p of ALL_PERMISSIONS) for (const valor of [true, false]) {
      const { efectivos } = cambiarPermiso(set(rol), p, valor);
      for (const q of efectivos) for (const necesita of REQUIERE[q] ?? []) expect(efectivos.has(necesita)).toBe(true);
    }
  });

  it("la matriz de fábrica ya cumple las dependencias (si no, ningún rol saldría «de fábrica»)", () => {
    for (const rol of ROLES) {
      const efectivos = new Set(deFabrica(rol));
      for (const q of efectivos) for (const necesita of REQUIERE[q] ?? []) expect(efectivos.has(necesita)).toBe(true);
    }
  });
});

describe("grupos y textos de la pantalla", () => {
  it("cada permiso aparece en un solo grupo, sin faltar ninguno", () => {
    const todos = GRUPOS_DE_PERMISOS.flatMap((g) => g.permisos);
    expect(new Set(todos).size).toBe(todos.length);
    expect([...todos].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("el último grupo es el de los permisos solo del administrador", () => {
    const ultimo = GRUPOS_DE_PERMISOS[GRUPOS_DE_PERMISOS.length - 1];
    expect(ultimo.id).toBe("solo-administrador");
    expect(ultimo.permisos).toEqual(PERMISOS_SOLO_ADMIN);
  });

  it("cada permiso tiene su explicación en palabras de todos los días", () => {
    for (const p of ALL_PERMISSIONS) expect(PERMISOS_EN_PALABRAS[p].length).toBeGreaterThan(8);
  });

  it("cada permiso es de «ver» (qué información aparece) o de «hacer» (qué acciones ejecuta)", () => {
    for (const p of ALL_PERMISSIONS) expect(["ver", "hacer"]).toContain(TIPO_DE_PERMISO[p]);
    for (const p of ["agenda.view", "emr.read", "plans.view", "money.view", "billing.reports", "patients.personal"] as const) expect(TIPO_DE_PERMISO[p]).toBe("ver");
    for (const p of ["agenda.create", "emr.write", "payments.manage", "expenses.manage", "engagement.forms", "inventory.manage"] as const) expect(TIPO_DE_PERMISO[p]).toBe("hacer");
  });

  it("cada permiso que exige el servidor dice qué es lo que bloquea el sistema", () => {
    expect(Object.keys(QUE_BLOQUEA_EL_SISTEMA).sort()).toEqual([...PERMISOS_QUE_EXIGE_EL_SERVIDOR].sort());
    for (const p of PERMISOS_QUE_EXIGE_EL_SERVIDOR) expect(QUE_BLOQUEA_EL_SISTEMA[p]!.length).toBeGreaterThan(5);
  });

  it("los permisos que exige el servidor son reales y ninguno es de los bloqueados", () => {
    for (const p of PERMISOS_QUE_EXIGE_EL_SERVIDOR) {
      expect(ALL_PERMISSIONS).toContain(p);
      expect(PERMISOS_SOLO_ADMIN).not.toContain(p);
    }
  });
});

describe("firestore.rules y la matriz de fábrica dicen lo mismo", () => {
  // Cada `tienePermiso(cid, 'permiso', ['rol', …])` de las reglas lleva escritos los roles de fábrica de ese permiso: si alguien
  // cambia la matriz de lib/rbac.ts y no las reglas (o al revés), el cliente muestra un botón que el servidor rechaza.
  const reglas = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const usos = [...reglas.matchAll(/tienePermiso\(cid, '([a-z]+\.[a-z]+)', \[([^\]]*)\]\)/g)].map((m) => ({
    permiso: m[1] as Permission,
    roles: m[2].split(",").map((r) => r.trim().replace(/'/g, "")).filter(Boolean),
  }));

  it("las reglas exigen exactamente los permisos que la pantalla marca como «lo exige el servidor»", () => {
    expect(usos.map((u) => u.permiso).sort()).toEqual([...PERMISOS_QUE_EXIGE_EL_SERVIDOR].sort());
  });

  it("la lista de roles de fábrica de cada uso es la de la matriz, en el mismo orden", () => {
    for (const { permiso, roles } of usos) expect(roles).toEqual(ROLES.filter((r) => permisoDeFabrica(r, permiso)));
  });
});
