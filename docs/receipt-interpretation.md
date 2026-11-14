# Primera etapa de interpretación de tickets

## Alcance acordado

Se procesan tickets de ventas del comerciante y de compras/gastos. **El sistema pregunta el tipo antes de registrar cualquier operación.** Una foto no autoriza a crear ventas, gastos, productos, cambiar precios ni reponer inventario.

Recorrido implementado: webhook Infobip autenticado → identidad/alta del negocio → descarga acotada desde Infobip → Supabase Storage privado → lectura por referencia y hash → extracción estructurada OpenAI → revisión por WhatsApp → elección explícita VENTA/COMPRA/GASTO.

El extractor usa Responses API, entrada de imagen con bytes privados (data URL), `store:false`, sin herramientas y JSON Schema estricto. Modelo predeterminado configurable: `gpt-6.1-sol`; no sustituye el modelo `gpt-transcribe` de audio. El acceso/disponibilidad del modelo y la precisión real aún no se comprobaron con esta cuenta.

Campos iniciales: legibilidad, comercio, fecha impresa, moneda (MXN/otra/desconocida), total en centavos, renglones con descripción/cantidad/precio unitario/importe y advertencias. Valores ilegibles deben ser null; no se asume MXN por un símbolo `$` aislado. Se validan rangos/tipos localmente. Imagen y texto extraído son datos no confiables; nunca instrucciones de herramientas. Se eliminan saltos de línea y controles de presentación de campos al mostrarlos como resumen.

## Revisión y clasificación

El resumen pregunta si se trata de VENTA, COMPRA o GASTO y entrega:

```text
TIPO TICKET <token firmado> VENTA
```

Cambiar la última palabra por COMPRA o GASTO. El token vence a los 15 minutos, está ligado al remitente y negocio e identifica el archivo. La selección solo orienta el siguiente paso y se conserva como respuesta del evento; no es una aprobación contable ni crea un registro de compras. No se ha implementado una tabla de tickets contables o una clasificación transaccional definitiva.

- VENTA: pide revisar cantidades/presentaciones y usar `Vendí ...`; se resuelve contra el catálogo y se exige resumen/confirmación versionada. Los precios impresos no sobrescriben catálogo.
- GASTO: pide revisar moneda/importe y usar `Gasté ... en ...`; genera propuesta cancelable que requiere confirmación textual.
- COMPRA: explica que la recepción de compras y entradas de inventario todavía no está implementada. No convierte silenciosamente la compra en gasto ni suma stock.

Esta entrega inicia extracción y revisión. La conversión automática de renglones a borradores, correcciones estructuradas, registro de compras, impuestos/descuentos detallados, conciliación y detección de fotos distintas del mismo ticket siguen pendientes. No se promete deduplicación contable por documento físico; se deduplican eventos y cargas por clave de operación.

## Configuración

Requiere migración 008 aplicada (ya comprobada en local y microai-dev), variables Supabase/Infobip de servidor y:

```dotenv
WHATSAPP_RECEIPTS_ENABLED=false
OPENAI_RECEIPT_MODEL=gpt-6.1-sol
OPENAI_API_KEY=
INFOBIP_MEDIA_REDIRECT_ORIGINS=
```

Habilitar explícitamente con `WHATSAPP_RECEIPTS_ENABLED=true` después de configurar/verificar la cuenta. El flag no sustituye URL HTTPS pública ni enrutamiento de Infobip. No requiere nueva migración posterior a 008.

## Descarga segura Infobip

Contrato legacy contrastado con el SDK oficial: `results[].message.{type:'AUDIO'|'IMAGE',url}`. El parser no acepta storageKey/negocio externos como autoridad. La URL inicial debe pertenecer exactamente al origen API configurado y al endpoint `/whatsapp/1/senders/<receptor>/media/<id>`; no se aceptan rutas arbitrarias ni query/credenciales. El GET lleva `Authorization: App ...`, timeout total de descarga 10 s, límite durante streaming de 10 MiB y validación MIME/firma de contenedor.

Infobip puede devolver redirección a un CDN. Los orígenes HTTPS de descarga finales deben autorizarse explícitamente en `INFOBIP_MEDIA_REDIRECT_ORIGINS` (lista separada por comas). Las redirecciones nunca reciben el API key, no pueden volver al origen API y se limitan en cantidad. No abrir dominios comodín para hacer pasar una prueba. Si la cuenta usa otro esquema/origen inicial hay que contrastar un evento real y ajustar el adaptador de forma explícita.

El archivo se guarda antes de llamar a IA. Si falla el procesamiento, un reintento puede encontrar la referencia guardada y no volver a descargar el medio temporal de Infobip. El claim durable envuelve descarga, almacenamiento e interpretación; eventos ya completados reproducen su respuesta sin repetir IA ni efectos. Los flags desactivados no descargan medios. El alta/identidad se resuelve antes de cualquier descarga.

## Verificación y límites operativos

- Tipos/lint y 110 pruebas aprobadas; build aprobado.
- Integración local con Storage/PostgreSQL/Auth reales: webhook AUDIO/IMAGE autenticado, descarga y guardado, replays, borrador de audio y confirmación única, ticket y elección de tipo sin ventas/gastos. Los HTTP externos de OpenAI/Infobip están simulados.
- Remoto: migración 008 aplicada; buckets privados, límites, RLS y políticas restrictivas comprobados. Dry-run sin pendientes y aceptación SQL con rollback aprobada. No se subieron archivos de prueba al Storage alojado en esta entrega.
- No se comprobaron OpenAI real ni WhatsApp real. No hay credenciales operativas ni vínculo Vercel local en el entorno revisado. No se midió precisión/costo/latencia. No se habilitaron flags ni se envió contenido a terceros durante las pruebas.
- Pipeline síncrono: descarga Infobip 10 s, descarga Storage 10 s y llamada IA 20 s; el resto de operaciones también consume tiempo. Sigue pendiente una cola/worker con renovación para trabajo lento y lotes grandes. Las expiraciones mantienen los errores reintentables y el fencing del almacenamiento; no garantizan que un lote grande termine dentro del límite HTTP.

Fuentes consultadas: [Infobip inbound](https://www.infobip.com/docs/whatsapp/message-types-and-templates/inbound-messages), [SDK oficial audio](https://github.com/infobip/infobip-api-java-client/blob/master/src/main/java/com/infobip/model/WhatsAppWebhookInboundAudioMessage.java), [SDK oficial imagen](https://github.com/infobip/infobip-api-java-client/blob/master/src/main/java/com/infobip/model/WhatsAppWebhookInboundImageMessage.java), [visión OpenAI](https://developers.openai.com/api/docs/guides/images-vision), [salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs), [modelo](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
