import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, entrarDemo, leerDB, sinScrollHorizontal } from "./soporte";

/* Pedido de Camila (7-oct-2026): «en el ítem de arancel de precio mejorar la carga de precios» y «agregar el apartado dentro de
   administración de banco y entidades financieras». Arancel: buscar, precio editable en la fila, ajuste en bloque con vista previa y
   deshacer, carga pegando filas de Excel y descarga. Bancos: la lista de la clínica, que el campo «Banco» del cheque ofrece. */

const tarjeta = (page: Page, titulo: string) => page.getByRole("heading", { name: titulo, level: 2, exact: true }).locator("xpath=ancestor::*[contains(@class,'p-5')][1]");
const precioDe = async (page: Page, cpt: string): Promise<number | undefined> => (await leerDB(page)).procedures.find((p: { cpt: string }) => p.cpt === cpt)?.price;

async function irAConfiguracion(page: Page) {
  await page.goto("/app/configuracion");
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
}

test.describe("Configuración › Arancel de precios", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAConfiguracion(page); });

  test("se busca por código, nombre o categoría, sin importar tildes ni mayúsculas", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await expect(arancel.getByRole("row")).toHaveCount(10); // encabezado + los 9 de la demo
    const buscar = arancel.getByLabel("Buscar servicio");
    await buscar.fill("RESINA");
    await expect(arancel.getByRole("row")).toHaveCount(2);
    await expect(arancel.getByRole("row", { name: /D2330/ })).toBeVisible();
    await buscar.fill("cirugia");
    await expect(arancel.getByRole("row", { name: /D7140/ })).toBeVisible();
    await buscar.fill("zzz");
    await expect(arancel.getByText("Ningún servicio coincide")).toBeVisible();
    await buscar.fill("");
    await arancel.getByLabel("Filtrar por categoría").selectOption("endodoncia");
    await expect(arancel.getByRole("row")).toHaveCount(2);
    await expect(arancel.getByRole("row", { name: /D3310/ })).toBeVisible();
  });

  test("el precio se cambia en la misma fila; Enter guarda y pasa al siguiente", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Cambiar el arancel de Evaluación oral periódica" }).click();
    const campo = arancel.getByRole("textbox", { name: "Arancel de Evaluación oral periódica" });
    await expect(campo).toBeFocused();
    await campo.fill("160.000");
    await campo.press("Enter");
    expect(await precioDe(page, "D0120")).toBe(160000);
    await expect(arancel.getByRole("status")).toContainText("D0120");
    // Quedó escribiendo el precio de la fila de abajo.
    const siguiente = arancel.getByRole("textbox", { name: "Arancel de Profilaxis (adulto)" });
    await expect(siguiente).toBeFocused();
    await siguiente.press("Escape");
    await expect(siguiente).toHaveCount(0);
    expect(await precioDe(page, "D1110")).toBe(250000);
    await page.reload();
    await expect(tarjeta(page, "Arancel de precios").getByRole("row", { name: /D0120/ })).toContainText("160.000");
  });

  test("un texto que no es un monto no cambia el precio y avisa", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: /Cambiar el arancel de Resina compuesta/ }).click();
    const campo = arancel.getByRole("textbox", { name: /Arancel de Resina compuesta/ });
    await campo.fill("abc");
    await campo.press("Enter");
    await expect(arancel.getByRole("status")).toContainText("no es un monto");
    expect(await precioDe(page, "D2330")).toBe(420000);
  });

  test("ajustar un porcentaje muestra cómo queda y se puede deshacer", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Ajustar precios" }).click();
    const dialogo = page.getByRole("dialog", { name: "Ajustar precios" });
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    await dialogo.getByLabel("Porcentaje").fill("10");
    await expect(dialogo).toContainText("Cambian 9 de 9 precios");
    await expect(dialogo).toContainText("11.370.000");
    await expect(dialogo).toContainText("12.507.000");
    expect(await precioDe(page, "D2330")).toBe(420000); // la vista previa no guarda nada
    await dialogo.getByRole("button", { name: "Aplicar a 9 precios" }).click();

    expect(await precioDe(page, "D2330")).toBe(462000);
    expect(await precioDe(page, "D8080")).toBe(4950000);
    await expect(arancel.getByRole("status").first()).toContainText("+10 %");
    await arancel.getByRole("button", { name: "Deshacer" }).click();
    expect(await precioDe(page, "D2330")).toBe(420000);
    expect(await precioDe(page, "D8080")).toBe(4500000);
    await expect(arancel.getByRole("button", { name: "Deshacer" })).toHaveCount(0);
  });

  test("deshacer no pisa un precio que ya se cambió a mano después del ajuste", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Ajustar precios" }).click();
    const dialogo = page.getByRole("dialog", { name: "Ajustar precios" });
    await dialogo.getByLabel("Porcentaje").fill("10");
    await dialogo.getByRole("button", { name: "Aplicar a 9 precios" }).click();
    await arancel.getByRole("button", { name: /Cambiar el arancel de Resina compuesta/ }).click();
    const campo = arancel.getByRole("textbox", { name: /Arancel de Resina compuesta/ });
    await campo.fill("500000");
    await campo.press("Enter");
    await arancel.getByRole("button", { name: "Deshacer" }).click();
    expect(await precioDe(page, "D2330")).toBe(500000); // lo cambiado a mano se respeta
    expect(await precioDe(page, "D0120")).toBe(150000);
    await expect(arancel.getByRole("status")).toContainText("no se tocó");
  });

  test("con un filtro puesto, el ajuste es solo para lo que se está viendo", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByLabel("Filtrar por categoría").selectOption("operatoria");
    await arancel.getByRole("button", { name: "Ajustar precios" }).click();
    const dialogo = page.getByRole("dialog", { name: "Ajustar precios" });
    await expect(dialogo.getByRole("radio", { name: /Solo los 1 que estoy viendo/ })).toBeChecked();
    await dialogo.getByLabel("Porcentaje").fill("-10");
    await dialogo.getByLabel("Redondear a").selectOption("10000");
    await dialogo.getByRole("button", { name: "Aplicar a 1 precio" }).click();
    expect(await precioDe(page, "D2330")).toBe(380000); // 420.000 − 10 % = 378.000 → a los diez mil
    expect(await precioDe(page, "D0120")).toBe(150000);
  });

  test("un porcentaje que no se entiende no deja aplicar", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Ajustar precios" }).click();
    const dialogo = page.getByRole("dialog", { name: "Ajustar precios" });
    await dialogo.getByLabel("Porcentaje").fill("mucho");
    await expect(dialogo.getByRole("alert")).toContainText("entre -90 y 500");
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  test("se cargan precios pegando las filas de Excel: ve qué pasa con cada una antes de aplicar", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Cargar desde Excel" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cargar precios desde Excel" });
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    await dialogo.getByLabel("Filas de la planilla").fill("D2330\tResina compuesta — 1 superficie\t500.000\nZZ1\tServicio nuevo de prueba\t99.000\nD0120;abc");
    await expect(dialogo).toContainText("1 nuevo");
    await expect(dialogo).toContainText("1 cambia");
    await expect(dialogo).toContainText("1 con error");
    await expect(dialogo).toContainText("Precio inválido");
    expect(await precioDe(page, "ZZ1")).toBeUndefined(); // todavía no se guardó nada
    await dialogo.getByRole("button", { name: "Aplicar 2 cambios" }).click();

    expect(await precioDe(page, "ZZ1")).toBe(99000);
    expect(await precioDe(page, "D2330")).toBe(500000);
    expect(await precioDe(page, "D0120")).toBe(150000);
    await expect(arancel.getByRole("status")).toContainText("1 servicio nuevo y 1 precio actualizado");
    await expect(arancel.getByRole("row", { name: /ZZ1/ })).toContainText("99.000");
  });

  test("lo que se descarga se puede volver a cargar sin que cambie nada", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    const [descarga] = await Promise.all([page.waitForEvent("download"), arancel.getByRole("button", { name: "Descargar" }).click()]);
    expect(descarga.suggestedFilename()).toBe("arancel-de-precios.csv");
    const csv = readFileSync(await descarga.path(), "utf8").replace(/^﻿/, "");
    expect(csv).toContain("Código");
    expect(csv).toContain("D2330");

    await arancel.getByRole("button", { name: "Cargar desde Excel" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cargar precios desde Excel" });
    await dialogo.getByLabel("Filas de la planilla").fill(csv);
    await expect(dialogo).toContainText("9 sin cambios");
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  test("un código que ya existe no se pisa en silencio", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Agregar servicio" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar servicio" });
    await dialogo.getByLabel("Código (CPT/CDT)").fill("d2330");
    await dialogo.getByLabel("Descripción").fill("Otra resina");
    await dialogo.getByLabel("Arancel (Gs)").fill("1000");
    await dialogo.getByRole("button", { name: "Crear servicio" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("Ya existe un servicio con el código D2330");
    expect(await precioDe(page, "D2330")).toBe(420000);

    await dialogo.getByLabel("Código (CPT/CDT)").fill("D1206");
    await dialogo.getByLabel("Categoría").selectOption("prevencion");
    await dialogo.getByLabel("Arancel (Gs)").fill("180.000");
    await dialogo.getByRole("button", { name: "Crear servicio" }).click();
    await expect(arancel.getByRole("row", { name: /D1206/ })).toContainText("180.000");
    expect((await leerDB(page)).procedures.find((p: { cpt: string }) => p.cpt === "D1206")).toMatchObject({ description: "Otra resina", price: 180000, category: "prevencion" });
  });

  test("un código con barras o espacios se rechaza (es el id del documento en la base)", async ({ page }) => {
    const arancel = tarjeta(page, "Arancel de precios");
    await arancel.getByRole("button", { name: "Agregar servicio" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar servicio" });
    await dialogo.getByLabel("Código (CPT/CDT)").fill("D1/2");
    await dialogo.getByLabel("Descripción").fill("Mal código");
    await dialogo.getByLabel("Arancel (Gs)").fill("1000");
    await dialogo.getByRole("button", { name: "Crear servicio" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("solo puede tener letras");
    expect(await precioDe(page, "D1/2")).toBeUndefined();
  });

    test("al bajar hasta el arancel la ventana no se ensancha (nada tiene que sobresalir de la tabla)", async ({ page }) => {
    // En el celular, un texto oculto (sr-only) absoluto fuera de un contenedor posicionado sobresale de la tabla con scroll y
    // Chrome ensancha toda la ventana: el modal queda corrido y sus botones se salen de la pantalla. `scrollWidth <= innerWidth`
    // no lo detecta (los dos crecen juntos), por eso se compara con el ancho que tenía la ventana al empezar.
    const ancho = await page.evaluate(() => innerWidth);
    await tarjeta(page, "Arancel de precios").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => innerWidth)).toBe(ancho);
    await sinScrollHorizontal(page);
  });

  test("la tabla no obliga a scrollear la página de costado", async ({ page }) => {
    await expect(tarjeta(page, "Arancel de precios").getByRole("row")).toHaveCount(10);
    await sinScrollHorizontal(page);
  });
});

test.describe("Configuración › Bancos y entidades financieras", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page); await irAConfiguracion(page); });

  test("se agrega, se rechaza el repetido, se renombra, se desactiva y se saca", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    const bancos = tarjeta(page, "Bancos y entidades financieras");
    const nombre = bancos.getByLabel("Nombre de la entidad");
    await nombre.fill("Banco Nacional");
    await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(bancos.getByText("Banco Nacional", { exact: true })).toBeVisible();
    await expect(bancos.getByRole("status")).toContainText("Se agregó «Banco Nacional»");

    await nombre.fill("banco  NACIONAL");
    await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(bancos.getByRole("alert")).toContainText("ya está");

    await bancos.getByRole("button", { name: "Cambiar el nombre de Banco Nacional" }).click();
    const campo = bancos.getByRole("textbox", { name: "Nuevo nombre de Banco Nacional" });
    await campo.fill("Banco Nacional de Fomento");
    await campo.press("Enter");
    await expect(bancos.getByText("Banco Nacional de Fomento", { exact: true })).toBeVisible();
    expect((await leerDB(page)).clinics[0].config.entidadesFinancieras).toMatchObject([{ name: "Banco Nacional de Fomento", type: "banco", active: true }]);

    await bancos.getByRole("button", { name: "Desactivar Banco Nacional de Fomento" }).click();
    await expect(bancos.getByText("Desactivada", { exact: true })).toBeVisible();
    expect((await leerDB(page)).clinics[0].config.entidadesFinancieras[0].active).toBe(false);
    await bancos.getByRole("button", { name: "Activar Banco Nacional de Fomento" }).click();
    await expect(bancos.getByText("Desactivada", { exact: true })).toHaveCount(0);

    await bancos.getByRole("button", { name: "Sacar Banco Nacional de Fomento de la lista" }).click();
    await expect(bancos.getByText("Banco Nacional de Fomento")).toHaveCount(0);
    expect((await leerDB(page)).clinics[0].config.entidadesFinancieras).toEqual([]);
  });

    test("al sacar una entidad recién agregada no queda el aviso «Se agregó…» de antes", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    const bancos = tarjeta(page, "Bancos y entidades financieras");
    await bancos.getByLabel("Nombre de la entidad").fill("Banco Efímero");
    await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(bancos.getByRole("status")).toContainText("Se agregó «Banco Efímero»");
    await bancos.getByRole("button", { name: "Sacar Banco Efímero de la lista" }).click();
    await expect(bancos.getByText("Banco Efímero")).toHaveCount(0);
  });

  test("el tipo se elige al agregar y la lista se agrupa por tipo", async ({ page }) => {
    const bancos = tarjeta(page, "Bancos y entidades financieras");
    await bancos.getByLabel("Nombre de la entidad").fill("Visa");
    await bancos.getByLabel("Tipo").selectOption("tarjeta");
    await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(bancos.getByRole("region", { name: "Tarjetas" })).toContainText("Visa");
    await expect(bancos.getByRole("region", { name: "Bancos" })).toHaveCount(0);
  });

  test("la lista sugerida de Paraguay se agrega una sola vez y no pisa lo que ya había", async ({ page }) => {
    const bancos = tarjeta(page, "Bancos y entidades financieras");
    await bancos.getByLabel("Nombre de la entidad").fill("banco itau");
    await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
    await bancos.getByRole("button", { name: "Agregar las más usadas en Paraguay" }).click();
    await expect(bancos.getByRole("status")).toContainText("Revisá la lista");
    await expect(bancos.getByRole("region", { name: "Bancos" })).toContainText("Banco Continental");
    await expect(bancos.getByRole("region", { name: "Tarjetas" })).toContainText("Visa");
    await expect(bancos.getByText(/^banco ita[uú]$/i)).toHaveCount(1); // el que ya estaba (sin tilde) cuenta como ese: no se suma otro
    await expect(bancos.getByRole("button", { name: "Agregar las más usadas en Paraguay" })).toHaveCount(0);
  });

  test("el campo «Banco» del cheque ofrece las entidades activas (no las desactivadas ni las tarjetas)", async ({ page }) => {
    const bancos = tarjeta(page, "Bancos y entidades financieras");
    for (const [nombre, tipo] of [["Banco Atlas", "banco"], ["Banco Viejo", "banco"], ["Cabal", "tarjeta"]] as const) {
      await bancos.getByLabel("Nombre de la entidad").fill(nombre);
      await bancos.getByLabel("Tipo").selectOption(tipo);
      await bancos.getByRole("button", { name: "Agregar", exact: true }).click();
      await expect(bancos.getByText(nombre, { exact: true })).toBeVisible();
    }
    await bancos.getByRole("button", { name: "Desactivar Banco Viejo" }).click();

    await page.goto("/app/caja");
    const abrirCaja = page.getByRole("button", { name: "Abrir caja" });
    if (await abrirCaja.count()) {
      await abrirCaja.first().click();
      await page.getByRole("dialog", { name: "Abrir caja" }).getByRole("button", { name: "Abrir caja" }).click();
    }
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const pago = page.getByRole("dialog", { name: "Registrar pago" });
    await pago.getByLabel("Método").selectOption("cheque");
    const campo = pago.getByLabel("Banco");
    const idLista = await campo.getAttribute("list");
    expect(idLista).toBeTruthy();
    const opciones = await page.locator(`datalist[id="${idLista}"] option`).evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(opciones).toEqual(["Banco Atlas"]);
    await campo.fill("Otro banco que no está en la lista"); // el texto libre sigue valiendo
    await expect(campo).toHaveValue("Otro banco que no está en la lista");
  });

  test("sin entidades cargadas el campo «Banco» no ofrece nada y se escribe como siempre", async ({ page }) => {
    await page.goto("/app/caja");
    const abrirCaja = page.getByRole("button", { name: "Abrir caja" });
    if (await abrirCaja.count()) {
      await abrirCaja.first().click();
      await page.getByRole("dialog", { name: "Abrir caja" }).getByRole("button", { name: "Abrir caja" }).click();
    }
    await page.getByRole("button", { name: "Registrar pago" }).click();
    const pago = page.getByRole("dialog", { name: "Registrar pago" });
    await pago.getByLabel("Método").selectOption("cheque");
    await expect(pago.getByLabel("Banco")).not.toHaveAttribute("list", /.+/);
  });
});
