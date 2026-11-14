# Rol 1 — IA multimodal, interpretación y datos

## Objetivo

Interpretar texto, audio e imágenes con salida estructurada y persistir el dominio del negocio.

## Trabajo inmediato en paralelo

**Entrega ampliada disponible:** estándar de productos y alias persistidos, creación/edición comercial segura, interpretación de “una coca” con preguntas por presentación, gastos idempotentes y reporte diario por zona IANA explícita. Migraciones 005–006; contratos en `docs/product-standard.md` y `docs/accounting-contract.md`. Sigue pendiente la interpretación de audio/imágenes, la IA y conectar estos servicios desde R2/R3.

**Entrega actual:** migración 004 de alta explícita y precios versionados; parser `interpretSaleMessage`; adaptadores `findBusinessByWhatsApp`, `getBusinessCatalogue`, `interpretForWhatsApp` y `completeBusinessOnboarding`. El catálogo se obtiene por número verificado, nunca por un negocio elegido desde el mensaje. Ver contratos actualizados; los pasos siguientes describen el alcance de esta entrega y su integración.

Leer [guía paralela](../parallel-work.md), [contratos](../integration-contracts.md) y [contrato de datos](../../src/modules/data/README.md). Las migraciones 001–004 y repositorios ya se comprobaron localmente; publicar esta entrega en un PR para R2.

1. Entregar lookup de negocio por número normalizado y catálogo limitado al actor verificado. R2 puede usar mocks mientras se integran.
2. Implementar `interpret(actor, request)` determinista para texto, con catálogo inyectado y sin persistir ventas.
3. Resolver productos del mismo negocio; devolver IDs/cantidades o pregunta ante presentaciones ambiguas/productos desconocidos. No inventar productos ni permitir sobreescribir precios desde texto.
4. Entregar fixtures de venta de dos artículos, cantidades inválidas, ambigüedad, producto desconocido, negocio ajeno y precio contradictorio. Toda venta espera confirmación del rol 2.
5. Entregar resumen de precios/stock para el borrador. Coordinar con R2 detección de cambios de precio entre resumen y confirmación; el RPC actual toma el precio vigente al confirmar.
6. Entregar consulta de ventas del día después de acordar zona horaria. Documentar firmas y errores para R2.

Después: audio e imágenes con referencias de almacenamiento suministradas por R2; luego Bedrock si aporta valor. No dependen del webhook para empezar con archivos fixture. No editar `app/` ni autenticación ni adaptador Infobip. R3 materializa tipos compartidos.

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

Usar `InterpretationRequest`, `InterpretationResult` y `Actor` de [contratos](../integration-contracts.md). P0 solo texto; medios quedan como capacidad posterior explícita.

El módulo de datos ofrece operaciones de dominio transaccionales; nunca expone credenciales privilegiadas al cliente. Los tipos comunes viven en `src/contracts/`; coordina cualquier cambio con los otros roles según `docs/parallel-work.md`.

## Reglas acordadas del POS

- El precio se modifica desde el panel de productos, no durante la venta. Al confirmar una venta, el sistema toma el precio vigente del producto y lo copia a `sale_items.unit_price_cents`; cambios futuros del catálogo no alteran ventas anteriores.
- Cada venta confirmada descuenta existencias en la misma transacción que guarda `sales` y `sale_items`.
- Si no hay existencia suficiente para un renglón, el producto se muestra como **agotado** y la venta no se confirma parcialmente. La interfaz ofrece corregir la cantidad o quitar el producto.
- Una cantidad de stock igual a cero significa agotado. El stock es obligatorio y no puede ser negativo.
- Cada negocio tiene un solo usuario propietario. La identidad de WhatsApp debe vincularse a un negocio de forma única; el cliente nunca puede escoger el `business_id`.
- Alta explícita con nombre y giro obligatorios; guardar el giro como contexto para futuros modelos de creación asistida de productos. Las ventas no dan de alta negocios ni productos automáticamente.
- El resumen de precios lleva versión. Si cambia el catálogo, devolver resumen anterior/nuevo y pedir otra confirmación; la clave idempotente de venta continúa ligada al borrador.
- Validar stock, reservar/descontar, insertar cabecera y renglones y comprobar total deben ocurrir atómicamente para impedir ventas parciales o sobreventa por solicitudes simultáneas.
- La operación está implementada en `record_whatsapp_sale`, invocable únicamente desde servidor con `service_role`. Resuelve el negocio por su `whatsapp_id` único; el número debe venir del remitente normalizado de un webhook autenticado según el proveedor (Infobip para la demo). Ver `src/modules/data/README.md` para el contrato del rol 2.
- La migración 003 agrega registro de eventos por `(provider, provider_message_id)` y borradores ligados al negocio/remitente, con vencimiento inicial de 15 minutos, cancelación y confirmación idempotente. La clave de venta depende del borrador y no del mensaje que confirma.

## No cubre

Endpoints HTTP, sesiones/login, envío y recepción de WhatsApp ni pantallas.

## Criterio de entrega

La primera entrega interpreta fixtures de texto con catálogo inyectado y entrega al rol 2 artículos resueltos o una pregunta de aclaración. Los datos se guardan mediante repositorios existentes y migraciones repetibles. Las ventas esperan confirmación explícita. La interpretación de medios se verifica en una entrega posterior.
