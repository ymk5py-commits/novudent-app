import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/site";

export const runtime = "edge";
export const alt = "Novudent — Software de gestión para clínicas dentales";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** OG image generada (la usa Twitter/WhatsApp/Facebook al compartir cualquier
 *  página que no defina otra). Identidad: navy profundo + punto menta. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#0A1240",
          backgroundImage:
            "radial-gradient(58% 46% at 12% 14%, rgba(47,227,174,0.18) 0%, transparent 62%), radial-gradient(52% 44% at 88% 8%, rgba(64,92,240,0.36) 0%, transparent 66%), radial-gradient(70% 58% at 78% 92%, rgba(96,60,200,0.30) 0%, transparent 64%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 44, letterSpacing: "0.14em", fontWeight: 300 }}>
            NOVU<span style={{ fontWeight: 500 }}>D</span>ENT
            <span style={{ color: "#2FE3AE" }}>.</span>
          </span>
          <span style={{ fontSize: 20, letterSpacing: "0.3em", color: "rgba(255,255,255,0.4)" }}>BY NOVUM</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 88, fontWeight: 200, lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: 950 }}>
            La clínica entera, en una sola pantalla.
          </div>
          <div style={{ marginTop: 28, fontSize: 30, fontWeight: 300, color: "rgba(255,255,255,0.65)" }}>
            Agenda · Odontograma FDI · Ficha clínica · Facturación
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "rgba(255,255,255,0.75)" }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: "#2FE3AE", display: "inline-flex" }} />
            Software odontológico · Paraguay
          </span>
          <span style={{ fontSize: 24, color: "rgba(255,255,255,0.45)" }}>
            {SITE_URL.replace("https://", "")}
          </span>
        </div>
      </div>
    ),
    size
  );
}
