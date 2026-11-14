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
  await expect(page.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Tu mensaje").fill("Quiero revisar mis pedidos");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Esta respuesta es una simulación");
  await page.getByRole("radio", { name: "Imagen" }).check();
  await page.getByLabel("Archivo de imagen").setInputFiles({ name: "estante.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Descripción de la imagen").fill("Estante con productos");
  await expect(page.getByRole("img", { name: "Estante con productos" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Recibí la imagen");
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
  await expect(page.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled();
  await page.route("**/api/chat/messages", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE", message: "No se pudo enviar. Intenta de nuevo." }) }));
  await page.getByLabel("Tu mensaje").fill("Conservar este mensaje");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo enviar" })).toBeVisible();
  await expect(page.getByLabel("Tu mensaje")).toHaveValue("Conservar este mensaje");
  await page.unroute("**/api/chat/messages");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByRole("log")).toContainText("Esta respuesta es una simulación");
});
