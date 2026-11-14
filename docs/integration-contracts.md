# Contratos de integración — WhatsApp / Infobip

El handler real y la ruta `POST /api/webhooks/infobip` ya están implementados. La configuración y prueba contra la cuenta Infobip siguen pendientes. R1 entrega tipos de dominio, parser, consultas/alta y confirmaciones; R2 compone esos servicios mediante `createRole2Service`. La identidad WhatsApp se mantiene separada del `Actor` web.

## Identidad y mensaje normalizado — R2

```ts
type Actor = {
  businessId: string; // resuelto en servidor después de vincular el número
  verifiedSender: string; // internacional, dígitos sin '+'
  channel: 'whatsapp';
};
type InboundMessage = {
  provider: 'infobip';
  providerMessageId: string;
  from: string; // comerciante
  to: string; // receptor de plataforma, contrastado con configuración
  receivedAt: string;
  kind: 'text' | 'audio' | 'image' | 'button' | 'unsupported';
  text?: string;
  action?: { kind: 'confirm' | 'cancel'; draftId: string };
  media?: { storageKey: string; mimeType: string };
};
```

R2 autentica el webhook con el mecanismo configurado en Infobip, valida el esquema y normaliza cada mensaje antes de crear este evento. No asumir firma Meta ni tratar reportes de entrega como ventas. El remitente proviene del evento autenticado, nunca de texto libre. Contrastar acciones con el remitente y borrador en base de datos.

R1 entrega `findBusinessByWhatsApp`, `getBusinessCatalogue`, `completeBusinessOnboarding` e `interpretForWhatsApp` en `src/modules/data/businesses.ts`. R2 organiza alta/vinculación segura si no existe el negocio o faltan giro/fecha de alta. Preguntar nombre y giro explícitamente; solo después llamar `completeBusinessOnboarding({ verifiedSender, name, businessType })`. No inferir el giro ni registrar automáticamente al primer “Hola”. R2 descarga medios mediante el proveedor y entrega referencias de almacenamiento a R1; no permitir URLs arbitrarias en ese descargador.

## Interpretación — R1; P0 solo texto

```ts
type InterpretationRequest = {
  text?: string;
  media?: { kind: 'audio' | 'image'; storageKey: string; mimeType: string }[];
};
type SaleItemInput = { product_id: string; quantity: number };
type InterpretationResult = {
  intent: 'sale' | 'report' | 'expense' | 'unknown';
  confidence: number; // 0..1; nunca sustituye la confirmación
  data: { items?: SaleItemInput[]; report?: 'sales_today'; expense?: { concept: string; amount_cents: number } };
  needsConfirmation: boolean;
  clarification?: string;
  clarificationOptions?: { product_id: string; label: string }[];
};
```

R1 implementa `interpretSaleMessage(request, catalogue)` como función pura y `interpretForWhatsApp(client, verifiedSender, request)` como adaptador que resuelve negocio y catálogo. Devuelve `{ business, interpretation }`; `business` incluye giro/zona horaria. Intenciones actuales: `sale`, `expense`, `report`, `unknown`. Venta resuelta devuelve IDs/cantidades; ambigüedad devuelve pregunta y `clarificationOptions?: { product_id, label }[]`, sin carrito ejecutable. No sobreescribir precios del catálogo desde el texto.

El estándar y la creación/edición de productos están en [product-standard.md](product-standard.md). Resolver “una coca” contra todas las presentaciones; si es ambiguo preguntar. La cantidad “una” equivale a 1, pero nunca significa una presentación específica. Mostrar nombres completos, contenido y unidad en el resumen.

“Gasté 50 en luz” devuelve `data.expense = { concept, amount_cents }` y requiere confirmación. R2 usa los borradores persistentes de `expense-drafts.ts` para proponer/confirmar/cancelar. No usar `createSaleDraft`, que solo admite artículos de venta, ni invocar `recordExpense` directamente al recibir el mensaje.

“¿Cuánto vendí hoy?” devuelve `data.report = 'sales_today'`. Llamar `getBusinessDailyReport` para responder con importes reales. Si retorna `TIME_ZONE_REQUIRED`, preguntar zona/localidad y configurar `setBusinessTimeZone` antes de definir el día: no inferir que todos los negocios mexicanos comparten zona. Gastos y ventas se reportan por separado; el reporte no calcula utilidad.

Ver [contrato de gastos/reportes](accounting-contract.md) para fechas, reintentos y respuestas tipadas. R3 usa los repositorios de productos del servidor: la migración 005 retira escrituras directas a productos/gastos y la 006 exige snapshot `expected` para impedir sobreescritura de stock desde un formulario antiguo.

