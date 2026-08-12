"use client";
/** Inicialización de Firebase (config web pública — la seguridad real va en las
 *  reglas de Firestore). Analytics se carga solo si el navegador lo soporta. */
import { getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAGcYOo__Bj1V4a79ZkfI2vPE1JKLaFW2w",
  authDomain: "novudent-664f3.firebaseapp.com",
  projectId: "novudent-664f3",
  storageBucket: "novudent-664f3.firebasestorage.app",
  messagingSenderId: "702677091523",
  appId: "1:702677091523:web:be841572ab09b8ceeb8e76",
  measurementId: "G-DZWVBDNFEP",
};

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const fsdb = getFirestore(app);

/** Crea una cuenta en Firebase Auth SIN tocar la sesión actual del admin
 *  (usa una app secundaria temporal). Devuelve el uid. */
export async function createAuthUser(email: string, password: string): Promise<string> {
  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getAuth, createUserWithEmailAndPassword, signOut } = await import("firebase/auth");
  const temp = initializeApp((app.options as object) as Record<string, string>, `creator-${Date.now()}`);
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(temp), email, password);
    await signOut(getAuth(temp)).catch(() => {});
    return cred.user.uid;
  } finally {
    await deleteApp(temp).catch(() => {});
  }
}

/** Inicia sesión real con email/contraseña. Devuelve el uid. */
export async function signInEmail(email: string, password: string): Promise<string> {
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
  return cred.user.uid;
}

/** ID token del usuario actual (para autorizar las rutas /api/ia/*). null si no hay sesión. */
export async function currentIdToken(): Promise<string | null> {
  try {
    const { getAuth } = await import("firebase/auth");
    const u = getAuth(app).currentUser;
    return u ? await u.getIdToken() : null;
  } catch {
    return null;
  }
}

/** Manda el correo de "olvidé mi contraseña" de Firebase Auth.
 *
 *  Sin esto, cada olvido de contraseña era un llamado a Carlos para que
 *  recreara la cuenta a mano — no escala pasadas un puñado de clínicas.
 *
 *  Firebase hace el trabajo pesado: genera el link firmado, arma el correo y lo
 *  manda desde su propia infraestructura — nada de esto toca nuestro backend, y
 *  por eso no hace falta el usuario de servicio ni una ruta nueva en /api.
 *
 *  A propósito NO distingue "email inexistente" de "correo enviado": Firebase sí
 *  puede tirar `auth/user-not-found`, pero devolverlo tal cual permite a
 *  cualquiera enumerar qué emails están registrados probando uno por uno. El
 *  caller trata ambos casos igual — ver app/login/page.tsx. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { getAuth, sendPasswordResetEmail } = await import("firebase/auth");
  await sendPasswordResetEmail(getAuth(app), email, {
    // Sin esto Firebase manda al dominio por defecto de Auth
    // (novudent-664f3.firebaseapp.com), que no es el que el usuario conoce.
    url: `${window.location.origin}/login`,
  });
}

/** Cambia la contraseña del usuario actualmente autenticado (cambio inicial obligatorio). */
export async function updateCurrentPassword(newPassword: string): Promise<void> {
  const { getAuth, updatePassword } = await import("firebase/auth");
  const u = getAuth(app).currentUser;
  if (!u) throw new Error("No hay sesión activa. Volvé a iniciar sesión.");
  await updatePassword(u, newPassword); // puede pedir reautenticación si la sesión es vieja
}

// Analytics opcional (no bloquea si el entorno no lo soporta)
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => ok && getAnalytics(app)))
    .catch(() => {});
}
