import type { MetadataRoute } from "next";

/** Manifest de la app: con esto «Agregar a la pantalla de inicio» usa el ícono
 *  de la marca (el diente sobre navy) y abre el panel directo. Los PNG salen de
 *  `npm run marca`. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Novudent",
    short_name: "Novudent",
    description: "Software de gestión para clínicas dentales.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#051735",
    lang: "es",
    icons: [
      { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
