# Integración R2

`createRole2Service(config)` en `orchestration/service.ts` compone Infobip, conversación, alta, intérprete real R1, borradores/versiones y persistencia Supabase. Devuelve `handleInfobipWebhook({ rawBody, headers })` -> `{status, body}`. R3 monta HTTPS conservando el cuerpo, con límites antes de leerlo. No hay ruta pública creada por R2.

Configuración de servidor requerida: client Supabase privilegiado, baseUrl HTTPS *.api.infobip.com, apiKey, sender, webhookUsername, webhookPassword (24 caracteres mínimo), onboardingSecret (32 bytes mínimo). Sin valores por defecto. Configurar el mismo perfil Basic en Infobip; no es firma Meta. Mantener secretos fuera de Git/logs. Ventana de texto de 24 horas; las plantillas requieren aprobación y consentimiento por parte del llamador.

## Recorrido

- Remitente sin alta completa: pedir `ALTA Nombre | Giro`. Mostrar resumen y pedir `CONFIRMAR ALTA <token firmado>`. Token ligado a remitente, nombre, giro y vencimiento de 15 minutos. No registrar al primer Hola ni inferir giro. Cancelación no guarda cambios. La identidad proviene exclusivamente del webhook autenticado.
- Negocio existente: `findBusinessByWhatsApp` y `interpretForWhatsApp` resuelven catálogo y actor en servidor.
- Venta: crear borrador con clave `infobip:<mensaje-original>` y mostrar su `quote` guardada, no un cálculo separado.
- Confirmar: `CONFIRMAR <draftId> <quoteVersion>`. R1 comprueba remitente, versión y precios atómicamente. `price_changed` y `quote_outdated` muestran cotización y piden confirmación nueva; nunca anuncian venta registrada.
- Cancelar: `CANCELAR <draftId>`. Repetir confirmaciones conserva la idempotencia de R1.

## Persistencia entregada para revisión R1

`auth/storage/role2.sql` es una propuesta aditiva que R1 debe revisar y convertir en la siguiente migración. No se aplicó a ninguna base. Crea tablas privadas y funciones para claims con leases de 60 segundos, payload/respuesta durable, comparación de identidad, fencing, canje atómico de enlaces y sesiones. Requiere service_role; anon/authenticated no pueden acceder. R1 debe acordar retención/borrado de payloads por contener mensajes.

`createSupabaseProcessingStore` usa esas funciones; `createDurableProcessing` persiste respuesta antes de enviarla y reproduce respuestas guardadas ante reintentos. Claims ocupados o errores retornan 503. El procesamiento debe terminar antes de vencer el lease; recuperación se activa al reenviar el evento. No hay worker de barrido autónomo aún. No garantiza exactamente una respuesta WhatsApp ante fallos de red. Los efectos de ventas se deduplican por borrador en R1.

`createSupabaseIdentityStore` conecta `createSessionService` a almacenamiento real: hashes SHA256, canje de una sola vez, expiración y revocación. `issueVerifiedIdentityLink` solo debe recibir identidad de autenticación Supabase verificada en servidor. R3 conecta login y SessionVerifier; el módulo no autoriza identidad enviada por formularios. No enviar enlaces automáticamente.

## Verificación y pendientes

Pruebas en `tests/role2*.test.ts`: parser/autenticación, venta confirmada, cambio/versionado de precios, alta firmada/expirada/remitente ajeno, replay y sesiones. Intérprete R1 real probado con catálogo fixture. SQL Supabase nuevo pendiente de ejecución y pruebas de concurrencia por R1. HTTP/login público, enrutamiento Infobip, consentimiento y WhatsApp real pendientes de R3/configuración de cuenta. Audio, imágenes, reportes, gastos y botones quedan fuera de P0 texto.

Fuentes del adaptador: https://www.infobip.com/docs/developer-resources/api-fundamentals/webhooks ; https://www.infobip.com/docs/tutorials/send-an-interactive-product-message-with-whatsapp-api ; https://github.com/infobip/infobip-api-java-client/blob/master/whatsapp.md . El parser usa esquema legacy `results[].{messageId,from,to,receivedAt,message:{type,text}}`; contrastar con evento real de la cuenta antes de habilitar producción.
