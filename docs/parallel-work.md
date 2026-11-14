# Trabajo paralelo: tres roles

Las instrucciones detalladas están separadas por persona: [Rol 1](roles/rol-1-ia-multimodal-y-datos.md), [Rol 2](roles/rol-2-orquestacion-auth-mensajeria.md) y [Rol 3](roles/rol-3-frontend-backend-despliegue.md).

## Reglas de coordinación

- Trabajar en ramas separadas y hacer PRs pequeños. No editar simultáneamente el mismo archivo; los contratos compartidos se acuerdan primero y se cambian mediante PR coordinado.
- Los tres roles pueden iniciar en paralelo con los contratos de este documento. El rol 3 publica mocks/adaptadores para que frontend y despliegue no esperen a proveedores externos.
- Mantener módulos de proveedor detrás de interfaces. Nunca incluir secretos en el navegador ni registrar tokens, audio o imágenes en logs.
- Acuerdo monetario inicial: cantidades en MXN como enteros en centavos (`*_cents`); timestamps ISO UTC; errores con `{ code, message }`.
- Los contratos TypeScript compartidos viven en `src/contracts/`; propietario primario: rol 3. Los cambios se discuten por PR.

## Rol 1 — IA multimodal, interpretación y datos

**Objetivo:** interpretar texto, audio e imágenes con salida estructurada y persistir el dominio del negocio.

**Responsabilidades:** parser determinista primero; adaptador IA (Bedrock/modelo configurable) como respaldo; entrada de audio e imagen (transcripción/OCR/interpretación); validación y nivel de confianza; esquema, migraciones SQL, índices, RLS y consultas/repositorios de ventas, artículos, gastos e inventario.

**Carpetas:** `src/modules/interpretation/`, `src/modules/media/`, `src/modules/data/`, `supabase/migrations/`.

**Entrega/contrato:** `InterpretationRequest` acepta `{ text?, media: { kind: "audio"|"image", storageKey, mimeType }[] }`; `InterpretationResult` devuelve `{ intent, confidence, data, needsConfirmation, clarification? }`. El módulo de datos ofrece operaciones de dominio transaccionales; nunca expone credenciales de servicio al cliente.

**Fuera de este rol:** endpoints HTTP, sesiones/login, envío y recepción de WhatsApp, pantallas.

## Rol 2 — Orquestación de IA, autenticación y mensajería

**Objetivo:** conectar canales e identidad con interpretación y operaciones del negocio.

**Responsabilidades:** flujo de conversación que invoca al rol 1, estrategia de confirmación antes de persistir entradas inciertas; autenticación de distribuidores y canje de enlace temporal para comerciantes; sesiones seguras; webhook WhatsApp (verificación, firma, deduplicación), respuestas y política de consentimiento. Es propietario de integración con proveedores de identidad/mensajería.

**Carpetas:** `src/modules/orchestration/`, `src/modules/auth/`, `src/modules/messaging/`; rutas HTTP compartidas se acuerdan con rol 3.

**Contrato:** recibe identidad ya resuelta como `Actor { businessId, userId?, channel }`; llama interpretación y repositorios por interfaces, sin SQL directo. Webhooks idempotentes por ID del evento. Debe responder rápido al proveedor y procesar el trabajo lento por una cola/adaptador; para demo se permite procesamiento síncrono acotado con límite de tiempo.

**Fuera de este rol:** dueño del esquema de negocio, componentes visuales y despliegue.

## Rol 3 — Frontend, backend HTTP y despliegue

**Objetivo:** construir las interfaces, exponer contratos HTTP y mantener ejecutable e integrable la app.

**Responsabilidades:** chatbot web y panel distribuidor; formularios accesibles con captura de texto/audio/imagen; rutas API Next.js y validación de request/response; contratos compartidos y mocks; configuración de entorno, CI/build y despliegue Vercel.

**Carpetas:** `app/`, `components/`, `src/contracts/`, `src/modules/http/`, configuración raíz y documentación de despliegue.

**Contrato:** endpoints validan payloads (Zod), obtienen el actor desde sesión verificada y no aceptan `businessId` confiado del navegador. Usan servicios de orquestación/dominio por interfaces. Mantiene un modo mock local para que la interfaz avance antes de que estén listas las integraciones.

**Fuera de este rol:** prompts/modelos, políticas de WhatsApp, esquema/migraciones y lógica contable.

## Secuencia de integración

1. **Día 0, en paralelo:** acordar tipos de `Actor`, `InterpretationRequest/Result`, `SaleInput` y errores; rol 3 prepara endpoints mock, rol 1 define migración de venta mínima, rol 2 define puertos de auth/mensajería.
2. **Integración temprana:** rol 1 entrega repositorio transaccional + parser fixture; rol 2 conecta conversación a puertos; rol 3 conecta UI a endpoints estables.
3. **End-to-end:** reemplazar mocks por implementaciones reales mediante adaptadores; validar registro y consulta de una venta desde web, luego canal WhatsApp y medios.
4. **Cierre:** desplegar demo web sin exigir Bedrock ni credenciales de Meta; las capacidades externas quedan configurables.

## Árbol sugerido por propiedad

```text
app/                         # R3: páginas y adaptadores HTTP
components/                  # R3: UI
src/contracts/               # R3 coordina; cambios acordados por todos
src/modules/interpretation/  # R1
src/modules/media/            # R1
src/modules/data/             # R1
src/modules/orchestration/    # R2
src/modules/auth/             # R2
src/modules/messaging/        # R2
supabase/migrations/          # R1
docs/                         # contratos y decisiones compartidas
```
