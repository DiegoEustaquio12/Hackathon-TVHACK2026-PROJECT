# Tickets revisados a propuestas de venta o gasto

## Recorrido implementado

Se aceptan tickets de ventas y de compras/gastos, pero **el comerciante elige el tipo antes de preparar una operación**. Una foto por sí sola no registra ventas/gastos, no crea productos ni modifica precios o inventario.

1. Infobip autenticado → negocio con alta explícita → descarga acotada → Supabase Storage privado.
2. OpenAI extrae campos estructurados; el servidor valida el resultado y guarda un snapshot en `receipt_reviews`.
3. WhatsApp muestra el ticket y `TIPO TICKET <token firmado> VENTA`; cambiar la última palabra por GASTO o COMPRA.
4. VENTA resuelve renglones contra el catálogo del negocio y pregunta cada presentación ambigua. Solo con todos los renglones válidos crea un borrador.
5. GASTO prepara la propuesta cancelable existente a partir del total y el comercio del ticket.
6. Ambas rutas requieren una **confirmación textual posterior**. Elegir tipo o presentación no confirma. COMPRA solo identifica el documento y explica que la recepción de compras/entrada de inventario sigue pendiente.

El extractor existente usa Responses API, imagen privada por bytes/data URL, `store:false`, JSON Schema y modelo configurable `gpt-6.1-sol`. Audio conserva `gpt-transcribe`. Se extraen legibilidad, comercio, fecha impresa, moneda, total en centavos, renglones y advertencias. Valores ilegibles son null. No se asume MXN por el símbolo `$` ni se ejecutan instrucciones impresas.

## Validación y aclaraciones

- Moneda MXN explícita, total legible y ninguna advertencia pendiente para preparar propuestas automáticas.
- Venta: todos los renglones deben corresponder a productos existentes, cantidades hasta tres decimales y enteras si se venden por pieza. No se inventan unidades, productos ni conversiones de cajas/botellas.
- La ambigüedad se resuelve por renglón con el menú firmado existente. La selección conserva revisión/operación originales y recarga catálogo; no devuelve un carrito parcial.
- Precios/importe impresos, cuando son legibles, deben coincidir con el catálogo. El total debe reconciliar con los renglones; discrepancias por impuestos/descuentos/redondeo o lectura piden corrección. Los precios se editan fuera de la venta.
- El resumen incluye el total impreso y la cotización vigente. Si cambia precio después del resumen, el RPC existente devuelve anterior/nuevo y exige aprobación de la versión nueva.
- Gasto: total positivo y concepto `Ticket: <comercio>`, visibles antes de confirmar. La fecha contable toma el timestamp del mensaje original; no se interpreta automáticamente la fecha impresa ni se asume una zona horaria. El reporte mantiene la zona explícita del negocio.
- Los datos inciertos se corrigen por texto o mediante otra imagen. No se implementó todavía un editor estructurado del OCR; el snapshot guardado no se reemplaza silenciosamente.

## Persistencia e idempotencia

Migraciones **009–010 aplicadas en local y microai-dev**; 001–010 al día en el dry-run remoto.

009 agrega `receipt_reviews` ligado por FK al negocio y a una imagen registrada. Guarda extracción, hash, clasificación y vencimiento de 15 minutos. Se conserva un snapshot por negocio/hash exacto: reintentos o reenvíos de los mismos bytes reutilizan revisión y no renuevan su plazo. La primera extracción no se sobrescribe por otra respuesta de IA.

La clasificación se serializa en DB. Repetir el mismo tipo es idempotente; intentar usar la misma revisión como venta y gasto devuelve `RECEIPT_KIND_LOCKED`. El tipo queda fijo tras elegirlo, incluso si la propuesta posterior necesita correcciones. Una revisión vencida no se renueva por reenviar los mismos bytes; se informa al comerciante para revisar el borrador existente o usar texto.

