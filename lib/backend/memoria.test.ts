import { describeContratoDeDatos } from "./contrato-de-datos";
import { crearBackendEnMemoria } from "./memoria";

describeContratoDeDatos("memoria", async () => {
  const usuarioId = "u-sesion";
  const memoria = crearBackendEnMemoria(async () => usuarioId);
  return {
    backend: memoria,
    usuarioId,
    sembrar: async (ruta, data) => memoria.sembrar(ruta, data),
    vaciar: async () => memoria.vaciar(),
  };
});
