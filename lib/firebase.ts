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

// Analytics opcional (no bloquea si el entorno no lo soporta)
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => ok && getAnalytics(app)))
    .catch(() => {});
}