La venta usa clave estable `receipt:<reviewId>`; el gasto usa `expense:receipt:<reviewId>` al proponer y la confirmación usa su borrador durable. Dos mensajes de clasificación o aprobación no generan dos operaciones. Cancelar un gasto invalida sus aprobaciones y volver a clasificar ese ticket no lo reactiva. Los borradores de venta mantienen su cancelación/expiración originales.

La deduplicación es por imagen idéntica dentro del negocio: **no detecta fotos/crops distintos del mismo ticket físico ni operaciones manuales equivalentes**. No eliminar revisiones usadas como parte de una limpieza sin conservar la trazabilidad/idempotencia; la política de retención aún está pendiente.

010 retira INSERT/UPDATE/TRUNCATE automáticos de `service_role` sobre snapshots. Se insertan y clasifican solo mediante RPC controlados; anon/authenticated no pueden leer tablas ni ejecutar esos RPC. Se conserva DELETE de servidor para mantenimiento/limpieza de fixtures, sin endpoint público para ello. Los tokens ligan remitente/negocio/revisión y expiran; tokens del formato anterior de solo lectura se rechazan y requieren solicitar revisión nueva.

## Configuración e integración

Los flags permanecen desactivados por defecto:

```dotenv
WHATSAPP_AUDIO_ENABLED=false
WHATSAPP_RECEIPTS_ENABLED=false
OPENAI_RECEIPT_MODEL=gpt-6.1-sol
OPENAI_API_KEY=
INFOBIP_MEDIA_REDIRECT_ORIGINS=
```

El bootstrap ya conecta lector Supabase, repositorio de revisiones y extractores. Antes de activar, configurar/verificar credenciales, URL pública/enrutamiento Infobip, evento real y CDN de la cuenta. La descarga inicial solo permite el origen API configurado y `/whatsapp/1/senders/<receptor>/media/<id>`. Los CDN requieren orígenes HTTPS explícitos y nunca reciben la API key; descarga limitada a 10 MiB, timeout y firma de contenedor. El claim durable envuelve descarga/guardado/IA; reintentos reutilizan el archivo privado y respuestas completadas.

Sigue pendiente una cola/worker con renovación para IA lenta/lotes grandes, retención de datos y reconciliación de objetos huérfanos. La demo web permanece mock e independiente.

## Verificación

```bash
npm run validate
npm run build
python3 scripts/check-role2-local.py
python3 scripts/check-role1-database.py
python3 scripts/check-role1-database.py --remote-ref hfcetxrktdorebepttof
```

- Tipos/lint y 137 pruebas aprobadas; se omiten dos integraciones opt-in por defecto (Supabase local y OpenAI real).
- Integración con Storage/PostgreSQL/Auth locales reales: ticket → borrador sin descuento → confirmación única; precio cambiado exige versión nueva; reenvío de imagen idéntica, gasto confirmado/cancelado, clasificación concurrente y clientes sin privilegios. HTTP externos OpenAI/Infobip simulados.
- SQL local/remoto con rollback: snapshots inmutables, clasificación, identidad cruzada, expiración, permisos y ausencia de efectos contables al clasificar. Dry-run remoto sin pendientes; no se subieron imágenes al Storage alojado para estas comprobaciones.
- No se ejecutó OpenAI real: no hay clave configurada en el entorno revisado. No se comprobó WhatsApp real ni precisión/costo/latencia. Para evaluar archivos autorizados, ver [aceptación OpenAI](openai-acceptance.md).

Fuentes del adaptador existente: [Infobip inbound](https://www.infobip.com/docs/whatsapp/message-types-and-templates/inbound-messages), [SDK audio](https://github.com/infobip/infobip-api-java-client/blob/master/src/main/java/com/infobip/model/WhatsAppWebhookInboundAudioMessage.java), [SDK imagen](https://github.com/infobip/infobip-api-java-client/blob/master/src/main/java/com/infobip/model/WhatsAppWebhookInboundImageMessage.java), [visión OpenAI](https://developers.openai.com/api/docs/guides/images-vision), [salida estructurada](https://developers.openai.com/api/docs/guides/structured-outputs).
