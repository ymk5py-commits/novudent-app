/**
 * Las 143 pruebas de test/firestore-rules.test.mjs transcriptas caso por caso a Postgres real (spec del 9-oct §6.3).
 * Criterio de aceptación: cada caso da el mismo permitido/denegado que en Firestore. Deja test/rls/CASOS.md con la tabla caso → resultado.
 *
 * Es UN solo archivo de pruebas (las partes se importan en orden) porque, como el original, los casos comparten el estado de la base:
 * lo que un caso escribe lo ven los siguientes. No cambiar el orden.
 */
import "./semilla.mjs";
import "./reglas-1.mjs";
import "./reglas-2.mjs";
import "./reglas-3.mjs";
import "./reglas-4.mjs";
import "./reglas-5.mjs";
