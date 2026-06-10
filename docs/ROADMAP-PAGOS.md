# Roadmap — Pagos (Stripe) e Invoices

## Objetivo
1. Cobro de la suscripción Novudent con **Stripe** (planes Solo / Clínica / Cadena).
2. El cliente ve sus **facturas (invoices)** dentro de la plataforma.
3. Cada factura le **llega también por correo**.

## Arquitectura elegida (estándar Firebase + Stripe)
Usaremos la extensión oficial **"Run Payments with Stripe"** de Firebase:

- **Checkout**: botón "Suscribirme" → Stripe Checkout (tarjeta, sin PCI nuestro).
- **Webhooks → Firestore**: la extensión sincroniza `customers/`, `subscriptions/` e
  `invoices/` automáticamente en Firestore → la app los lee y muestra en una
  página **Configuración → Suscripción y facturas** (PDF de Stripe enlazado).
- **Customer Portal** de Stripe: el cliente gestiona tarjeta, cambia de plan y
  descarga todas sus facturas.
- **Email**: Stripe envía el invoice por correo nativamente
  (Dashboard → Settings → Billing → Customer emails → "Email finalised invoices").
  Refuerzo opcional: extensión **Trigger Email** (SMTP) para correos propios de
  bienvenida/recordatorio con la marca Novudent.

## Qué se necesita del dueño (cuando toque)
1. Cuenta Stripe activada (país/Atlas según facturación).
2. Claves: `pk_live…`, `sk_live…` (o `test` para sandbox) + firmar el webhook.
3. Crear los 3 productos/planes en Stripe (los precios definidos en la landing).
4. Plan **Blaze** en Firebase (requisito de extensiones; tiene capa gratuita).

## Pasos de implementación (cuando haya claves)
1. Instalar extensión `stripe/firestore-stripe-payments` en `novudent-664f3`.
2. Crear página `app/app/suscripcion` (lista invoices + estado del plan + botón Portal).
3. Gatear features por plan (campo `subscriptionTier` en `clinics/{id}`).
4. Reglas Firestore para colecciones de Stripe (solo lectura del propio customer).
5. Modo test end-to-end → switch a live.

## Estado actual
- [x] Usuarios creados por el administrador (Firebase Auth email/contraseña).
- [x] Login real + demo separada.
- [ ] Stripe Checkout (esperando claves).
- [ ] Página de facturas in-app.
- [ ] Email de invoices (Stripe nativo al activar).
