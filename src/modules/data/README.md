# Ventas e identidad WhatsApp — contrato para el rol 2

El número de WhatsApp es la identidad principal del negocio. `businesses.whatsapp_id` es único y guarda el número internacional como dígitos, incluido el código de país y sin `+`, espacios ni guiones. El UUID de `businesses.id` sigue siendo la clave interna de las relaciones. Durante el alta se puede mantener el número nulo, pero no se podrá vender por WhatsApp hasta vincularlo mediante un proceso de servidor verificado. No se crean negocios automáticamente al recibir una venta.

## Invocación desde servidor

**Actualización de contrato (migración 004):** para el POS conversacional usar `businesses.ts` y `conversations.ts`. `recordWhatsAppSale` es un helper de bajo nivel y no detecta cambios respecto a un resumen: no invocarlo directamente desde mensajes/botones de confirmación.

### Alta explícita e interpretación

1. Autenticar y normalizar el remitente (R2). `findBusinessByWhatsApp(client, verifiedSender)` devuelve negocio o `null`.
2. Si falta negocio, `business_type` o `onboarding_completed_at`, preguntar nombre y giro de negocio. `completeBusinessOnboarding(client, { verifiedSender, name, businessType })` guarda el alta explícita; repetir los mismos datos es idempotente, intentar sobreescribir un alta completa devuelve `ONBOARDING_CONFLICT`. Nombre y giro deben tener entre 1 y 160 caracteres.
3. `getBusinessCatalogue(client, verifiedSender)` consulta únicamente el negocio resuelto por ese número. `interpretForWhatsApp(client, verifiedSender, request)` devuelve `{ business, interpretation }`; el giro queda disponible en `business.business_type` para modelos futuros. Todavía no se crean productos con IA.
4. El parser puro `interpretSaleMessage(request, catalogue)` reconoce cantidades numéricas y productos en frases como “Vendí 3 cocas y 2 panes”. Admite decimales y precios explícitos solo si coinciden con catálogo. Devuelve artículos o pregunta de aclaración, nunca una venta persistida. La resolución de plurales es conservadora; no es un modelo de lenguaje ni interpreta medios todavía.

### Resumen versionado y cambio de precio

`createSaleDraft` devuelve `quote` (artículos, precio, subtotales y total) y `quote_version`. El mensaje/botón de confirmación debe guardar ambas referencias: borrador y versión presentada. Usar el resumen del RPC para mostrar precios; no fabricar un resumen con valores independientes del navegador/modelo.

```ts
const result = await confirmSaleDraft(serverClient, {
  verifiedSender, draftId, quoteVersion: versionPresentedToTheUser,
});
if (result.status === 'confirmed') {
  // result.receipt: venta guardada, incluso si es replay.
} else if (result.status === 'price_changed') {
  // formatPriceChangeNotice(result) muestra anterior/nuevo y pide otra aprobación.
  // Guardar result.quote_version en el NUEVO mensaje/botón.
} else {
  // quote_outdated: se usó un botón antiguo; mostrar result.quote sin vender.
}
```

No tomar automáticamente la versión más reciente para procesar una confirmación antigua. Solo `confirmed` representa una venta. `price_changed` persiste la nueva cotización sin descontar stock y requiere otra confirmación. La fecha de vencimiento original permanece. Borradores anteriores sin cotización requieren obtener/mostrar un resumen nuevo antes de aprobar.

Los nuevos errores son `ONBOARDING_REQUIRED`, `INVALID_ONBOARDING`, `ONBOARDING_CONFLICT` y `QUOTE_VERSION_REQUIRED`. Números desconocidos no se registran al vender y negocios existentes sin giro deben completar el alta.

### Helper de bajo nivel

Usar `recordWhatsAppSale` de `whatsapp-sales.ts` con un cliente Supabase privilegiado del servidor:

```ts
await recordWhatsAppSale(serverClient, {
  verifiedSender: verifiedWebhookMessage.from,
  operationKey: 'operation:' + confirmedOperation.id,
  source: 'whatsapp',
  items: [
    { product_id: productId, quantity: 3 },
  ],
});
```

`verifiedWebhookMessage` representa el evento normalizado por el rol 2 después de autenticar el webhook con el mecanismo configurado del proveedor (Infobip para la demo), validar su esquema y comprobar el destinatario contra el remitente de plataforma esperado. No asumir firma de Meta para Infobip. `from` identifica al comerciante; `to` identifica al número receptor de la plataforma. Nunca usar el número de prueba de Infobip como identidad del comercio. Un teléfono enviado en el texto o formulario no autentica a su dueño.

El cliente no envía `business_id`, precio, total ni descripción. El RPC `record_whatsapp_sale` obtiene esos datos del catálogo, guarda precios históricos y redondea cada subtotal a centavos (cantidades con hasta tres decimales). No admite productos repetidos en el carrito; agrupar sus cantidades antes de confirmar. Solo admite canales `whatsapp` y `whatsapp_flow`; el canal web deberá usar identidad de sesión resuelta en servidor.

