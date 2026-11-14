# Integración R2

`createRole2Service(config)` compone Infobip, conversación, alta, intérprete R1, borradores/versiones y persistencia Supabase. Devuelve `handleInfobipWebhook({ rawBody, headers })` -> `{status, body}`. Ya está montado bajo `POST /api/webhooks/infobip`; configurar/habilitar y desplegar según `docs/DEPLOYMENT.md`. No depende de cookies ni mocks web.

Configuración de servidor requerida: client Supabase privilegiado, baseUrl HTTPS *.api.infobip.com, apiKey, sender, webhookUsername, webhookPassword (24 caracteres mínimo), onboardingSecret (32 bytes mínimo). Sin valores por defecto. Configurar el mismo perfil Basic en Infobip; no es firma Meta. Mantener secretos fuera de Git/logs. Ventana de texto de 24 horas; las plantillas requieren aprobación y consentimiento por parte del llamador.

## Recorrido

- Remitente sin alta completa: pedir `ALTA Nombre | Giro`. Mostrar resumen y pedir `CONFIRMAR ALTA <token firmado>`. Token ligado a remitente, nombre, giro y vencimiento de 15 minutos. No registrar al primer Hola ni inferir giro. Cancelación no guarda cambios. La identidad proviene exclusivamente del webhook autenticado.
- Negocio existente: `findBusinessByWhatsApp` y `interpretForWhatsApp` resuelven catálogo y actor en servidor.
- Venta: crear borrador con clave `infobip:<mensaje-original>` y mostrar su `quote` guardada, no un cálculo separado.
- Confirmar: `CONFIRMAR <draftId> <quoteVersion>`. R1 comprueba remitente, versión y precios atómicamente. `price_changed` y `quote_outdated` muestran cotización y piden confirmación nueva; nunca anuncian venta registrada.
- Cancelar: `CANCELAR <draftId>`. Repetir confirmaciones conserva la idempotencia de R1.

## Persistencia entregada para revisión R1

La propuesta se incorporó a `supabase/migrations/202611140007_role2_durable_storage.sql`, aplicada y probada en local. `auth/storage/role2.sql` es solo un puntero; no aplicarlo aparte. Incluye tablas privadas para eventos durables, leases/fencing, sesiones/enlaces y propuestas cancelables de gastos. Falta aplicar al entorno alojado y configurar retención operativa.

`createSupabaseProcessingStore` usa esas funciones; `createDurableProcessing` persiste respuesta antes de enviarla y reproduce respuestas guardadas ante reintentos. Claims ocupados o errores retornan 503. El procesamiento debe terminar antes de vencer el lease; recuperación se activa al reenviar el evento. No hay worker de barrido autónomo aún. No garantiza exactamente una respuesta WhatsApp ante fallos de red. Los efectos de ventas se deduplican por borrador en R1.

`createSupabaseIdentityStore` conecta `createSessionService` a almacenamiento real: hashes SHA256, canje de una sola vez, expiración y revocación. `issueVerifiedIdentityLink` solo debe recibir identidad de autenticación Supabase verificada en servidor. R3 conecta login y SessionVerifier; el módulo no autoriza identidad enviada por formularios. No enviar enlaces automáticamente.

## Verificación y pendientes

`npm run validate` comprueba tipos, lint y pruebas unitarias. `python3 scripts/check-role2-local.py` ejecuta la prueba opt-in con Supabase real local y solo el HTTP saliente Infobip simulado: claims/confirmaciones simultáneas, replay, precios y gasto cancelado. El SQL adicional está en `supabase/checks/role2-storage.sql`. Hay reportes y gastos de texto integrados; pendientes de configuración/despliegue, WhatsApp real, login web, audio/imágenes y botones nativos.

Las selecciones usan `ELEGIR <token> <opción>` y conservan texto/clave originales y decisiones por renglón. No filtrar todo el catálogo al elegir una presentación. El token se muestra una sola vez y las respuestas largas se dividen en mensajes de hasta 4096 caracteres.

Gastos: se persiste la propuesta antes de pedir confirmación. `CANCELAR GASTO <token>` revoca una propuesta; `CANCELAR GASTO` revoca todas las pendientes del negocio. Una confirmación antigua nunca registra un gasto cancelado. No revierte gastos confirmados.

Errores de negocio como `OUT_OF_STOCK`, `DRAFT_EXPIRED` y `EXPENSE_DRAFT_CANCELLED` se convierten en explicaciones guardadas y enviadas al comerciante. Fallos de base/proveedor permanecen reintentables, sin exponer mensajes internos.

Fuentes del adaptador: https://www.infobip.com/docs/developer-resources/api-fundamentals/webhooks ; https://www.infobip.com/docs/tutorials/send-an-interactive-product-message-with-whatsapp-api ; https://github.com/infobip/infobip-api-java-client/blob/master/whatsapp.md . El parser usa esquema legacy `results[].{messageId,from,to,receivedAt,message:{type,text}}`; contrastar con evento real de la cuenta antes de habilitar producción.
