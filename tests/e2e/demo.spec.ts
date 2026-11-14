import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1V0AAAAASUVORK5CYII=", "base64");
// Short silent PCM WAV, generated locally; no external media dependency.
function wav() {
  const buffer = Buffer.alloc(44 + 1600); buffer.write("RIFF"); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(1600, 40); return buffer;
}

test("text, image and audio roundtrip with history, keyboard and accessibility", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Grabar nota de voz" })).toBeEnabled();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Tu mensaje").fill("Quiero revisar mis pedidos");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Aquí puedes llevar un registro local sin WhatsApp");
  await page.getByRole("button", { name: "Adjuntar archivo", exact: true }).click();
  await page.getByRole("radio", { name: "Imagen" }).check();
  await page.getByLabel("Archivo de imagen").setInputFiles({ name: "estante.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Descripción de la imagen").fill("Estante con productos");
  await expect(page.getByRole("img", { name: "Estante con productos" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Recibí la imagen");
  await page.getByRole("button", { name: "Adjuntar archivo", exact: true }).click();
  await page.getByRole("radio", { name: "Audio", exact: true }).check();
  await page.getByLabel("Archivo de audio").setInputFiles({ name: "nota.wav", mimeType: "audio/wav", buffer: wav() });
  await expect(page.getByLabel("Vista previa del audio seleccionado")).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Recibí el audio");
  await page.reload();
  await expect(page.getByRole("log").getByRole("article")).toHaveCount(6);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors).toEqual([]);
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `No horizontal overflow at ${width}px` }).toBe(true);
  }
});