La clave `operationKey` identifica la operación confirmada, no cada mensaje de confirmación. Antes se llamaba `eventId`; actualizar las llamadas al integrar el rol 2. No crear una clave distinta cada vez que el usuario escribe “Confirmar”. El origen por defecto es `whatsapp`; `whatsapp_flow` se conserva para compatibilidad histórica. Infobip es el proveedor, no un nuevo canal de ventas.

## Eventos y borradores (camino recomendado para Infobip)

Las funciones de `conversations.ts` usan el mismo cliente privilegiado de servidor. Las tablas nuevas tienen RLS y carecen de acceso para `anon`/`authenticated`.

1. `registerInboundEvent({ provider: 'infobip', providerMessageId, verifiedSender, recipient })` persiste el evento con unicidad por proveedor e ID. Devuelve `event_id`, `is_new`, `status`. El ID se toma del mensaje entrante normalizado, no de un reporte de entrega.
2. Interpretar el contenido y resolver los productos. `createSaleDraft({ verifiedSender, operationKey: 'infobip:' + providerMessageId, items })` crea el borrador con duración inicial de 15 minutos. No descuenta stock. Reintentos con la misma clave conservan el borrador; cambios al carrito requieren una nueva operación y cancelar el borrador anterior.
3. Mostrar `quote` y asociar botones/respuestas al `draft_id`, `quote_version` y remitente. No inferir una confirmación de un “sí” sin contexto inequívoco.
4. `confirmSaleDraft({ verifiedSender, draftId, quoteVersion })` confirma atómicamente con clave interna `draft:<uuid>`. Devuelve `status` y, solo si es `confirmed`, un `receipt`. Mensajes diferentes confirmando el mismo borrador no duplican la venta. Si está pendiente y venció, falla; si ya se confirmó, devuelve el recibo incluso después del vencimiento.
5. `cancelSaleDraft({ verifiedSender, draftId })` cancela un borrador no confirmado. No permite revertir una venta confirmada.

Persistir recepción no equivale a procesar un evento: el rol 2 debe gestionar `status` (`received`, `processing`, `processed`, `failed`) y recuperación de pendientes con su worker/adaptador de cola. No ignorar `is_new=false` salvo que el evento ya esté procesado. Esta tabla registra metadatos; no es una cola ni guarda contenido suficiente para recuperar mensajes sin una fuente durable adicional. Marcar `processed` solo tras completar el efecto correspondiente; una respuesta fallida no debe crear otra venta. El RPC de confirmación garantiza la idempotencia del efecto de venta, aunque dos workers reintenten.

El rol 2 normaliza números internacionales de forma consistente con el alta. Este módulo espera dígitos con código de país; no agrega prefijos de país ni modifica números mexicanos automáticamente. La autenticación de proveedor, descarga de audio/imágenes y traducción de payloads de Infobip quedan fuera del módulo de datos; el rol 1 recibe medios mediante referencias de almacenamiento independientes del proveedor.

Para borradores se añaden `DRAFT_NOT_FOUND`, `DRAFT_EXPIRED`, `DRAFT_CANCELLED`, `DRAFT_ALREADY_CONFIRMED`; para eventos, `EVENT_IDENTITY_CONFLICT`. Las restricciones SQL también rechazan metadatos inválidos.

## Respuesta y errores

Devuelve `sale_id`, `total_cents`, `replayed` e `items` con precios y subtotales guardados. Repetir la misma clave y carrito devuelve la venta original sin volver a descontar stock, incluso si después cambió el precio del catálogo.

- `OUT_OF_STOCK`: no se guarda ninguna parte de la venta; el detalle contiene el ID de producto para mostrar “agotado”/cantidad insuficiente y corregir el carrito. No pone a cero la existencia si aún quedan unidades.
- `IDEMPOTENCY_CONFLICT`: la clave ya corresponde a otro carrito/canal.
- `BUSINESS_NOT_FOUND`: falta vincular el remitente a un negocio.
- `PRODUCT_NOT_FOUND`: el producto no existe o pertenece a otro negocio.
- `INVALID_ITEMS`, `INVALID_ITEM`, `INVALID_QUANTITY`, `DUPLICATE_PRODUCT`: corregir el carrito.
- `INVALID_WHATSAPP_ID`, `INVALID_IDEMPOTENCY_KEY`, `INVALID_SOURCE`, `TOTAL_TOO_LARGE`: entrada inválida.

Los errores se lanzan por el repositorio; el rol 2/3 debe traducirlos a mensajes de producto sin revelar detalles de infraestructura. El servicio de mensajería y el endpoint HTTP no forman parte de este módulo.