R2 empieza con mock del fixture “Vendí 3 cocas y 2 panes”, usando IDs de catálogo fixture acordados. R3 no construye otro intérprete.

## Persistencia disponible — R1

Usar `src/modules/data/conversations.ts` con cliente privilegiado de servidor:

| Función | Entrada | Salida |
| --- | --- | --- |
| `registerInboundEvent` | `provider`, `providerMessageId`, `verifiedSender`, `recipient` | `event_id`, `is_new`, `status` |
| `createSaleDraft` | `verifiedSender`, `operationKey`, `items` | `draft_id`, `status`, `expires_at`, `quote`, `quote_version` |
| `confirmSaleDraft` | `verifiedSender`, `draftId`, `quoteVersion` | Unión tipada: `confirmed` con `receipt`, `price_changed` o `quote_outdated` |
| `cancelSaleDraft` | `verifiedSender`, `draftId` | `draft_id`, `status` |

Detalles/errores: [contrato de datos](../src/modules/data/README.md). Deduplicar eventos por proveedor/ID y ventas por borrador son controles distintos. Crear borrador con clave estable `infobip:<id-del-mensaje-original>`; confirmar nunca usa el ID del nuevo mensaje como clave de venta.

R2 mantiene procesamiento y recuperación; solicita a R1 nuevos repositorios cuando hagan falta. `registerInboundEvent` no es una cola: no guarda contenido ni garantiza procesamiento futuro. No dar por procesado un duplicado pendiente/failed. No usar solo memoria para deduplicar. No confirmar aceptación y descartar contenido antes de procesarlo o almacenarlo durablemente.

El webhook real utiliza `r2_events` y los RPC de la migración 007 como almacenamiento durable canónico (payload, lease y respuesta), no `whatsapp_inbound_events`, que queda como registro de metadatos anterior. No escribir en ambos para afirmar que un mensaje fue procesado. Ante error de negocio conocido, persiste y envía una explicación; ante fallo técnico conserva respuesta de error HTTP reintentable.

## Transporte HTTP — R2/R3

`createRole2Service(config)` devuelve `handleInfobipWebhook({ rawBody, headers })` con dependencias de autenticación/proveedor/datos. `src/modules/http/infobip.ts` compone la instancia de servidor y monta la ruta bajo `app/api/webhooks/infobip/route.ts`. Límite de cuerpo de 256 KiB antes de leerlo completamente, autenticación Basic del perfil configurado y configuración obligatoria sin fallback a mocks. La ruta permanece deshabilitada salvo `INFOBIP_WEBHOOK_ENABLED=true`.

Selecciones: `ELEGIR <token> <opción>` lleva la venta original, la clave de operación y las selecciones por índice de renglón. Las aclaraciones siguientes conservan ese contexto; no se filtra el catálogo completo al elegir una presentación de un renglón. La respuesta contiene un solo token para respetar el límite de WhatsApp. Los resúmenes largos se dividen por líneas en mensajes de hasta 4096 caracteres.

R3 usa handler mock local mientras llega el real. Una ruta pública mock no debe fingir ventas registradas. Con cola, responder éxito tras aceptación durable; sin ella, procesamiento síncrono acotado sin IA lenta. Errores reintentables no marcan eventos como completados. R2 controla autenticidad/esquema; R3 transporte/despliegue.

## Pendientes explícitos

- Borradores no reservan stock. La migración 004 guarda el resumen de precios con versión y detecta cambios atómicamente al confirmar. R2 debe mostrar `previous_quote` y `quote` claramente y generar otra confirmación ligada al nuevo `quote_version`. `price_changed` y `quote_outdated` no son ventas confirmadas. `formatPriceChangeNotice` ofrece el texto de cambio. Un botón antiguo no acepta la nueva versión.
- Alta explícita ya conectada a R2 con nombre/giro y remitente verificado. El seed no crea usuario ni WhatsApp real. Negocios existentes sin giro deben completar alta antes de operar.
- La zona horaria ahora se configura mediante repositorio y queda pendiente de preguntar a cada negocio antes del primer reporte; no hay una zona predeterminada silenciosa.

## Almacenamiento multimedia acordado

Supabase Storage privado es el proveedor del MVP para audios e imágenes; S3 queda como alternativa futura. R2 descarga de Infobip de forma autenticada/acotada y llama `createSupabaseMediaStore.save` con actor verificado y clave por evento. El adaptador genera la referencia registrada, nunca el navegador ni el payload externo. R1 consume esa referencia mediante el lector Supabase; R3 compone servidor con `WHATSAPP_AUDIO_ENABLED` y `OPENAI_API_KEY` después de aplicar 008. Ver [media-storage.md](media-storage.md). El parser Infobip actual todavía no normaliza medios reales.
