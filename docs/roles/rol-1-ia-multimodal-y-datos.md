# Rol 1 — IA multimodal, interpretación y datos

## Objetivo

Interpretar texto, audio e imágenes con salida estructurada y persistir el dominio del negocio.

## Responsabilidades

- Implementar primero un parser determinista; usar el adaptador de IA (Bedrock/modelo configurable) como respaldo.
- Procesar entradas de audio e imagen mediante transcripción, OCR o interpretación.
- Validar resultados y asignar nivel de confianza; marcar entradas ambiguas para confirmación.
- Diseñar esquema, migraciones SQL, índices, RLS y consultas/repositorios de ventas, artículos, gastos e inventario.
- Mantener las operaciones de escritura transaccionales y probar aislamiento entre negocios.

## Carpetas a cargo

- `src/modules/interpretation/`
- `src/modules/media/`
- `src/modules/data/`
- `supabase/migrations/`

## Contratos de integración

`InterpretationRequest` acepta `{ text?, media: { kind: "audio"|"image", storageKey, mimeType }[] }`.

`InterpretationResult` devuelve `{ intent, confidence, data, needsConfirmation, clarification? }`.

El módulo de datos ofrece operaciones de dominio transaccionales; nunca expone credenciales privilegiadas al cliente. Los tipos comunes viven en `src/contracts/`; coordina cualquier cambio con los otros roles según `docs/parallel-work.md`.

## No cubre

Endpoints HTTP, sesiones/login, envío y recepción de WhatsApp ni pantallas.

## Criterio de entrega

El parser puede interpretar fixtures de texto y medios; los datos se guardan mediante repositorios y migraciones repetibles. Las entradas inciertas no se persisten como operaciones confirmadas.
