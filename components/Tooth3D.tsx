"use client";
/** Diente 3D de la landing — three.js.
 *
 *  MEJORA PROGRESIVA PURA, con las cicatrices de esta semana bien aprendidas:
 *  las animaciones de entrada nos dejaron secciones invisibles en producción.
 *  Por eso este componente jura tres cosas:
 *
 *  1. El contenido de la página NUNCA depende de él. Si WebGL no está, si el
 *     canvas falla, si el chunk no llega: devuelve null y la sección queda
 *     completa igual (el 3D es decoración, no información).
 *  2. Se importa con `next/dynamic` + `ssr:false` desde Landing — three.js
 *     (~150 kB gz) vive en un chunk aparte que no frena el primer render.
 *  3. Respeta `prefers-reduced-motion` (renderiza UN cuadro quieto) y pausa el
 *     loop cuando la pestaña no se ve (batería).
 *
 *  El diente es geometría propia (LatheGeometry con perfil de premolar), no un
 *  modelo descargado: cero assets, cero licencias, y el material cerámico con
 *  luz de contra azure lo ata a la marca. */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/** Arma la escena y arranca el loop. Devuelve el teardown, o `null` si no hay
 *  WebGL (driver viejo, headless) — en ese caso el caller marca `failed` y el
 *  componente desaparece sin dejar hueco. */
function init(mount: HTMLDivElement): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(0, 0.25, 7);

  /* Perfil de premolar (x = radio, y = altura), revolucionado. */
  const profile: [number, number][] = [
    [0.02, -2.2], [0.16, -1.65], [0.3, -0.95], [0.42, -0.35], [0.5, 0],
    [0.92, 0.45], [1.02, 1.05], [0.95, 1.55], [0.72, 1.85], [0.34, 1.98], [0.001, 2.0],
  ];
  const geo = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf7fafc,        // cerámica apenas fría, no blanco quemado
    roughness: 0.32,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
  });
  const tooth = new THREE.Mesh(geo, mat);
  tooth.rotation.z = 0.09; // apenas ladeado — clavado vertical se ve a CAD
  scene.add(tooth);

  scene.add(new THREE.AmbientLight(0xbfd9e4, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x14a6c0, 1.1); // contra azure de marca
  rim.position.set(-4, -1, -3);
  scene.add(rim);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();
  const tick = () => {
    const t = clock.getElapsedTime();
    tooth.rotation.y = t * 0.28;                 // vuelta completa cada ~22 s
    tooth.position.y = Math.sin(t * 0.7) * 0.07; // flote apenas perceptible
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  const onVis = () => (document.hidden ? stop() : start());
  const onResize = () => {
    if (mount.clientWidth === 0) return;
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    if (reduce) renderer.render(scene, camera);
  };

  if (reduce) {
    renderer.render(scene, camera); // un solo cuadro, quieto — sin loop
  } else {
    start();
    document.addEventListener("visibilitychange", onVis);
  }
  window.addEventListener("resize", onResize);

  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    geo.dispose();
    mat.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

export default function Tooth3D({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /* El contenedor puede medir 0×0 cuando corre este efecto: mobile
       (display:none), una ventana chica que después se maximiza, o un panel
       que carga la página antes de mostrarse — ASÍ se nos escapó a producción
       la primera vez: el guard salía y no reintentaba nunca. Ahora se intenta
       al aparecer tamaño: resize, el media query del breakpoint lg, y dos
       reintentos programados de respaldo. Inicializa UNA sola vez. */
    let teardown: (() => void) | null = null;
    let dead = false;
    const mql = window.matchMedia("(min-width: 1024px)");

    const tryInit = () => {
      if (dead || teardown) return;
      if (mount.clientWidth === 0 || mount.clientHeight === 0) return;
      const t = init(mount);
      if (t) {
        teardown = t;
        detachRetries();
      } else {
        dead = true;
        detachRetries();
        setFailed(true); // sin WebGL → null; la sección queda completa igual
      }
    };

    const timers = [window.setTimeout(tryInit, 1000), window.setTimeout(tryInit, 3500)];
    const detachRetries = () => {
      window.removeEventListener("resize", tryInit);
      mql.removeEventListener?.("change", tryInit);
      timers.forEach(clearTimeout);
    };

    tryInit();
    if (!teardown && !dead) {
      window.addEventListener("resize", tryInit);
      mql.addEventListener?.("change", tryInit);
    }

    return () => {
      dead = true;
      detachRetries();
      teardown?.();
    };
  }, []);

  if (failed) return null;
  return <div ref={mountRef} className={className} aria-hidden />;
}
