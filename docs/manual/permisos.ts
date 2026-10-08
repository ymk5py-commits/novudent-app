/** Los permisos de `lib/rbac.ts` en palabras de todos los días. Sirven para el apéndice «Qué puede hacer cada rol» y para la
 *  hoja «Tu rol» de cada capítulo, que se arman llamando a `can()`: si cambia la matriz, el manual cambia solo.
 *
 *  Los textos viven en `lib/permisosEquipo.ts` porque también los muestra Configuración › Permisos del equipo; `montar.test.ts`
 *  exige que esté TODA clave de `Permission`: sumar un permiso sin explicarlo rompe `npm test`. */
export { PERMISOS_EN_PALABRAS } from "../../lib/permisosEquipo";
