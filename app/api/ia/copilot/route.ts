import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/server/rate-limit";

/**
 * Clinical Copilot — Novudent IA (spec 10.1).
 * POST { image, mimeType, procedures:[{cpt,description,price}] }
 *   → { ok, summary, findings:[{tooth,condition,severity,confidence,note}], plan:[{tooth,cpt,description,price,priority}] }
 * Del RX propone diagnóstico, entradas de odontograma y un plan con precios del
 * arancel. APOYO: el profesional revisa, edita y aprueba antes de guardar.
 * Env: GEMINI_API_KEY, GEMINI_VISION_MODEL (default gemini-2.5-pro).
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CONDITIONS = ["caries", "restaurado", "corona", "endodoncia", "extraccion", "ausente", "implante"];

function parseJsonLoose(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* extraer bloque */ }
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* nada */ } }
  return undefined;
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await verifyIdToken(req); }
  catch (e) { return NextResponse.json({ ok: false, error: "No autorizado" }, { status: e instanceof AuthError ? e.status : 401 }); }

  const rl = rateLimit(`ia:${user.uid}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  // Tope adicional por IP: el límite por-uid se evade creando múltiples sesiones
  // anónimas (demo). Por-IP frena la rotación que multiplicaría la cuota de Gemini.
  const _rlIp = rateLimit(`ia-ip:${clientIp(req)}`, { limit: 40, windowMs: 60_000 });
  if (!_rlIp.ok) return tooManyRequests(_rlIp.retryAfterSec);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });

  let body: { image?: string; mimeType?: string; procedures?: { cpt: string; description: string; price: number }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }

  const image = body.image || "";
  if (!image) return NextResponse.json({ ok: false, error: "image requerida" }, { status: 400 });
  const b64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  if (b64.length * 0.75 > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: "Imagen demasiado grande (máx ~8MB)" }, { status: 413 });
  const mime = String(body.mimeType || "image/jpeg").split(";")[0].trim();
  const procedures = Array.isArray(body.procedures) ? body.procedures.slice(0, 120) : [];
  const arancel = procedures.map((p) => `${p.cpt}|${p.description}|${p.price}`).join("\n");

  const prompt = `Sos un asistente de diagnóstico para una clínica dental (apoyo al profesional, NO diagnóstico definitivo).
Te paso UNA radiografía dental. Analizá los hallazgos por pieza (notación FDI) y proponé un plan de tratamiento.

Arancel disponible (elegí SOLO de esta lista para el plan; formato cpt|descripción|precio):
${arancel || "(sin arancel — usá descripción genérica y price 0)"}

Respondé SOLO este JSON (sin markdown):
{"summary":"resumen técnico breve para el odontólogo",
 "findings":[{"tooth":"16","condition":"caries","severity":"moderado","confidence":0.8,"note":"caries oclusal"}],
 "plan":[{"tooth":"16","cpt":"D2330","description":"Resina compuesta","price":420000,"priority":1}]}

Reglas:
- "condition" debe ser UNO de: ${CONDITIONS.join(", ")}.
- "tooth": pieza FDI (ej "16","37"). "severity": observacion|leve|moderado|severo. "confidence": 0..1.
- "plan": cada ítem usa un cpt del arancel (con su price exacto) para tratar un hallazgo; "priority" 1=urgente.
- No inventes hallazgos. Si la imagen no es una radiografía dental legible: {"summary":"","findings":[],"plan":[]}.`;

  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Copilot] Gemini error:", (data as any)?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El Copilot de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const raw: string = (data as any)?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    if (!raw.trim()) return NextResponse.json({ ok: false, error: "El modelo no devolvió un análisis. Probá con otra radiografía." }, { status: 422 });
    const parsed = parseJsonLoose(raw) as { summary?: unknown; findings?: unknown; plan?: unknown } | undefined;
    if (!parsed) return NextResponse.json({ ok: false, error: "No se pudo interpretar el análisis. Intentá de nuevo." }, { status: 422 });

    const priceOf = (cpt: string) => procedures.find((p) => p.cpt === cpt)?.price;
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : [])
      .filter((f: any) => f && typeof f.tooth === "string" && CONDITIONS.includes(f.condition))
      .slice(0, 40)
      .map((f: any) => ({
        tooth: String(f.tooth).slice(0, 3),
        condition: String(f.condition),
        severity: ["observacion", "leve", "moderado", "severo"].includes(f.severity) ? f.severity : "moderado",
        confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.6,
        note: typeof f.note === "string" ? f.note.slice(0, 200) : "",
      }));
    const plan = (Array.isArray(parsed.plan) ? parsed.plan : [])
      .filter((p: any) => p && typeof p.cpt === "string")
      .slice(0, 40)
      .map((p: any) => {
        const ar = priceOf(String(p.cpt));
        return {
          tooth: typeof p.tooth === "string" ? p.tooth.slice(0, 3) : undefined,
          cpt: String(p.cpt),
          description: typeof p.description === "string" ? p.description.slice(0, 120) : procedures.find((x) => x.cpt === p.cpt)?.description || String(p.cpt),
          price: typeof ar === "number" ? ar : (typeof p.price === "number" ? p.price : 0),
          priority: typeof p.priority === "number" ? p.priority : 2,
        };
      });
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "";
    return NextResponse.json({ ok: true, summary, findings, plan, aiModel: model });
  } catch (e) {
    console.error("[Copilot] error:", e);
    return NextResponse.json({ ok: false, error: "El Copilot de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
