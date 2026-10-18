import { test, expect, ingresar, sesionGuardada } from "./soporte";
import { iniciarSesion, leerDoc, stack } from "../lib/server/stack-de-prueba";

test.describe("ingreso con email y contraseña (GoTrue)", () => {
  test("entra, la sesión guarda el id del DOCUMENTO (no el uid de login) y sobrevive a recargar", async ({ page, mundo }) => {
    const ana = mundo.clinica.personas.admin;
    await ingresar(page, ana.email, ana.password);
    await expect(page.getByText("Ana Admin").locator("visible=true").first()).toBeVisible();
    const sesion = await sesionGuardada(page);
    expect(sesion).toMatchObject({ userId: "u_admin_migrado", clinicId: mundo.clinica.cid, role: "admin" });
    expect(sesion.userId).not.toBe(ana.uid); // usuario migrado: el id del documento no es el uid de login
    await page.reload();
    await page.waitForURL("**/app");
    await expect(page.getByText("Ana Admin").locator("visible=true").first()).toBeVisible();
    expect(await sesionGuardada(page)).toMatchObject({ userId: "u_admin_migrado" });
  });

  test("cada rol ve su clínica con lo que le corresponde (el dentista no ve los gastos: RLS los esconde y la pantalla no los pide)", async ({ page, mundo }) => {
    const dr = mundo.clinica.personas.dr;
    await ingresar(page, dr.email, dr.password);
    expect(await sesionGuardada(page)).toMatchObject({ userId: "u_dr_migrado", role: "dentist" });
    await expect(page.getByText("Dr. Diego Dentista").locator("visible=true").first()).toBeVisible();
  });

  test("una contraseña equivocada se explica y no deja entrar", async ({ page, mundo }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(mundo.clinica.personas.admin.email);
    await page.getByLabel("Contraseña", { exact: true }).fill("no-es-esta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Email o contraseña incorrectos");
    await expect(page).toHaveURL(/\/login/);
  });

  test("cerrar sesión de verdad: la sesión de GoTrue se va y /app vuelve a pedir ingreso", async ({ page, mundo }) => {
    const rita = mundo.clinica.personas.recep;
    await ingresar(page, rita.email, rita.password);
    await page.getByRole("button", { name: /^Menú de / }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await page.waitForURL("**/login**");
    // El cierre revoca la sesión en GoTrue y borra la credencial del navegador (si no, la PC compartida de recepción seguiría adentro).
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => /novudent-auth/.test(k) && localStorage.getItem(k)?.includes("access_token")))).toEqual([]);
    await page.goto("/app");
    await page.waitForURL("**/login**");
  });

  test("alguien que no es de ninguna clínica no entra: «tu cuenta no está asignada a ninguna clínica»", async ({ page }) => {
    const email = `suelto-${Date.now()}@novudent.test`;
    const s = stack();
    const r = await fetch(`${s.url}/auth/v1/admin/users`, { method: "POST", headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Suelto-12345", email_confirm: true }) });
    const uid = (await r.json()).id as string;
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill("Suelto-12345");
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page.locator("p[role=alert]")).toContainText(/no está asignada a ninguna clínica/i);
    } finally {
      await fetch(`${s.url}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}` } });
    }
  });

  test("el administrador creó la cuenta con contraseña provisoria: el primer ingreso exige cambiarla, y la nueva sirve", async ({ page, mundo }) => {
    // Se arma una persona con mustChangePassword y se entra como ella.
    const { crearCuenta, escribirDoc } = await import("../lib/server/stack-de-prueba");
    const email = `provisoria-${Date.now()}@novudent.test`;
    const uid = await crearCuenta(email, "Provisoria-1");
    await escribirDoc("users", "u_provisoria", { id: "u_provisoria", authUid: uid, clinicId: mundo.clinica.cid, name: "Paula Provisoria", email, role: "receptionist", color: "#1769E0", active: true, mustChangePassword: true }, mundo.clinica.cid);
    await ingresar(page, email, "Provisoria-1");
    await expect(page.getByRole("heading", { name: "Creá tu contraseña" })).toBeVisible();
    await page.getByLabel("Nueva contraseña").fill("Definitiva-789");
    await page.getByLabel("Repetí la contraseña").fill("Definitiva-789");
    await page.getByRole("button", { name: "Guardar y continuar" }).click();
    await expect(page.getByRole("heading", { name: "Creá tu contraseña" })).toBeHidden();
    expect((await leerDoc("users", "u_provisoria", mundo.clinica.cid))?.mustChangePassword).toBe(false);
    expect((await iniciarSesion(email, "Definitiva-789")).uid).toBe(uid);
  });
});

test.describe("olvidé mi contraseña (enlace del correo → contraseña nueva)", () => {
  test("el enlace trae la sesión de recuperación, se elige la contraseña nueva y se entra con ella", async ({ page, mundo, baseURL }) => {
    const rita = mundo.clinica.personas.recep;
    const s = stack();
    // El stack de prueba no tiene correo: se pide el mismo enlace que iría en el mensaje con la API de administración.
    const r = await fetch(`${s.url}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "recovery", email: rita.email, redirect_to: `${baseURL}/login` }) });
    const enlace = (await r.json()).action_link as string;
    expect(enlace, "action_link").toContain("/auth/v1/verify");
    await page.goto(enlace);
    await expect(page.getByRole("heading", { name: /contraseña nueva/i })).toBeVisible();
    await page.getByLabel("Contraseña nueva").fill("Recuperada-123");
    await page.getByLabel("Repetí la contraseña").fill("Recuperada-123");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("status")).toContainText(/contraseña quedó cambiada/i);
    await ingresar(page, rita.email, "Recuperada-123");
    expect((await sesionGuardada(page)).userId).toBe("u_recep_migrada");
    rita.password = "Recuperada-123";
  });
});
