import { describe, it, expect, afterEach } from "vitest";
import {
  can, ROLES, ROLE_LABEL, ROLE_DESCRIPCION, ROLES_CONFIGURABLES, PERMISOS_SOLO_ADMIN, ALL_PERMISSIONS,
  permisoDeFabrica, permisoEfectivo, normalizarPermisos, mismosPermisos, aplicarPermisosDeLaClinica,
  aplicarRolesDeLaClinica, normalizarRolesPropios, normalizarNombresDeRoles, rolLabel, rolDescripcion,
  esRolDeFabrica, esRolPropio, rolesParaElegir, mismaConfiguracionDeRoles,
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

  it("los seis roles tienen nombre y descripción", () => {
    expect(ROLES).toEqual(["admin", "cashier", "receptionist", "commercial", "dentist", "assistant"]);
    expect(ROLE_LABEL.admin).toBe("Administrador");
    expect(ROLE_LABEL.cashier).toBe("Recepción y caja");
    expect(ROLE_LABEL.receptionist).toBe("Recepcionista");
    expect(ROLE_LABEL.commercial).toBe("Comercial");
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

  it("solo la recepción, la caja, el comercial y el admin dan o cambian citas: lo clínico ve la agenda en lectura", () => {
    for (const r of ROLES) {
      const recepcion = r === "admin" || r === "cashier" || r === "receptionist" || r === "commercial";
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

  it("se configuran los roles de fábrica que no son el administrador, en el orden de ROLES", () => {
    expect(ROLES_CONFIGURABLES).toEqual(ROLES.filter((r) => r !== "admin"));
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

  it("descarta al administrador y las claves que no pueden ser el id de un rol", () => {
    const limpio = normalizarPermisos({
      admin: { quitar: ["money.view"] }, "con espacios": { dar: ["money.view"] }, "": { dar: ["money.view"] },
      dentist: { dar: ["money.view"] },
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

/* ===== Comercial: un rol de fábrica más (pedido de Camila, 8-oct-2026) ===== */

describe("Comercial: vende y hace el seguimiento, sin cobrar ni entrar a la ficha clínica", () => {
  it("ve la agenda de todos, carga y edita los datos del paciente, presenta presupuestos con sus montos y trabaja el CRM", () => {
    for (const p of ["agenda.view", "agenda.create", "agenda.edit", "agenda.all", "patients.personal", "plans.view", "money.view", "budgets.manage", "engagement.forms", "tasks.use"] as const) {
      expect(can("commercial", p), p).toBe(true);
    }
  });

  it("no cobra, no maneja la facturación, no lee ni escribe la ficha, no ve los números del negocio y no configura nada", () => {
    for (const p of ["payments.manage", "billing.submit", "billing.finalize", "billing.reports", "emr.read", "emr.write", "plans.create", "expenses.manage", "inventory.manage", "labs.manage", "users.manage", "practice.config"] as const) {
      expect(can("commercial", p), p).toBe(false);
    }
  });

  it("es un rol más de los que se configuran", () => {
    expect(ROLES_CONFIGURABLES).toEqual(["cashier", "receptionist", "commercial", "dentist", "assistant"]);
  });
});

/* ===== Roles propios y nombres de la clínica =====
 * Una clínica puede crear roles con el nombre que quiera (`config.rolesPropios`) y ponerle otro nombre a los de fábrica
 * (`config.nombresDeRoles`). Un rol propio no hereda nada: lo que puede hacer es exactamente su lista `dar`. */

describe("un rol propio puede lo que la clínica le dio, y nada más", () => {
  const permisos: PermisosDeLaClinica = { rp_ab12cd34: { dar: ["agenda.view", "money.view", "budgets.manage"], quitar: [] } };

  it("tiene lo de su lista", () => {
    for (const p of ["agenda.view", "money.view", "budgets.manage"] as const) expect(permisoEfectivo("rp_ab12cd34", p, permisos)).toBe(true);
  });

  it("no hereda lo que tienen todos los roles de fábrica (ni siquiera las tareas)", () => {
    expect(permisoEfectivo("rp_ab12cd34", "tasks.use", permisos)).toBe(false);
    expect(permisoEfectivo("rp_ab12cd34", "patients.personal", permisos)).toBe(false);
  });

  it("sin ajustes, un rol que no existe no puede nada", () => {
    for (const p of ALL) expect(permisoEfectivo("rp_ab12cd34", p, undefined)).toBe(false);
  });

  it("crear usuarios y configurar la clínica no se dan a un rol propio, aunque estén escritos", () => {
    const forzado: PermisosDeLaClinica = { rp_ab12cd34: { dar: ["users.manage", "practice.config", "money.view"] } };
    expect(permisoEfectivo("rp_ab12cd34", "users.manage", forzado)).toBe(false);
    expect(permisoEfectivo("rp_ab12cd34", "practice.config", forzado)).toBe(false);
    expect(permisoEfectivo("rp_ab12cd34", "money.view", forzado)).toBe(true);
  });

  it("el id de un rol no se confunde con una propiedad de los objetos de JavaScript", () => {
    const sucio = { dentist: { dar: ["money.view"] } } as PermisosDeLaClinica;
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      for (const p of ALL) expect(permisoEfectivo(id, p, sucio), `${id} ${p}`).toBe(false);
    }
  });
});

describe("normalizarPermisos con roles propios", () => {
  it("deja pasar el id de un rol propio y lo ordena detrás de los de fábrica", () => {
    const limpio = normalizarPermisos({ rp_zzz: { dar: ["money.view"] }, rp_aaa: { dar: ["agenda.view"] }, dentist: { quitar: ["emr.write"] } });
    expect(Object.keys(limpio ?? {})).toEqual(["dentist", "rp_aaa", "rp_zzz"]);
    expect(limpio?.rp_aaa).toEqual({ dar: ["agenda.view"], quitar: [] });
  });

  it("descarta los ids que no sirven: prototipo, con símbolos, vacío o larguísimo", () => {
    const entrada = JSON.parse(`{
      "__proto__": { "dar": ["money.view"] }, "constructor": { "dar": ["money.view"] }, "prototype": { "dar": ["money.view"] },
      "con espacio": { "dar": ["money.view"] }, "ñandú": { "dar": ["money.view"] }, "${"x".repeat(41)}": { "dar": ["money.view"] },
      "rp_ok": { "dar": ["money.view"] }
    }`);
    expect(Object.keys(normalizarPermisos(entrada) ?? {})).toEqual(["rp_ok"]);
  });

  it("sigue sin dejar pasar al administrador", () => {
    expect(normalizarPermisos({ admin: { quitar: ["money.view"] } })).toBeUndefined();
  });
});

describe("normalizarRolesPropios — lo que viene de Firestore", () => {
  it("lo que no es una lista es «sin roles propios»", () => {
    for (const basura of [undefined, null, "x", 3, {}, true]) expect(normalizarRolesPropios(basura)).toEqual([]);
  });

  it("se queda con los que tienen id y nombre válidos, y quita espacios de más", () => {
    expect(normalizarRolesPropios([{ id: "rp_1", nombre: "  Coordinadora de tratamientos  " }, { id: "rp_2", nombre: "Marketing" }]))
      .toEqual([{ id: "rp_1", nombre: "Coordinadora de tratamientos" }, { id: "rp_2", nombre: "Marketing" }]);
  });

  it("descarta ids repetidos, ids que chocan con los de fábrica o con el prototipo, y nombres vacíos o muy largos", () => {
    const limpio = normalizarRolesPropios([
      { id: "rp_1", nombre: "Uno" }, { id: "rp_1", nombre: "Otra vez" },
      { id: "admin", nombre: "Falso admin" }, { id: "dentist", nombre: "Falso dentista" }, { id: "__proto__", nombre: "Raro" },
      { id: "rp_3", nombre: "   " }, { id: "rp_4", nombre: "x".repeat(41) }, { id: "con espacio", nombre: "Mal id" },
      { id: 5, nombre: "Id numérico" }, { id: "rp_5" }, "texto", null,
    ]);
    expect(limpio).toEqual([{ id: "rp_1", nombre: "Uno" }]);
  });
});

describe("normalizarNombresDeRoles — los nombres que la clínica le puso a los de fábrica", () => {
  it("lo que no es un mapa es «sin cambios»", () => {
    for (const basura of [undefined, null, "x", 3, [], true]) expect(normalizarNombresDeRoles(basura)).toEqual({});
  });

  it("acepta los roles de fábrica, incluido el administrador, y recorta los espacios", () => {
    expect(normalizarNombresDeRoles({ dentist: "  Odontólogo ", admin: "Dueño" })).toEqual({ dentist: "Odontólogo", admin: "Dueño" });
  });

  it("descarta roles que no son de fábrica, nombres vacíos, muy largos o que no son texto", () => {
    expect(normalizarNombresDeRoles({ rp_1: "Propio", dentist: "  ", assistant: "x".repeat(41), cashier: 3, receptionist: null, commercial: "Asesor" })).toEqual({ commercial: "Asesor" });
  });
});

describe("rolLabel y rolDescripcion — cómo se llama cada rol en ESTA clínica", () => {
  afterEach(() => aplicarRolesDeLaClinica(undefined));

  it("sin nada guardado, el nombre y la descripción de fábrica", () => {
    expect(rolLabel("dentist")).toBe("Dentista");
    expect(rolLabel("commercial")).toBe("Comercial");
    expect(rolDescripcion("dentist")).toBe(ROLE_DESCRIPCION.dentist);
  });

  it("un rol de fábrica con otro nombre se muestra con el nombre nuevo (y su descripción no cambia)", () => {
    aplicarRolesDeLaClinica({ nombresDeRoles: { dentist: "Odontólogo", commercial: "Asesor comercial" } });
    expect(rolLabel("dentist")).toBe("Odontólogo");
    expect(rolLabel("commercial")).toBe("Asesor comercial");
    expect(rolLabel("assistant")).toBe("Asistente de doctores");
    expect(rolDescripcion("dentist")).toBe(ROLE_DESCRIPCION.dentist);
  });

  it("un rol propio se muestra con su nombre y una descripción que dice dónde se elige lo que puede hacer", () => {
    aplicarRolesDeLaClinica({ rolesPropios: [{ id: "rp_ab12", nombre: "Coordinadora de tratamientos" }] });
    expect(rolLabel("rp_ab12")).toBe("Coordinadora de tratamientos");
    expect(rolDescripcion("rp_ab12")).toMatch(/Permisos del equipo/);
  });

  it("un rol que ya no existe no rompe nada", () => {
    expect(rolLabel("rp_borrado")).toBe("Rol sin nombre");
    expect(rolDescripcion("rp_borrado")).toBe("");
  });

  it("aplicar basura vuelve a lo de fábrica y no tira", () => {
    aplicarRolesDeLaClinica({ nombresDeRoles: { dentist: "Odontólogo" }, rolesPropios: [{ id: "rp_1", nombre: "Uno" }] });
    for (const basura of ["x", 3, null, [], { rolesPropios: "x", nombresDeRoles: 5, permisos: 7 }]) {
      aplicarRolesDeLaClinica(basura as never);
      expect(rolLabel("dentist")).toBe("Dentista");
      expect(rolLabel("rp_1")).toBe("Rol sin nombre");
    }
  });

  it("aplicar los roles de la clínica aplica también sus permisos (can() los ve)", () => {
    aplicarRolesDeLaClinica({ permisos: { rp_ab12: { dar: ["money.view"] } }, rolesPropios: [{ id: "rp_ab12", nombre: "Contador" }] });
    expect(can("rp_ab12", "money.view")).toBe(true);
    expect(can("rp_ab12", "payments.manage")).toBe(false);
    aplicarRolesDeLaClinica(undefined);
    expect(can("rp_ab12", "money.view")).toBe(false);
  });
});

describe("esRolDeFabrica, esRolPropio y rolesParaElegir", () => {
  afterEach(() => aplicarRolesDeLaClinica(undefined));

  it("distingue los roles de fábrica de los que creó la clínica", () => {
    aplicarRolesDeLaClinica({ rolesPropios: [{ id: "rp_ab12", nombre: "Contador" }] });
    expect(esRolDeFabrica("dentist")).toBe(true);
    expect(esRolDeFabrica("rp_ab12")).toBe(false);
    expect(esRolDeFabrica("constructor")).toBe(false);
    expect(esRolPropio("rp_ab12")).toBe(true);
    expect(esRolPropio("dentist")).toBe(false);
    expect(esRolPropio("rp_otro")).toBe(false);
  });

  it("para los selectores: los de fábrica en su orden y detrás los propios, con el nombre que tienen en esta clínica", () => {
    aplicarRolesDeLaClinica({ nombresDeRoles: { dentist: "Odontólogo" }, rolesPropios: [{ id: "rp_ab12", nombre: "Contador" }] });
    expect(rolesParaElegir()).toEqual([
      { id: "admin", nombre: "Administrador", deFabrica: true },
      { id: "cashier", nombre: "Recepción y caja", deFabrica: true },
      { id: "receptionist", nombre: "Recepcionista", deFabrica: true },
      { id: "commercial", nombre: "Comercial", deFabrica: true },
      { id: "dentist", nombre: "Odontólogo", deFabrica: true },
      { id: "assistant", nombre: "Asistente de doctores", deFabrica: true },
      { id: "rp_ab12", nombre: "Contador", deFabrica: false },
    ]);
  });
});

describe("mismaConfiguracionDeRoles — ¿cambió algo de los roles entre dos versiones de la configuración?", () => {
  it("lo mismo escrito distinto es lo mismo, y lo que no es de roles no cuenta", () => {
    expect(mismaConfiguracionDeRoles(
      { permisos: { dentist: { dar: ["money.view"] } }, rolesPropios: [{ id: "rp_1", nombre: " Uno " }], nombresDeRoles: { dentist: "Odontólogo" }, currency: "PYG" },
      { permisos: { dentist: { quitar: [], dar: ["money.view", "money.view"] } }, rolesPropios: [{ id: "rp_1", nombre: "Uno" }], nombresDeRoles: { dentist: " Odontólogo", cashier: "" }, currency: "USD" },
    )).toBe(true);
    expect(mismaConfiguracionDeRoles(undefined, {})).toBe(true);
    expect(mismaConfiguracionDeRoles(undefined, { permisos: { cashier: { dar: [] } } })).toBe(true);
  });

  it("detecta un permiso, un rol propio o un nombre distinto", () => {
    const base = { permisos: { dentist: { dar: ["money.view"] } }, rolesPropios: [{ id: "rp_1", nombre: "Uno" }], nombresDeRoles: { dentist: "Odontólogo" } };
    expect(mismaConfiguracionDeRoles(base, { ...base, permisos: { dentist: { dar: ["labs.manage"] } } })).toBe(false);
    expect(mismaConfiguracionDeRoles(base, { ...base, rolesPropios: [{ id: "rp_1", nombre: "Dos" }] })).toBe(false);
    expect(mismaConfiguracionDeRoles(base, { ...base, rolesPropios: [] })).toBe(false);
    expect(mismaConfiguracionDeRoles(base, { ...base, nombresDeRoles: {} })).toBe(false);
  });
});