test("orders filter, empty state, status update, persistence and accessible layout", async ({ page }) => {
  await page.goto("/distribuidores");
  const row = page.getByRole("row").filter({ hasText: "PED-1042" });
  await expect(row).toBeVisible(); await expect(row).toContainText("$2,480.50");
  await page.getByLabel("Estado del pedido", { exact: true }).selectOption("pending");
  await page.getByRole("button", { name: "Filtrar pedidos" }).click();
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Nuevo estado de PED-1042").selectOption("confirmed");
  await page.getByRole("button", { name: "Guardar estado de PED-1042" }).click();
  await expect(page.getByRole("status").filter({ hasText: "estado actualizado a confirmado" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByLabel("Buscar comercio o pedido").fill("sin coincidencias");
  await page.getByRole("button", { name: "Filtrar pedidos" }).click();
  await expect(page.getByRole("heading", { name: "No hay pedidos con estos filtros" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(row.locator("[data-status]")).toHaveText("Confirmado");
  await page.reload(); await expect(row.locator("[data-status]")).toHaveText("Confirmado");
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `No horizontal overflow at ${width}px` }).toBe(true);
  }
});

test("API errors and loading states are visible and recoverable", async ({ page }) => {
  await page.route("**/api/distributor/dashboard*", async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE", message: "Servicio temporalmente no disponible." }) });
  });
  await page.goto("/distribuidores");
  await expect(page.getByRole("status", { name: "Cargando panel" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Servicio temporalmente no disponible" })).toBeVisible();
  await page.unroute("**/api/distributor/dashboard*");
  await page.getByRole("button", { name: "Actualizar panel" }).click();
  await expect(page.getByRole("row").filter({ hasText: "PED-1042" })).toBeVisible();
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Grabar nota de voz" })).toBeEnabled();
  await page.route("**/api/chat/messages", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE", message: "No se pudo enviar. Intenta de nuevo." }) }));
  await page.getByLabel("Tu mensaje").fill("Conservar este mensaje");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo enviar" })).toBeVisible();
  await expect(page.getByLabel("Tu mensaje")).toHaveValue("Conservar este mensaje");
  await page.unroute("**/api/chat/messages");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Aquí puedes llevar un registro local sin WhatsApp");
});

test("Knectan orders can be added and removed with keyboard confirmation and persistent KPIs", async ({ page }, testInfo) => {
  await page.goto("/distribuidores");
  await expect(page.getByRole("button", { name: "Agregar pedido", exact: true })).toBeEnabled();
  await expect(page).toHaveTitle(/Knectan/);
  for (const logo of await page.getByRole("img", { name: "Knectan", exact: true }).all()) {
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  const logoResponse = await page.request.get("/logo/Knectan_logo.svg");
  expect(logoResponse.status()).toBe(200);
  await page.getByRole("button", { name: "Agregar pedido", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Agregar pedido", exact: true });
  await expect(dialog.getByLabel("Cliente", { exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Guardar pedido" }).click();
  await expect(dialog.getByText("Escribe un cliente de 1 a 80 caracteres.")).toBeVisible();
  await dialog.getByLabel("Cliente", { exact: true }).fill("Abarrotes Prueba");
  await dialog.getByLabel("Canal", { exact: true }).selectOption("whatsapp");
  await dialog.getByLabel("Cantidad de artículos").fill("3");
  await dialog.getByLabel("Monto total en MXN").fill("1.005");
  await dialog.getByRole("button", { name: "Guardar pedido" }).click();
  await expect(dialog.getByLabel("Monto total en MXN")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel("Monto total en MXN").fill("1.01");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("order-form.png"), fullPage: true });
  const posted = page.waitForRequest(request => request.url().endsWith("/api/distributor/orders") && request.method() === "POST");
  await dialog.getByRole("button", { name: "Guardar pedido" }).click();
  expect((await posted).postDataJSON()).toEqual({ customer: "Abarrotes Prueba", channel: "whatsapp", items_count: 3, total_cents: 101 });
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Abarrotes Prueba" });
  await expect(row).toContainText("$1.01"); await expect(row).toContainText("WhatsApp");
  const indicators = page.getByLabel("Indicadores de todos los pedidos");
  await expect(indicators.locator("dd").nth(1)).toContainText("7");
  await expect(indicators.locator("dd").first()).toContainText("$13,693.81");
  await page.reload(); await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Quitar pedido/ }).click();
  const confirmation = page.getByRole("dialog", { name: /Quitar pedido/ });
  await expect(confirmation.getByRole("button", { name: "Cancelar" })).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(confirmation).not.toBeVisible(); await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /Quitar pedido/ })).toBeFocused();
  await row.getByRole("button", { name: /Quitar pedido/ }).click();
  await confirmation.getByRole("button", { name: "Confirmar quitar pedido" }).click();
  await expect(row).toHaveCount(0);
  await expect(indicators.locator("dd").nth(1)).toContainText("6");
  await expect(indicators.locator("dd").first()).toContainText("$13,692.80");
  await page.reload(); await expect(row).toHaveCount(0);
  await expect(page.getByRole("row")).toHaveCount(7);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
});

test("supplier plans compare, recommend and activate in mock mode without overflow", async ({ page }, testInfo) => {
  await page.goto("/publicidad");
  await expect(page.getByRole("heading", { name: "Publicidad y visibilidad para proveedores" })).toBeVisible();
  const recommendation = page.getByRole("status").filter({ hasText: "Te recomendamos" });
  await expect(recommendation).toContainText("Impulso Inicial");
  await page.getByLabel("Tamaño del catálogo").selectOption("250");
  await expect(recommendation).toContainText("Proveedor Destacado");
  await page.getByLabel("Pedidos mensuales").selectOption("501");
  await expect(recommendation).toContainText("Cobertura Total");
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Activar Cobertura Total en demo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "plan activado en modo mock" })).toContainText("$1,499.00");
  await expect(page.getByRole("status").filter({ hasText: "plan activado en modo mock" })).toContainText("No se realizó ningún cobro");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("supplier-plans.png"), fullPage: true });
  for (const width of [1440, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await expect(page.locator("body")).toContainText("Knectan");
});

 test("local chat confirms operations, keeps drafts after failure, and supports emoji", async ({ page }, testInfo) => {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "Grabar nota de voz" })).toBeEnabled();
  await page.getByLabel("Tu mensaje").fill("Vendí 3 cocas y 2 panes");
  await page.getByLabel("Tu mensaje").press("Enter");
  await expect(page.getByRole("log")).toContainText("Total: $80.00");
  await page.getByLabel("Tu mensaje").fill("confirmar");
  await page.getByLabel("Tu mensaje").press("Enter");
  await expect(page.getByRole("log")).toContainText("Venta registrada");
  await page.reload();
  await page.getByLabel("Tu mensaje").fill("ventas de hoy");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Ventas: $80.00");
  await page.route("**/api/chat/messages", route => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.getByLabel("Tu mensaje").fill("Gasté 50 en luz");
  await page.getByLabel("Tu mensaje").press("Enter");
  await expect(page.locator("#chat-error")).toContainText("No hay conexión");
  await expect(page.getByLabel("Tu mensaje")).toHaveValue("Gasté 50 en luz");
  await page.unroute("**/api/chat/messages");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("¿Registro este gasto?");
  await page.getByLabel("Tu mensaje").fill("cancelar");
  await page.getByLabel("Tu mensaje").press("Enter");
  await expect(page.getByRole("log")).toContainText("Operación cancelada");
  await page.getByRole("button", { name: "Elegir emoji", exact: true }).click();
  await page.getByRole("button", { name: "Añadir 👍" }).click();
  await expect(page.getByLabel("Tu mensaje")).toHaveValue("👍");
  await page.screenshot({ path: testInfo.outputPath("chat-local.png"), fullPage: true });
});

test("voice notes record and send from the composer", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await page.goto("/chat");
  const microphone = page.getByRole("button", { name: "Grabar nota de voz" });
  await expect(microphone).toBeEnabled();
  await microphone.click();
  await expect(page.getByRole("status").filter({ hasText: "Grabando audio" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.mediaDevices.enumerateDevices().then(d => d.some(v => v.kind === "audioinput")))).toBe(true);
  // Allow the recorder to produce an actual audio chunk from the fake microphone.
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Detener", exact: true }).click();
  await expect(page.getByLabel("Vista previa del audio seleccionado")).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Recibí el audio");
});
