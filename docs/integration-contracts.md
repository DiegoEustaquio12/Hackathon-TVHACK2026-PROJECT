# Contratos de integración — WhatsApp / Infobip

Los contratos de transporte y el handler siguientes siguen pendientes. R1 ya entrega tipos de dominio en `src/modules/interpretation/types.ts`, parser puro en `parser.ts`, consultas/alta en `src/modules/data/businesses.ts` y resultados de confirmación en `sale-results.ts`. R3 puede adaptar/reexportar esos tipos sin modificar su `Actor` web actual. No esperar a credenciales ajenas para avanzar con mocks.

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
  data: { items?: SaleItemInput[]; report?: 'sales_today' };
  needsConfirmation: boolean;
  clarification?: string;
};
```

R1 implementa `interpretSaleMessage(request, catalogue)` como función pura y `interpretForWhatsApp(client, verifiedSender, request)` como adaptador que resuelve negocio y catálogo. Este último devuelve `{ business, interpretation }`; `business` incluye `business_type` para futuros modelos de IA. El P0 solo devuelve intenciones `sale`/`unknown`: reportes/gastos siguen pendientes. Una venta resuelta devuelve IDs/cantidades. Una ambigüedad devuelve pregunta y ningún carrito ejecutable. Importes mencionados en texto no sobreescriben el catálogo; deben generar aclaración si contradicen el precio.

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

## Transporte HTTP — R2/R3

R2 propone `handleInfobipWebhook({ rawBody, headers })`, con dependencias inyectadas de autenticación, proveedor, interpretación y datos. Retorna `{ status, body }` serializable y sin secretos. R3 monta `POST /api/webhooks/infobip`, limita tamaño y conserva los bytes/cabeceras necesarios para verificar autenticidad. Fijar las firmas TS y códigos HTTP en el primer PR del handler.

R3 usa handler mock local mientras llega el real. Una ruta pública mock no debe fingir ventas registradas. Con cola, responder éxito tras aceptación durable; sin ella, procesamiento síncrono acotado sin IA lenta. Errores reintentables no marcan eventos como completados. R2 controla autenticidad/esquema; R3 transporte/despliegue.

## Pendientes explícitos

- Borradores no reservan stock. La migración 004 guarda el resumen de precios con versión y detecta cambios atómicamente al confirmar. R2 debe mostrar `previous_quote` y `quote` claramente y generar otra confirmación ligada al nuevo `quote_version`. `price_changed` y `quote_outdated` no son ventas confirmadas. `formatPriceChangeNotice` ofrece el texto de cambio. Un botón antiguo no acepta la nueva versión.
- Alta de negocio implementada en datos; falta conversación R2 para recopilar nombre/giro desde el remitente verificado. El seed no crea usuario ni WhatsApp real. Negocios existentes sin giro deben completar alta antes de operar.
- Definir zona horaria del negocio antes de prometer el reporte “ventas de hoy”.
