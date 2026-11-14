# Entrega R2

`createInfobipWebhook(deps)` devuelve `handleInfobipWebhook({rawBody, headers})` -> `{status, body}`. R3 monta la ruta HTTPS, conserva el cuerpo y aplica límites antes de leerlo. No hay endpoint público creado por este módulo.

Autenticación: `basicWebhookAuthenticator(username, password)` requiere el mismo perfil Basic en Infobip. Sin perfil configurado no habilitar la ruta. No es una firma Meta. Credenciales exclusivamente de servidor. El constructor del proveedor recibe baseUrl HTTPS Infobip, apiKey, sender y timeoutMs opcional. No usa secretos por defecto ni registra cuerpos.

Texto P0: esquema legacy `results[].{messageId,from,to,receivedAt,message:{type:'TEXT',text}}`. El parser ignora metadatos externos de negocio, rechaza destinatarios inesperados y reportes de entrega. Audio, imágenes y botones se responden como no soportados; no se descargan URLs del evento. Fixture sintético en tests/role2.test.ts, no captura de entrada real.

El proveedor usa `/whatsapp/1/message/text` y `/whatsapp/1/message/template`. El éxito es aceptación del proveedor, no entrega. Texto requiere ventana entrante de 24 horas; para fuera de ventana usar plantilla aprobada y consentimiento comprobado por quien invoca el servicio. No hay envío automático proactivo.

## Conexión con R1

`createConversationRepositories(client)` envuelve los RPC existentes. Inyectar además `resolveActor`, `interpret` y `summarize` desde R1. Confirmaciones requieren `CONFIRMAR <draft UUID>`; un sí aislado no opera. La clave de borrador es estable `infobip:<mensaje original>`; confirmaciones de distintos mensajes pasan el mismo borrador a la confirmación atómica R1.

`createDurableProcessing(store)` coordina claims, replays y fallos. R1 debe implementar `ProcessingStore` con persistencia de payload/respuesta, unicidad proveedor+ID, identidad inmutable, lease y fencing transaccionales. `registerInboundEvent` actual no basta: no almacena contenido ni respuesta ni ofrece claim/complete. No se proporciona un falso almacenamiento en memoria para producción. La respuesta queda persistida antes de enviarla; un fallo al enviar reutiliza respuesta y no reinterpreta. Reintentar puede duplicar una respuesta en WhatsApp; no garantiza exactly-once de transporte.

IMPORTANTE: el resumen actual y la confirmación R1 no congelan precios. Mantener catálogo sin cambios durante conversaciones hasta que R1 ofrezca cotización/versionado y comparación atómica en confirmación. No habilitar edición concurrente de precios en producción.

## Autenticación web

`createSessionService(store)` implementa `SessionVerifier` de R3. Canjea un enlace opaco una vez y emite cookie __Host-knectan Secure/HttpOnly, con vencimiento de seis horas y revocación comprobada en cada solicitud. Store debe persistir solo hashes SHA256, canjear enlaces atómicamente y resolver identidad por vínculo de servidor. El emisor de enlaces debe verificar previamente la propiedad del número/usuario. No hay alta automática ni UI de login ni implementación de tablas en R2.

## Pendientes de integración real

- R1: lookup, intérprete/catálogo, ProcessingStore, IdentityStore, cotización atómica.
- R3: ruta, conexión del SessionVerifier, configuración secreta y URL pública.
- Comprobar perfil y enrutamiento global en Infobip; entrada/respuesta real y consentimiento no se han verificado aquí.
- Distribuidores: usar identidad Supabase verificada para emitir/vincular sesiones; este módulo no reemplaza login Supabase.

Fuentes oficiales consultadas: https://www.infobip.com/docs/developer-resources/api-fundamentals/webhooks y https://www.infobip.com/docs/tutorials/send-an-interactive-product-message-with-whatsapp-api ; SDK oficial https://github.com/infobip/infobip-api-java-client/blob/master/whatsapp.md . Confirmar el payload del perfil de cuenta con un evento real antes de activar producción.
