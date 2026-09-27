import { describe, it, expect } from "vitest";
import {
  MAX_TEXTO, textoParaEnviar, idMensaje, nuevoDirecto, destinatariosDifusion, armarDifusion,
  hilo, sinLeer, idsPorMarcarLeidos, conversaciones, difusiones,
} from "./chat";
import type { DirectMessage } from "./types";

const yo = { id: "u1", name: "Carlos Admin" };
const users = [
  { id: "u1", name: "Carlos Admin", active: true },
  { id: "u2", name: "Dra. Sofía Benítez", active: true },
  { id: "u3", name: "Paola Asistente", active: true },
  { id: "u4", name: "Laura Recepción", active: true },
  { id: "u9", name: "Ex Empleado", active: false },
];

/** Un directo de `de` a `a` a la hora `hh:mm` de hoy. */
const dm = (id: string, de: string, a: string, hhmm: string, extra: Partial<DirectMessage> = {}): DirectMessage => ({
  id, clinicId: "cl", fromId: de, fromName: de, toId: a, participants: [de, a], text: `texto ${id}`,
  createdAt: `2026-09-27T${hhmm}:00.000Z`, ...extra,
});

describe("textoParaEnviar", () => {
  it("recorta los espacios de los bordes", () => {
    expect(textoParaEnviar("  hola  ")).toBe("hola");
  });

  it("un mensaje vacío o en blanco no se manda", () => {
    expect(textoParaEnviar("")).toBeNull();
    expect(textoParaEnviar("   \n ")).toBeNull();
  });

  it("el tope es de 2000 caracteres, inclusive — el mismo que las reglas", () => {
    expect(MAX_TEXTO).toBe(2000);
    expect(textoParaEnviar("x".repeat(2000))).toHaveLength(2000);
    expect(textoParaEnviar("x".repeat(2001))).toBeNull();
  });
});

describe("idMensaje", () => {
  it("es opaco: prefijo + 32 caracteres hexadecimales al azar", () => {
    expect(idMensaje()).toMatch(/^dm_[0-9a-f]{32}$/);
    expect(idMensaje("dif")).toMatch(/^dif_[0-9a-f]{32}$/);
  });

  it("no se repite", () => {
    const ids = new Set(Array.from({ length: 200 }, () => idMensaje()));
    expect(ids.size).toBe(200);
  });
});

describe("nuevoDirecto", () => {
  it("arma un directo con participants = [remitente, destinatario]", () => {
    const m = nuevoDirecto({ clinicId: "cl", from: yo, toId: "u2", text: "hola", createdAt: "2026-09-27T10:00:00.000Z" });
    expect(m).toMatchObject({ clinicId: "cl", fromId: "u1", fromName: "Carlos Admin", toId: "u2", participants: ["u1", "u2"], text: "hola" });
    expect(m.id).toMatch(/^dm_/);
  });

  it("sin difusión no lleva la clave difusionId (Firestore no acepta undefined y la regla usa lista blanca)", () => {
    const m = nuevoDirecto({ clinicId: "cl", from: yo, toId: "u2", text: "hola", createdAt: "x" });
    expect("difusionId" in m).toBe(false);
    expect("readAt" in m).toBe(false);
  });
});

describe("difusión", () => {
  it("le llega a todos los usuarios activos menos a quien la manda", () => {
    expect(destinatariosDifusion(users, "u1").map((u) => u.id)).toEqual(["u2", "u3", "u4"]);
  });

  it("es una copia por destinatario, con el mismo difusionId y la misma hora", () => {
    const copias = armarDifusion({ clinicId: "cl", from: yo, destinatarios: destinatariosDifusion(users, "u1"), text: "Cerramos a las 16", createdAt: "2026-09-27T09:00:00.000Z" });
    expect(copias.map((c) => c.toId)).toEqual(["u2", "u3", "u4"]);
    expect(new Set(copias.map((c) => c.difusionId)).size).toBe(1);
    expect(copias[0].difusionId).toMatch(/^dif_[0-9a-f]{32}$/);
    expect(new Set(copias.map((c) => c.createdAt))).toEqual(new Set(["2026-09-27T09:00:00.000Z"]));
  });

  it("PRIVACIDAD: ninguna copia nombra a otro destinatario — ni en los campos ni en el id", () => {
    const copias = armarDifusion({ clinicId: "cl", from: yo, destinatarios: destinatariosDifusion(users, "u1"), text: "Aviso", createdAt: "x" });
    for (const c of copias) {
      expect(c.participants).toEqual(["u1", c.toId]);
      const otros = copias.filter((o) => o.toId !== c.toId).map((o) => o.toId);
      const serializada = JSON.stringify(c);
      for (const otro of otros) expect(serializada).not.toContain(`"${otro}"`);
      // El id es al azar: no se deriva del destinatario ni del orden (no se adivina la copia ajena).
      expect(c.id).toMatch(/^dm_[0-9a-f]{32}$/);
    }
    expect(new Set(copias.map((c) => c.id)).size).toBe(copias.length);
  });
});

