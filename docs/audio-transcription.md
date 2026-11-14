# Audio R1 con OpenAI

El adaptador real `createOpenAIAudioTranscriber` usa `POST https://api.openai.com/v1/audio/transcriptions`, multipart, modelo fijo `gpt-transcribe` e indicación `languages[]=es`. Usa fetch nativo de Node, sin añadir dependencias. Contrato oficial consultado: https://developers.openai.com/api/docs/guides/speech-to-text .

## Recorrido y límites

1. R2 autentica al remitente y guarda el audio en almacenamiento privado con pertenencia al negocio. No usar referencias aportadas en el texto ni URLs del usuario.
2. El evento normalizado interno lleva `kind: 'audio'` y `audio: { storageKey, mimeType }`.
3. La conversación resuelve primero el negocio y exige el alta. `createAudioPreparation` entrega actor/referencia al `TrustedAudioReader` de servidor.
4. El lector debe comprobar pertenencia y limitar la descarga a 10 MiB antes de acumular bytes. Debe verificar formato/contenido y usar tiempo de espera acotado. No basta validar el prefijo de una ruta ni confiar en MIME externo. El límite se vuelve a comprobar antes de enviar a OpenAI.
5. OpenAI devuelve texto; se admite una transcripción de hasta 2000 caracteres. Se usan las mismas reglas deterministas de productos, cantidades, precios y stock del texto. Cantidades expresadas en palabras que el parser no entienda producen aclaración; no se inventan conversiones.
6. Presentaciones ambiguas generan selección firmada por renglón. El token conserva transcripción y operación original; elegir no vuelve a transcribir. Antes de crear el borrador se recarga catálogo.
7. El resumen muestra la transcripción cuando procede directamente del audio. El borrador no registra venta ni descuenta stock. La aprobación posterior debe llegar por texto y mantiene el protocolo `draftId + quoteVersion`; cambios de precio exigen nueva aprobación.

Los audios nunca entran al procesador de comandos. Decir CONFIRMAR, CANCELAR, ELEGIR o CONFIRMAR ALTA no aprueba/cancela operaciones. Gastos transcritos solo generan propuesta; reportes conservan la zona horaria obligatoria. Silencio, formato no soportado o salida inválida piden reintentar por audio/texto. No se inventa una confianza acústica que la respuesta del proveedor no suministra.

El adaptador permite OGG, MPEG/MP3, MP4/M4A, WAV, WebM y FLAC. Parámetros MIME como `audio/ogg; codecs=opus` se normalizan para el archivo multipart. No realiza conversión de códec. Tiempo máximo de OpenAI: 20 segundos; sin reintentos internos. Errores de red, 429 y 5xx siguen reintentables por el almacenamiento durable. Las respuestas de error no incluyen clave, transcripción ni cuerpo del proveedor. El pipeline de medios debe mantenerse dentro del lease de 60 segundos; para audio lento hace falta una cola/worker con renovación, todavía pendiente.

## Composición de servidor

```typescript
import { createOpenAIAudioTranscriber } from '../src/modules/media/openai-transcriber';
import { createRole2Service } from '../src/modules/orchestration/service';

const handler = createRole2Service({
  ...serverConfig,
  audio: {
    reader: trustedPrivateStorageReader,
    transcriber: createOpenAIAudioTranscriber({
      apiKey: process.env.OPENAI_API_KEY ?? '',
    }),
  },
});
```

Este ejemplo requiere el lector implementado/autorizado por R2. La clave se configura en el servidor, nunca con prefijo `NEXT_PUBLIC_`. No copiarla al chat ni a los logs. La ausencia de clave hace fallar la construcción del adaptador; no hay fallback mock.

**Estado de conexión:** `createRole2Service` ya acepta e inyecta el pipeline de audio, pero el parser Infobip público todavía conserva los medios como `unsupported`; no transforma un `storageKey` externo en autoridad. Falta contrastar el payload real, implementar descarga/almacenamiento privado, conectar el lector y habilitarlo desde el bootstrap HTTP. Añadir `OPENAI_API_KEY` por sí solo no habilita audio en WhatsApp. La demo web mock permanece independiente. No se requiere una migración de dominio en esta entrega.

## Evidencia

- `npm run validate`: 80 pruebas aprobadas, integración local omitida por defecto.
- `npm run build`: aprobado.
- `python3 scripts/check-role2-local.py`: aprobado con Supabase local real. Incluye audio preparado, borrador sin venta/descuento, replay sin retranscribir y confirmaciones posteriores sin duplicados. OpenAI, lectura de audio y HTTP saliente de Infobip están simulados en esa prueba.
- Pruebas específicas: multipart/modelo/idioma, límites, formatos, errores, identidad entregada al lector, aclaraciones, selección y rechazo de confirmaciones habladas.

No se hizo llamada real a OpenAI: no hay `OPENAI_API_KEY` configurada en el entorno revisado. No se midió precisión, costo ni latencia con audios reales. Falta aceptación con grabaciones mexicanas, ruido, cantidades/marcas, silencio y formatos reales de Infobip; después, WhatsApp real.
