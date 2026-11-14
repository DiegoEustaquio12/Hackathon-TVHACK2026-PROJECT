# Almacenamiento privado de audios e imágenes

## Decisión del MVP

**Se utilizará Supabase Storage para almacenar audios e imágenes.** PostgreSQL de Supabase guardará sus referencias y metadatos; los archivos binarios no se guardan como base64 en tablas. OpenAI sigue siendo el proveedor de transcripción. AWS S3 queda como alternativa futura, evaluable según necesidades/costos; no es dependencia del MVP ni requiere configuración ahora.

La interfaz `TrustedAudioReader` permite sustituir el proveedor de almacenamiento posteriormente. Cambiar a S3 requeriría otro adaptador y una migración de archivos/referencias; no sucede automáticamente al crecer.

## Migración 008 y seguridad

`202611140008_private_business_media.sql` crea:

| Recurso | Uso |
| --- | --- |
| Bucket privado `business-audio` | OGG, MPEG/MP3, MP4/M4A, WAV, WebM y FLAC |
| Bucket privado `business-images` | JPEG, PNG y WebP |
| Tabla privada `business_media` | Negocio, clave de operación, tipo, bucket, objeto, MIME, tamaño y SHA-256 |

Ambos buckets limitan cada objeto a 10 MiB. `business_media` tiene RLS y no concede acceso a `anon`/`authenticated`. Políticas restrictivas de Storage deniegan a esos clientes acceso directo a ambos buckets, incluso si otra política permisiva fuera más amplia. El acceso se realiza desde servidor con `service_role`; por ello **el servidor también verifica remitente y negocio**, sin confiar solo en RLS. Las claves privilegiadas nunca se entregan al navegador.

Las rutas de objetos se generan en servidor como `<businessUUID>/<audio|image>/<objectUUID>`. Una ruta con el prefijo correcto no basta para acceder: se exige registro de metadatos del mismo negocio y se comprueba la identidad por el número verificado del webhook. El lector rechaza buckets públicos accidentalmente y no genera URLs públicas ni firmadas.

Estado de esta entrega: **008 aplicada y comprobada en local y en `microai-dev`**. El dry-run remoto posterior quedó sin migraciones pendientes. Se comprobaron buckets privados, límites, RLS y políticas restrictivas. No hacer reset.

## API de servidor

`src/modules/media/supabase-storage.ts` expone:

```typescript
const mediaStore = createSupabaseMediaStore({
  client: privilegedSupabaseClient,
  url: process.env.SUPABASE_URL!,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

// actor procede de identidad verificada; los bytes, de descarga acotada desde Infobip.
const reference = await mediaStore.save(actor, {
  kind: 'audio', // o 'image'
  operationKey: `infobip:${providerMessageId}:audio`,
  mimeType: 'audio/ogg',
  bytes,
});

const audioReader = createSupabaseAudioReader(mediaStore);
```

Las funciones deben importarse desde servidor. `save` verifica alta/negocio, límite, MIME y firma del contenedor; genera objeto nuevo sin sobrescritura. La clave de operación es única por negocio: reintentar el mismo contenido devuelve la referencia existente; cambiar contenido/tipo con esa clave falla. Las cargas simultáneas conservan un registro y eliminan el objeto perdedor cuando se puede resolver el resultado de la escritura.

Storage y PostgreSQL **no comparten una transacción**. Ante un resultado de escritura incierto se consulta primero el registro para no borrar un objeto cuyo INSERT sí se confirmó. Si no se puede resolver, se devuelve `MEDIA_RECONCILIATION_REQUIRED` y se conserva el objeto. Una subida con respuesta de red perdida también podría dejar un objeto sin registro. La reconciliación/limpieza de huérfanos y la retención automática quedan pendientes; no borrar registros sin eliminar antes sus objetos mediante la API Storage. La FK evita borrar un negocio con registros multimedia pendientes.

`read` vuelve a verificar identidad y registro; descarga desde el endpoint privado autenticado del proyecto configurado con timeout de 10 segundos y sin redirecciones. Limita bytes durante el stream, incluso sin Content-Length; verifica MIME, tamaño y SHA-256, y comprueba firmas de contenedor. Esto no sustituye un decodificador completo ni valida todos los códecs. La referencia no admite URLs arbitrarias. El lector especializado de audio rechaza imágenes; su almacenamiento no implica que OCR esté implementado.

## Integración R1/R2/R3

- **R1:** adaptador de almacenamiento y lector privado implementados; transcripción `gpt-transcribe`, interpretación y confirmaciones existentes.
- **R2:** descargar medios únicamente desde el origen autenticado y validado de Infobip, limitar tamaño antes de acumularlos y llamar `save`. Normalizar el evento interno a `kind: 'audio', audio: reference`. No aceptar un storageKey del payload como autoridad. El parser ya reconoce AUDIO/IMAGE con URL según el SDK oficial, y `createInfobipMediaIngestor` conecta descarga acotada a `save`; falta comprobar el evento/origen/redirecciones reales de la cuenta. Ver `receipt-interpretation.md`.
- **R3:** el bootstrap HTTP ya compone lector Supabase y transcriptor si `WHATSAPP_AUDIO_ENABLED=true`; requiere `OPENAI_API_KEY` y las variables Supabase existentes. 008 ya está aplicada en remoto y la descarga de R2 ya está conectada. Configurar y verificar credenciales, HTTPS/enrutamiento y orígenes de redirección antes de activar. Imágenes usan `WHATSAPP_RECEIPTS_ENABLED`; ambos flags permanecen false por defecto.

La demo web mock conserva sus archivos temporales y no está conectada a estos buckets. La ruta real no usa su sesión mock. El flujo de audio mantiene aclaraciones y resumen; solo una confirmación textual versionada registra venta y descuenta stock.

## Comprobación

```bash
npx supabase db push   # local por defecto; revisar Target
npm run validate
npm run build
python3 scripts/check-role2-local.py
```

Prueba integrada local con Storage/PostgreSQL/Auth reales: guardar/leer audio e imagen, reintentos, cargas simultáneas, pertenencia al negocio, rechazo de lectura pública, rechazo de clientes anon y authenticated, borrador sin efectos y posterior confirmación idempotente. Se eliminan archivos, metadatos y usuario Auth de prueba. OpenAI y HTTP saliente de Infobip están simulados; el fixture OGG solo tiene firma de contenedor y no prueba reproducción/transcripción acústica.

Fuentes: [descargas privadas](https://supabase.com/docs/guides/storage/serving/downloads) y [control de acceso](https://supabase.com/docs/guides/storage/security/access-control).
