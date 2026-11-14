# Rol 2 — Orquestación de IA, autenticación y mensajería

## Objetivo

Conectar canales e identidad con interpretación y operaciones del negocio. Para la demo de Knectan, priorizar **WhatsApp mediante Infobip** con un diseño que permita cambiar de proveedor sin reescribir la lógica del negocio.

## Trabajo inmediato en paralelo

1. Leer [guía paralela](../parallel-work.md) y [contratos](../integration-contracts.md); R3 materializa los tipos TS.
2. Implementar adaptador, autenticación y parser Infobip con fixtures sanitizados. Contrastar el esquema con documentación/evento real.
3. Implementar conversación con intérprete mock y repositorios inyectados de R1; no crear tablas paralelas de eventos o borradores.
4. Entregar temprano a R3 el handler y sus contratos, sin esperar al intérprete real. R3 lo monta bajo `app/`.
5. Integrar intérprete R1 y probar mensajes libres por URL pública R3. Mientras tanto avanzar con fixtures.

R1 ya entrega repositorios de eventos y borradores. R2 controla procesamiento/reintentos y solicita nuevos métodos de persistencia a R1. El registro de metadatos no es una cola: no confirmar aceptación y descartar contenido sin procesamiento o persistencia durable. Si falta vínculo de negocio, ofrecer alta segura y no operar.

Confirmar siempre la venta tras mostrar resumen; ligar cada confirmación al borrador y remitente. Varias confirmaciones del mismo borrador no deben crear nuevas ventas.

## Responsabilidades

- Implementar el flujo conversacional que invoca los servicios del rol 1.
- Solicitar aclaración para entradas inciertas y confirmación explícita de toda venta antes de persistirla.
- Implementar autenticación de distribuidores y canje de enlace temporal para comerciantes.
- Crear sesiones seguras con expiración y revocación.
- Implementar la integración de WhatsApp: recepción de webhooks, autenticación apropiada al proveedor, validación, deduplicación, respuestas y consentimiento.
- Mantener adaptadores de proveedores separados: **Infobip (prioritario para la demo)** y Meta Cloud API (opcional, pendiente de desbloqueo).
- Dejar WhatsApp Flows como integración posterior: recepción de respuestas `interactive` / `nfm_reply`, validación y traducción a comandos de dominio. Si se requieren Flows dinámicos, coordinar endpoint HTTPS `data_exchange` con rol 3 y seguir el protocolo de Meta.
- No registrar tokens, claves ni contenido sensible en logs.

## Carpetas a cargo

- `src/modules/orchestration/`
- `src/modules/auth/`
- `src/modules/messaging/`

Las rutas HTTP se acuerdan con el rol 3; no editar sus archivos simultáneamente.

## Contratos de integración

Resolver `Actor { businessId, verifiedSender, channel: 'whatsapp' }` según el contrato compartido. Llama interpretación y repositorios mediante interfaces; no implementa SQL directo.

Los webhooks son idempotentes por proveedor e ID del evento. Deben responder rápido al proveedor y delegar el trabajo lento a una cola/adaptador. Para la demo se permite procesamiento síncrono acotado con límite de tiempo. La confirmación por mensajes se liga a un borrador y remitente verificado; nunca debe aceptar como autoridad un `business_id` editable. El rol 1 entrega `registerInboundEvent`, `createSaleDraft`, `confirmSaleDraft` y `cancelSaleDraft` en `src/modules/data/conversations.ts`; consultar `src/modules/data/README.md` antes de integrar. Cada borrador tiene una clave de operación estable independiente del ID de los mensajes que lo confirman.

Los tipos comunes viven en `src/contracts/`; coordina cambios con los otros roles según `docs/parallel-work.md`.

## Estado verificado de la integración (14 de noviembre de 2026)

| Proveedor | Estado | Decisión |
| --- | --- | --- |
| **Infobip WhatsApp** | Remitente de prueba activado/conectado. Un envío con la API de plantillas devolvió `PENDING_ENROUTE` y el destinatario confirmó que **recibió el mensaje en WhatsApp real**. | **Camino prioritario** para el hackathon. |
| Meta Cloud API | Prueba falló con código `131031 Business Account locked`; Meta solicitó verificación empresarial. | No bloquear la demo esperando el desbloqueo. |
| Twilio | No se confirmó la activación de la sesión WhatsApp Sandbox. | Fuera del camino crítico. |
| Knectan en Vercel | Todavía **sin URL pública**. | El rol 3 prepara despliegue y ruta HTTP. |

