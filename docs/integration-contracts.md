# Contratos de integración — WhatsApp / Infobip

Los tipos y handler siguientes son contratos **a implementar**. R3 materializa los tipos en `src/contracts/`; R1/R2 implementan adaptadores. Los repositorios de datos enumerados al final sí existen. No esperar a credenciales o componentes ajenos para empezar con mocks compatibles.

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

R1 entrega lookup de negocio por número; R2 organiza alta/vinculación segura si no existe. R2 descarga medios mediante el proveedor y entrega referencias de almacenamiento a R1; no permitir URLs arbitrarias en ese descargador.

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

R1 implementa el puerto `interpret(actor, request)` con catálogo limitado al negocio. Una venta resuelta devuelve IDs/cantidades. Una ambigüedad devuelve pregunta y ningún carrito ejecutable. Intenciones aún no implementadas no se persisten. Importes mencionados en texto no sobreescriben el catálogo; deben generar aclaración si contradicen el precio.

R2 empieza con mock del fixture “Vendí 3 cocas y 2 panes”, usando IDs de catálogo fixture acordados. R3 no construye otro intérprete.

## Persistencia disponible — R1

Usar `src/modules/data/conversations.ts` con cliente privilegiado de servidor:

| Función | Entrada | Salida |
| --- | --- | --- |
| `registerInboundEvent` | `provider`, `providerMessageId`, `verifiedSender`, `recipient` | `event_id`, `is_new`, `status` |
| `createSaleDraft` | `verifiedSender`, `operationKey`, `items` | `draft_id`, `status`, `expires_at` |
| `confirmSaleDraft` | `verifiedSender`, `draftId` | `sale_id`, `total_cents`, `replayed`, `items` |
| `cancelSaleDraft` | `verifiedSender`, `draftId` | `draft_id`, `status` |

Detalles/errores: [contrato de datos](../src/modules/data/README.md). Deduplicar eventos por proveedor/ID y ventas por borrador son controles distintos. Crear borrador con clave estable `infobip:<id-del-mensaje-original>`; confirmar nunca usa el ID del nuevo mensaje como clave de venta.

R2 mantiene procesamiento y recuperación; solicita a R1 nuevos repositorios cuando hagan falta. `registerInboundEvent` no es una cola: no guarda contenido ni garantiza procesamiento futuro. No dar por procesado un duplicado pendiente/failed. No usar solo memoria para deduplicar. No confirmar aceptación y descartar contenido antes de procesarlo o almacenarlo durablemente.

## Transporte HTTP — R2/R3

R2 propone `handleInfobipWebhook({ rawBody, headers })`, con dependencias inyectadas de autenticación, proveedor, interpretación y datos. Retorna `{ status, body }` serializable y sin secretos. R3 monta `POST /api/webhooks/infobip`, limita tamaño y conserva los bytes/cabeceras necesarios para verificar autenticidad. Fijar las firmas TS y códigos HTTP en el primer PR del handler.

R3 usa handler mock local mientras llega el real. Una ruta pública mock no debe fingir ventas registradas. Con cola, responder éxito tras aceptación durable; sin ella, procesamiento síncrono acotado sin IA lenta. Errores reintentables no marcan eventos como completados. R2 controla autenticidad/esquema; R3 transporte/despliegue.

## Pendientes explícitos

- Borradores actuales no reservan stock ni congelan precios: se validan al confirmar. Antes de permitir cambios de catálogo durante una conversación, R1/R2 deben detectar diferencia frente al resumen y solicitar nueva confirmación.
- Entregar alta/vinculación antes de probar comercios nuevos; el seed no crea usuario ni WhatsApp real.
- Definir zona horaria del negocio antes de prometer el reporte “ventas de hoy”.
