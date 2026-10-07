"use client";
/** «Pago online» (Configuración): el link de checkout de la pasarela de la clínica y sus datos de transferencia, que la
 *  página de pago del paciente (`/pagar/{cid}`) muestra. Se guarda con un botón y avisa: antes se guardaba al salir del campo,
 *  sin ningún aviso, y un link sin `https://` quedaba guardado pero la página de pago lo ignoraba. */
import { useState } from "react";
import { Check, ExternalLink, HandCoins, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { normalizarLinkDePago } from "@/lib/pagoOnline";
import { Btn, Card, Field, inputCls } from "@/components/ui";

export function PagoOnline() {
  const { db, updateClinicConfig } = useStore();
  const guardado = db.clinics[0]?.config.payments;
  // `null` = «no lo toqué, mostrá lo guardado». Así el campo sigue a la base si esta llega después de abrir la pantalla
  // (un valor inicial copiado una sola vez dejaba el campo vacío aunque el link estuviera guardado).
  const [borradorUrl, setBorradorUrl] = useState<string | null>(null);
  const [borradorInfo, setBorradorInfo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<"" | "guardado">("");
  const url = borradorUrl ?? guardado?.checkoutUrl ?? "";
  const info = borradorInfo ?? guardado?.bankInfo ?? "";

  const link = normalizarLinkDePago(url);
  const sinGuardar =
    (borradorUrl !== null && borradorUrl.trim() !== (guardado?.checkoutUrl ?? "")) ||
    (borradorInfo !== null && borradorInfo.trim() !== (guardado?.bankInfo ?? ""));

  const guardar = () => {
    if (!link.ok) return;
    // Vacío se guarda como «» y no como «sin valor»: la base mezcla campo por campo y un campo ausente no borra el anterior.
    updateClinicConfig({ payments: { checkoutUrl: link.url, bankInfo: info.trim() } });
    setBorradorUrl(null);
    setBorradorInfo(null);
    setAviso("guardado");
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2"><HandCoins aria-hidden className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Pago online</h2></div>
      <p className="mb-3 text-xs text-clinic-muted">
        Pegá el <b>link de checkout de tu propia pasarela</b> (MercadoPago, Bancard, Pagopar, Stripe… la que uses) y, si querés, tus datos de transferencia.
        Novudent arma una página de pago para enviarle al paciente por WhatsApp o correo. No guardamos credenciales secretas: solo el link público que pegás.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Link de checkout de tu pasarela" hint="Tiene que empezar con https://">
          <input
            className={inputCls}
            inputMode="url"
            value={url}
            onChange={(e) => { setBorradorUrl(e.target.value); setAviso(""); }}
            aria-invalid={!link.ok}
            aria-describedby="pago-online-error"
            placeholder="https://link.mercadopago.com.py/…"
          />
        </Field>
        <Field label="Datos de transferencia (opcional)" hint="Banco, cuenta y titular: se muestran en la página de pago.">
          <textarea
            className={`${inputCls} min-h-[4.5rem]`}
            value={info}
            onChange={(e) => { setBorradorInfo(e.target.value); setAviso(""); }}
            placeholder={"Banco Itaú · Cta. cte. 123456\nTitular: Clínica Sonrisa"}
          />
        </Field>
      </div>
      {!link.ok && <p id="pago-online-error" role="alert" className="mt-2 text-xs font-semibold text-state-err">{link.error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn onClick={guardar} disabled={!sinGuardar || !link.ok}><Save aria-hidden className="h-3.5 w-3.5" /> Guardar</Btn>
        {aviso === "guardado" && !sinGuardar && (
          <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-state-ok"><Check aria-hidden className="h-3.5 w-3.5" /> Guardado</span>
        )}
        {sinGuardar && <span role="status" className="text-xs font-semibold text-state-warn">Hay cambios sin guardar.</span>}
        {link.ok && link.url && !sinGuardar && (
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline">
            Probar el link <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        )}
      </div>
      {guardado?.checkoutUrl && !sinGuardar && (
        <p className="mt-2 text-[11px] text-clinic-muted">El paciente ve un botón «Pagar con tarjeta» que abre este link, en la página de pago que le mandás desde el cobro.</p>
      )}
    </Card>
  );
}
