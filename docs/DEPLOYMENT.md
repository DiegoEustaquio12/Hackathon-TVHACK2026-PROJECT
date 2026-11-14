# Demo web de MicroAI

La demo incluye `/chat` y `/distribuidores`. Funciona sin AWS Bedrock, Meta, WhatsApp ni Supabase. No modifica `backend/`, tablas ni migraciones. Next.js conserva su runtime de servidor para las rutas HTTP; no configurar `output: "export"` ([limitaciones de exportación estática](https://nextjs.org/docs/app/guides/backend-for-frontend)).

## 1. Preparar el entorno local

Requiere Node.js 22 o 24 y npm. Desde la **raíz de este repositorio**:

```sh
npm ci
```

Copiar `.env.example` a `.env.local`. En PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Dejar `MOCK_MODE=true`. El resto de las variables de proveedores puede quedar vacío. `MOCK_SESSION_SECRET` es opcional en local; si se define, debe ser un valor aleatorio que permanezca estable durante la demo. Nunca usar un prefijo `NEXT_PUBLIC_` para esta clave o para activar mocks.

```sh
npm run dev
```

Abrir [asistente](http://localhost:3000/chat) y [distribuidores](http://localhost:3000/distribuidores). En Windows, si PowerShell bloquea `npm.ps1`, usar `npm.cmd` y `npx.cmd` en estos comandos; no es necesario cambiar la política del sistema.

## 2. Recorrer la demo

1. En el asistente, escribir un mensaje y pulsar **Enviar mensaje**. La respuesta identifica que es una simulación y no registra operaciones.
2. Elegir **Imagen**, seleccionar JPG, PNG o WebP (hasta 2 MB), escribir una descripción y enviar. La descripción también se usa como texto alternativo.
3. Elegir **Audio**. Cargar WebM, Ogg, MP3, MP4 o WAV (hasta 2 MB), o grabar hasta un minuto. La grabación requiere HTTPS o localhost y permiso del micrófono. Si el navegador no admite grabación, usar la carga de archivo. La demo no hace OCR ni transcripción.
4. Abrir distribuidores. Los seis pedidos ficticios tienen indicadores globales y filtros por estado, comercio o identificador. Buscar un texto inexistente permite revisar el estado vacío.
5. Cambiar `PED-1042` de pendiente a confirmado y pulsar **Guardar**. El panel actualiza el pedido y los indicadores. Continuar con enviado y entregado según los siguientes estados ofrecidos. Los pedidos finalizados no admiten cambios.
6. Recargar para consultar el historial y los cambios mientras siga activo el proceso local. Otra sesión de navegador comienza con sus propios datos.

## 3. Validar

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`typecheck` ejecuta `tsc --noEmit`. `npm run validate` reúne tipos, lint y pruebas de contratos/rutas. Las pruebas E2E levantan el **build de producción** en `127.0.0.1:3100` con mocks; ese puerto debe estar libre. En Windows usan Chrome instalado. En Linux/macOS instalar Chromium para Playwright antes de E2E:

```sh
npx playwright install --with-deps chromium
```

Los recorridos cubren texto, imagen, audio, historial, filtros, vacío, cambios de estado y recuperación de errores. Se ejecutan en escritorio y móvil e incluyen auditoría automática axe WCAG A/AA. Esto complementa la revisión manual de teclado y no sustituye una certificación integral de accesibilidad.

La CI en `.github/workflows/ci.yml` instala con `npm ci`, valida tipos/lint/contratos/rutas, compila y ejecuta E2E; conserva trazas cuando falla.

## 4. Desplegar en Vercel

1. Subir los cambios y `package-lock.json` al repositorio remoto que se quiera desplegar.
2. En Vercel, seleccionar **Add New → Project** e importar ese repositorio.
3. Usar el preset **Next.js** y como Root Directory la raíz del repositorio, no `frontend/` ni `backend/`. Vercel soporta Next.js de forma nativa ([guía oficial](https://vercel.com/docs/frameworks/full-stack/nextjs)).
4. Elegir Node.js **22.x** en la configuración del proyecto. Mantener Install Command `npm ci` y Build Command `npm run build`; dejar el directorio de salida en su valor predeterminado para Next.js ([configuración de build](https://vercel.com/docs/builds/configure-a-build)).
5. En Environment Variables añadir `MOCK_MODE=true` para Preview y Production. Recomendado: añadir `MOCK_SESSION_SECRET` con una clave aleatoria distinta a otros proyectos. No hacen falta variables de AWS, Meta o Supabase. Las variables se aplican al siguiente despliegue ([documentación de variables](https://vercel.com/docs/environment-variables)).
6. Pulsar **Deploy**. En la URL HTTPS resultante, comprobar `/chat`, `/distribuidores` y los tres tipos de mensaje. Probar filtros y un cambio de estado.
7. Para cambios posteriores de variables, crear un nuevo deployment. Si se cambia la clave, borrar la cookie `microai_demo` del navegador y volver a cargar.

### Persistencia de la demo

Los proveedores mock están aislados por `businessId` **verificado** y sesión. No escriben archivos ni llaman servicios externos. Los seis pedidos se sincronizan entre rutas mediante una cookie HttpOnly firmada, acotada a menos de 4 KB y ligada a la sesión. Esto permite recorrer y recargar el panel en Vercel aunque sus funciones se ejecuten en instancias diferentes.

El historial de chat conserva las últimas seis entradas (tres intercambios) en memoria, junto a los tres últimos identificadores de envío para deduplicación. Se aplica un presupuesto global aproximado de 24 millones de caracteres retenidos y hasta 100 sesiones. En Vercel el historial puede reiniciarse al cambiar de instancia o con un arranque en frío; el intercambio visible continúa en la pantalla mientras esté abierta. Los datos de demo caducan a las seis horas. Para persistencia duradera y concurrencia distribuida, R1/R2 deben conectar un repositorio compartido; no se incluye una base de datos en este rol.

Las cookies de demo usan HttpOnly, SameSite=Lax, firma HMAC y Secure en HTTPS, con duración de seis horas. Solo identifican actores ficticios cuando `MOCK_MODE` es exactamente `true`; la clave predeterminada de demo es pública y no es autenticación de producción. No usar información real en la demo.

## 5. Contratos y conexión con R1/R2

Los esquemas y tipos se exportan desde `src/contracts/index.ts`; los puertos de integración están en `src/contracts/services.ts`. Los handlers solo resuelven sesión, validan entrada/salida e invocan esos puertos.

| Método y ruta | Entrada | Salida |
| --- | --- | --- |
| `GET /api/chat/messages` | Sin query | `conversationId`, `messages` |
| `POST /api/chat/messages` | JSON con `clientMessageId` UUID y `kind: text / image / audio` | Dos mensajes validados; HTTP 201 |
| `GET /api/distributor/dashboard` | Query opcional `status`, `q` | KPIs globales y pedidos filtrados |
| `PATCH /api/distributor/orders/[orderId]/status` | JSON `{ status, expected_version }` | Pedido y versión actualizados |

Texto requiere `text`; imagen requiere `name`, `alt`, `data_url`; audio requiere `name`, `data_url`. Los archivos usan data URLs base64 para permitir el flujo local sin almacenamiento externo. No se aceptan URLs remotas. El límite del archivo decodificado es 2 MB y el del request completo es 3 MB. Los campos desconocidos, `businessId` en body/query y parámetros repetidos se rechazan con 400. Todos los errores públicos tienen exclusivamente `{ code, message }`; no incluyen stack ni detalles internos. Los montos son enteros seguros `*_cents` en MXN y las fechas UTC con milisegundos.

`expected_version` detecta cambios concurrentes en el proceso local (409). `clientMessageId` evita repetir el mismo envío dentro de la ventana de deduplicación mock; reutilizarlo con otro contenido devuelve 409. Las implementaciones reales deben definir almacenamiento e idempotencia duraderos.

Para conectar servicios reales desde el bootstrap **del servidor**, llamar `configureHttp(services, sessionVerifier)` de `src/modules/http/container.ts`. R2 debe implementar `SessionVerifier.verify(request)` verificando su proveedor de identidad; el actor incluye `userId`, `businessId`, `channel: "web"` y `sessionId` UUID. Ninguna cabecera de identidad ni un objeto del navegador constituyen una sesión válida. R1/R2 implementan `ChatService` y `DistributorService` con los contratos compartidos.

Al desactivar mocks sin una sesión verificada, las rutas web devuelven 401. Sin servicios web conectados, una sesión verificada recibe 503. Las cookies de demo nunca se aceptan por sí mismas en modo real. El login web sigue pendiente de montar; los servicios de dominio y la ruta WhatsApp reales se integran por separado.

## 5. Webhook real de Infobip

La ruta `POST /api/webhooks/infobip` usa `createRole2Service` con Supabase privilegiado de servidor. Es independiente de `MOCK_MODE`: nunca usa la sesión o servicios de la demo web. Solo se habilita con `INFOBIP_WEBHOOK_ENABLED=true`.

1. Publicar los cambios de código/migraciones en el repositorio del despliegue. Revisar y aplicar las migraciones hasta 007 en la base alojada usada por la aplicación; las verificaciones locales no las despliegan automáticamente. Usar `npx supabase db push --dry-run --remote` para revisar el destino antes de aplicar mediante el responsable de migraciones.
2. Configurar las variables de `.env.example`: `SUPABASE_URL` (o `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_WHATSAPP_SENDER` (dígitos sin '+'), `INFOBIP_WEBHOOK_USERNAME`, `INFOBIP_WEBHOOK_PASSWORD` (mínimo 24 caracteres) e `INFOBIP_ONBOARDING_SECRET` (mínimo 32 bytes). Mantener la clave de continuaciones estable entre instancias. No usar claves públicas para operaciones de servidor.
3. Habilitar `INFOBIP_WEBHOOK_ENABLED=true` y crear un deployment con esas variables. Sin habilitación/configuración válida, la ruta devuelve 503 y no simula ventas.
4. En Infobip configurar el mismo perfil Basic y la URL HTTPS real `<dominio-del-deployment>/api/webhooks/infobip` para mensajes entrantes del remitente funcional. Comprobar el enrutamiento de mensajes libres; no basta la palabra clave de activación del número de prueba. Los campos y el perfil deben contrastarse con un evento real de esa cuenta.
5. Probar desde un teléfono permitido: alta explícita, venta con presentación, resumen, confirmación y consulta. Verificar filas en `r2_events`, `whatsapp_sale_drafts`, `sales`, `sale_items` y `products`. Para gastos: `r2_expense_drafts` y `expenses`. `whatsapp_inbound_events` es el registro de metadatos anterior; el webhook actual utiliza `r2_events` como almacenamiento durable.

El cuerpo se limita a 256 KiB, incluso sin Content-Length. Se conserva la autenticación del proveedor y no se exige cookie web. El perfil sin credenciales válidas recibe 401; payload inválido recibe 400/415/422; fallo técnico reintentable recibe 503. Los errores conocidos de negocio generan una explicación WhatsApp durable y HTTP 200 después de enviarla. No anunciar éxito antes del efecto de dominio o del envío aceptado por el proveedor.

El procesamiento usa leases de 60 segundos y respuesta persistida antes de enviarla. Una caída de red puede repetir una respuesta, pero la clave del borrador evita duplicar ventas. Los mensajes largos se dividen por líneas. Todavía no existe un worker de barrido/renovación de leases: mantener este camino de texto acotado y desacoplar futuras tareas de IA lenta. La retención/limpieza de eventos y sesiones debe configurarse operativamente; los registros vencidos no se borran automáticamente.

Prueba integrada de servidor y base local, sin mensajes reales:

```sh
python3 scripts/check-role2-local.py
```

Las migraciones 001–008 ya están aplicadas en `microai-dev`; el dry-run quedó sin pendientes y la aceptación SQL remota pasó con rollback de fixtures. Se reproduce con `python3 scripts/check-role1-database.py --remote-ref hfcetxrktdorebepttof`. La URL pública, la configuración de credenciales del despliegue y el intercambio real de mensajes siguen sin verificarse.

## Medios privados con Supabase Storage

El MVP usará Supabase Storage para audios e imágenes; no requiere AWS S3. La migración 008 está aplicada y comprobada en local y microai-dev. Los buckets `business-audio` y `business-images` son privados, con registros en `business_media`. `WHATSAPP_AUDIO_ENABLED=false` por defecto; si se activa, el bootstrap compone lector Supabase y OpenAI y exige `OPENAI_API_KEY`. R2 ya conecta descarga/normalización según el SDK; mantener desactivado hasta verificar credenciales, evento, enrutamiento y orígenes reales de redirección. Tickets usan `WHATSAPP_RECEIPTS_ENABLED` y `OPENAI_RECEIPT_MODEL`. No cambiar los buckets a públicos. Ver [media-storage.md](media-storage.md).

Actualización multimedia: 008 ya está aplicada y comprobada en microai-dev. Descarga Infobip AUDIO/IMAGE y primera extracción/revisión de tickets implementadas, con flags desactivados por defecto. Antes de producción faltan credenciales, HTTPS/enrutamiento y comprobar evento/redirecciones reales. La prueba local usa Supabase DB/Storage/Auth reales y HTTP externos simulados; no equivale a WhatsApp real. Ver [tickets](receipt-interpretation.md).