**Importante:** el envío real por Infobip está comprobado; **no** está comprobada todavía la recepción de mensajes entrantes ni una respuesta automática. La cuenta de prueba puede limitar destinatarios y funcionalidades. En Infobip también aparece un remitente con nombre Knectan y estado de conexión «Desconocido»: no usarlo hasta verificar su estado; el remitente funcional es el de prueba de Infobip.

## Prioridad 1 — Adaptador Infobip y pruebas locales

Implementar en `src/modules/messaging/` sin esperar a que exista el despliegue:

1. Definir un puerto `MessagingProvider` con operaciones `sendText` y `sendTemplate` y errores normalizados. Mantener los detalles HTTP fuera de orquestación.
2. Crear `InfobipMessagingProvider` usando `fetch` de servidor, timeouts, validación de respuestas y tratamiento de errores. El envío de plantilla usa `POST /whatsapp/1/message/template`; las respuestas de texto dentro de la ventana de conversación requieren confirmar el endpoint y formato oficial aplicable.
3. Implementar el evento normalizado `InboundMessage` documentado en `docs/integration-contracts.md`. Nunca confiar en un `businessId` del payload externo.
4. Crear `parseInfobipInbound` con validación Zod y pruebas de fixtures. **No inventar el esquema definitivo**: comprobarlo con documentación de Infobip o un evento entrante real antes de cerrar el parser.
5. Usar `registerInboundEvent` de R1 para persistir unicidad por `(provider, providerMessageId)`. Implementar recuperación de pendientes y coordinación de workers; la tabla no es una cola y el registro no significa procesamiento completado.
6. Añadir mocks para poder probar orquestación sin credenciales externas.

### Variables de entorno de servidor propuestas

Agregar al `.env.example` **solo con acuerdo del rol 3** (propietario de configuración raíz):

```dotenv
WHATSAPP_PROVIDER=infobip
INFOBIP_BASE_URL=https://jrn1yv.api.infobip.com
INFOBIP_API_KEY=
INFOBIP_WHATSAPP_SENDER=447860088970
INFOBIP_WEBHOOK_SECRET=
```

La clave API **ya fue expuesta durante una prueba manual**: revocar esa clave y crear una nueva antes de conectarla al repositorio o al despliegue. Guardar la nueva exclusivamente en variables de entorno del servidor. No pegar claves en Codex, commits, capturas ni logs. El valor `INFOBIP_WEBHOOK_SECRET` es una propuesta para autenticación acordada con el rol 3; **no asumir** que Infobip firma webhooks con ese secreto. Usar el mecanismo oficial de seguridad del proveedor cuando se haya comprobado.

## Prioridad 2 — Orquestación e identidad

- Resolver `Actor` a partir de un vínculo confiable entre remitente, usuario y negocio; si no hay vínculo, ofrecer un flujo de vinculación seguro y no ejecutar operaciones.
- Implementar `mensaje -> interpretación rol 1 -> aclaración si hace falta -> borrador/resumen -> confirmación explícita -> operación de dominio rol 1 -> respuesta por el canal de origen`.
- Persistir estados de confirmación con expiración, asociándolos al usuario y negocio correctos.
- Aplicar consentimiento y las reglas de ventana de conversación/plantillas aprobadas de WhatsApp. No tratar `PENDING_ENROUTE` como entrega confirmada; gestionar estados finales si Infobip los reporta.
- Mantener interfaces para dependencias de rol 1 no terminadas, con mocks tipados para trabajar en paralelo.

## Prioridad 3 — Recepción HTTP por Infobip

**Coordinar con rol 3** la ruta propuesta `POST /api/webhooks/infobip` en Next.js. Es un nombre de ejemplo para el proyecto, **no es una URL existente**. El rol 2 implementa un servicio reutilizable `handleInfobipWebhook`, el parser y las pruebas; el rol 3 monta la ruta bajo `app/` y despliega Vercel.

Requisitos:

- HTTPS público, límites de tamaño, validación de contenido, autenticidad del webhook según capacidad documentada de Infobip, idempotencia y manejo de reintentos.
- Responder rápido una vez aceptado el evento de manera segura para su procesamiento; no bloquear el webhook con IA lenta cuando se disponga de cola.
- No aceptar como autoridad identificadores de negocio editables desde el evento entrante.
- Logs mínimos, sin tokens ni mensajes completos; evitar duplicar ventas cuando Infobip reintente.

### Lo observado en el portal de Infobip

Se localizó `Canales y números -> Números -> Detalles -> Configuración de tráfico entrante -> Editar palabra clave` con la opción **«Reenviar hacia HTTP»**, un campo **URL** y un selector **Procesador** (se mostró `MO_OTT_CONTACT`). También existe **«Solicitar suscripción»**, que refiere a una suscripción con webhook.

