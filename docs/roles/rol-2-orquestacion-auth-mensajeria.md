# Rol 2 — Orquestación de IA, autenticación y mensajería

## Objetivo

Conectar canales e identidad con interpretación y operaciones del negocio.

## Responsabilidades

- Implementar el flujo conversacional que invoca los servicios del rol 1.
- Solicitar confirmación antes de persistir entradas inciertas.
- Implementar autenticación de distribuidores y canje de enlace temporal para comerciantes.
- Crear sesiones seguras con expiración y revocación.
- Implementar webhook de WhatsApp: verificación, firma, deduplicación, respuestas y política de consentimiento.
- Aislar proveedores detrás de adaptadores y nunca registrar tokens o contenido sensible en logs.

## Carpetas a cargo

- `src/modules/orchestration/`
- `src/modules/auth/`
- `src/modules/messaging/`

Las rutas HTTP se acuerdan con el rol 3; no editar sus archivos simultáneamente.

## Contratos de integración

Recibe identidad ya resuelta como `Actor { businessId, userId?, channel }`. Llama interpretación y repositorios mediante interfaces; no implementa SQL directo.

Los webhooks son idempotentes por ID del evento. Deben responder rápido al proveedor y delegar el trabajo lento a una cola/adaptador. Para la demo se permite procesamiento síncrono acotado con límite de tiempo.

Los tipos comunes viven en `src/contracts/`; coordina cambios con los otros roles según `docs/parallel-work.md`.

## No cubre

Propiedad del esquema de negocio, componentes visuales ni despliegue.

## Criterio de entrega

Un mensaje entrante puede asociarse a un negocio autenticado, pasar por interpretación, pedir confirmación cuando haga falta y responder por el canal de origen sin duplicar operaciones.