describe("hilo, sinLeer e idsPorMarcarLeidos", () => {
  const directos = [
    dm("a", "u2", "u1", "10:05"),
    dm("b", "u1", "u2", "10:01"),
    dm("c", "u2", "u1", "10:09", { readAt: "2026-09-27T10:10:00.000Z" }),
    dm("d", "u3", "u2", "10:02"), // conversación ajena (la ve el admin o la demo)
    dm("e", "u3", "u1", "10:03"),
  ];

  it("el hilo es solo la conversación entre los dos, en orden cronológico", () => {
    expect(hilo(directos, "u1", "u2").map((m) => m.id)).toEqual(["b", "a", "c"]);
    expect(hilo(directos, "u2", "u1").map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("no leídos: lo que me mandaron y todavía no abrí", () => {
    expect(sinLeer(directos, "u1")).toBe(2); // a (de u2) + e (de u3)
    expect(sinLeer(directos, "u1", "u2")).toBe(1);
    expect(sinLeer(directos, "u2")).toBe(2); // b y d; lo que mandó u2 no cuenta
  });

  it("se marca leído solo lo recibido de esa persona que todavía no estaba leído", () => {
    expect(idsPorMarcarLeidos(directos, "u1", "u2")).toEqual(["a"]); // c ya estaba leído
    expect(idsPorMarcarLeidos(directos, "u1", "u3")).toEqual(["e"]);
    expect(idsPorMarcarLeidos(directos, "u2", "u1")).toEqual(["b"]); // lo que u2 le mandó a u1 no lo marca u2
  });
});

describe("conversaciones", () => {
  const directos = [
    dm("a", "u2", "u1", "10:05"),
    dm("b", "u1", "u4", "11:00"),
    dm("c", "u3", "u2", "12:00"), // ajena: no mueve la lista de u1
  ];

  it("una por cada usuario activo, sin mí y sin los dados de baja", () => {
    const ids = conversaciones(users, directos, "u1").map((c) => c.user.id);
    expect(ids.sort()).toEqual(["u2", "u3", "u4"]);
  });

  it("primero las que tienen mensajes, de la más reciente a la más vieja; después el resto por nombre", () => {
    expect(conversaciones(users, directos, "u1").map((c) => c.user.id)).toEqual(["u4", "u2", "u3"]);
  });

  it("trae el último mensaje y los no leídos de cada una", () => {
    const [laura, sofia, paola] = conversaciones(users, directos, "u1");
    expect(laura.ultimo?.id).toBe("b");
    expect(laura.sinLeer).toBe(0);
    expect(sofia.ultimo?.id).toBe("a");
    expect(sofia.sinLeer).toBe(1);
    expect(paola.ultimo).toBeUndefined(); // su mensaje con u2 no es de esta conversación
  });
});

describe("difusiones (vista del admin)", () => {
  const copias = [
    dm("x1", "u1", "u2", "09:00", { difusionId: "dif_1", readAt: "2026-09-27T09:30:00.000Z" }),
    dm("x2", "u1", "u3", "09:00", { difusionId: "dif_1" }),
    dm("y1", "u1", "u2", "15:00", { difusionId: "dif_2" }),
    dm("z", "u1", "u2", "16:00"), // directo común: no es difusión
  ];

  it("agrupa las copias por difusionId, la más nueva primero, con sus destinatarios y quién la leyó", () => {
    const lista = difusiones(copias);
    expect(lista.map((d) => d.difusionId)).toEqual(["dif_2", "dif_1"]);
    expect(lista[1].destinatarios).toEqual([
      { toId: "u2", readAt: "2026-09-27T09:30:00.000Z" },
      { toId: "u3", readAt: undefined },
    ]);
    expect(lista[1].text).toBe("texto x1");
  });
});