**Precaución:** esa configuración se estaba editando para la palabra clave `JORGESM03`. **No asumir que recibe todos los mensajes** como «Hola» o «Vendí 3 refrescos». Antes de guardar cualquier cambio, verificar cómo configurar el enrutamiento global/default o la suscripción de mensajes entrantes para el remitente de prueba. Comprobar también que el plan de prueba permita recibir mensajes. No introducir `localhost` ni una URL inventada en el campo de Infobip.

Hasta tener URL pública, usar fixtures y pruebas locales; si el equipo lo aprueba, un túnel HTTPS temporal puede servir para probar el webhook.

## Prioridad 4 — Autenticación

- Autenticación segura de distribuidores mediante el mecanismo acordado con rol 3 y Supabase.
- Canje de enlaces temporales de comerciantes: tokens opacos, de un solo uso, con expiración y revocación.
- Sesiones ligadas al actor y negocio verificados; cookies seguras cuando aplique.
- Nunca confiar en `businessId` del navegador ni en identificadores editables en un mensaje de WhatsApp.

## Plan de pruebas de aceptación

1. **Unitarias:** adaptador Infobip, validación de webhook, errores, deduplicación y vínculo de identidad.
2. **Integración con mocks:** `Hola` -> bienvenida; `Vendí 3 refrescos` -> interpretación, resumen y confirmación explícita antes de la venta; evento duplicado y confirmaciones repetidas -> una sola operación.
3. **WhatsApp saliente real:** enviar al destinatario verificado y comprobar recepción efectiva, no solo respuesta `PENDING_ENROUTE`.
4. **WhatsApp entrante real:** una vez desplegado el webhook y configurado el enrutamiento correcto, enviar un mensaje desde WhatsApp, comprobar el evento recibido y la respuesta automática. Si el plan de prueba no admite entrada, documentar explícitamente esa limitación.
5. Ejecutar build y pruebas existentes; no romper contratos ni carpetas de otros roles.

## Entregables para el rol 3

- Interfaces de envío y recepción y firma de `handleInfobipWebhook`.
- Lista de variables de entorno necesarias **sin valores secretos**.
- Contrato y ejemplos sanitizados del evento normalizado y respuestas.
- Acuerdo sobre ruta HTTP, seguridad del webhook, almacenamiento de deduplicación y despliegue.
- PR pequeño con pruebas y documentación; no editar directamente `app/`, `src/contracts/` o configuración raíz sin coordinación.

## Instrucciones para iniciar con Codex

1. Leer `docs/parallel-work.md`, este documento y los archivos de rol 1 y rol 3.
2. Inspeccionar estructura, paquetes y pruebas existentes. Crear una rama propia del rol 2.
3. Empezar por puertos, adaptador Infobip, parser y tests; después orquestación, confirmaciones y autenticación.
4. No crear ni modificar rutas HTTP de rol 3 sin acuerdo. Entregar un servicio que pueda ser montado por su ruta.
5. No afirmar que la recepción entrante funciona hasta comprobar un webhook real. No usar credenciales reales en pruebas automatizadas.
6. Documentar pendientes y abrir PR; coordinar con rol 1 la persistencia y con rol 3 el endpoint público.

## No cubre

Propiedad del esquema de negocio, componentes visuales ni despliegue.

## Criterio de entrega

Un mensaje entrante puede asociarse a un negocio autenticado, pasar por interpretación, pedir confirmación cuando haga falta y responder por el canal de origen sin duplicar operaciones. Para la demo se prioriza Infobip; se reporta por separado qué pruebas se completaron con mocks y cuáles se verificaron con WhatsApp real.

## Entrega de implementación local R2

Implementación en `src/modules/messaging/`, `src/modules/orchestration/` y `src/modules/auth/`. Ver integración y pendientes en `src/modules/messaging/README.md`.

Entregado: adaptador Infobip, parser de texto, autenticación Basic configurable, handler reutilizable, coordinación de almacenamiento durable mediante puerto, conversación con resumen/confirmación explícita, adaptador de borradores R1 y sesiones opacas con canje/revocación mediante almacenamiento inyectado.

Comprobado: 21 pruebas unitarias/integración con mocks del proyecto, typecheck, lint de archivos R2 y build. El lint global presenta advertencia preexistente por `next-env.d.ts` ignorado. No se ha probado WhatsApp real ni persistencia real de sesiones/claims; faltan los adaptadores R1 y conexión HTTP R3. La confirmación frente a edición concurrente de precios requiere comparación atómica de R1 antes de habilitarla.
