# Demo web de Knectan

La demo incluye `/chat`, `/distribuidores` y `/publicidad`. Funciona sin AWS Bedrock, Meta, WhatsApp ni Supabase. No modifica `backend/`, tablas ni migraciones. Next.js conserva su runtime de servidor para las rutas HTTP; no configurar `output: "export"` ([limitaciones de exportación estática](https://nextjs.org/docs/app/guides/backend-for-frontend)).

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
6. Pulsar **Agregar pedido** y completar cliente, canal, artículos y monto con punto decimal (hasta dos decimales). Guardar y revisar el listado y los KPIs. **Quitar pedido** abre una confirmación: Cancelar o Escape conserva el pedido; confirmar lo retira y recalcula los indicadores.
7. Abrir **Publicidad**, comparar los tres planes y cambiar catálogo/volumen para obtener una recomendación. **Activar plan en demo** confirma una simulación sin cobros, anuncios ni cambios reales en el chat. Los precios y beneficios son ilustrativos.
8. Recargar para comprobar que las altas/bajas persisten durante seis horas en la sesión. Otra sesión de navegador comienza con sus propios pedidos. El historial de chat depende de la memoria del proceso.

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

Los recorridos cubren texto, imagen, audio, historial, filtros, vacío, cambios de estado, alta/baja, confirmación por teclado, KPIs, carga del logo, planes y recuperación de errores. Se ejecutan en escritorio y móvil e incluyen auditoría automática axe WCAG A/AA. Esto complementa la revisión manual de teclado y no sustituye una certificación integral de accesibilidad.

La CI en `.github/workflows/ci.yml` instala con `npm ci`, valida tipos/lint/contratos/rutas, compila y ejecuta E2E; conserva trazas cuando falla.

La evidencia de esta entrega y las limitaciones del gate visual están en [QA-KNECTAN.md](QA-KNECTAN.md).

## 4. Desplegar en Vercel

1. Subir los cambios y `package-lock.json` al repositorio remoto que se quiera desplegar.
2. En Vercel, seleccionar **Add New → Project** e importar ese repositorio.
3. Usar el preset **Next.js** y como Root Directory la raíz del repositorio, no `frontend/` ni `backend/`. Vercel soporta Next.js de forma nativa ([guía oficial](https://vercel.com/docs/frameworks/full-stack/nextjs)).
4. Elegir Node.js **22.x** en la configuración del proyecto. Mantener Install Command `npm ci` y Build Command `npm run build`; dejar el directorio de salida en su valor predeterminado para Next.js ([configuración de build](https://vercel.com/docs/builds/configure-a-build)).
5. En Environment Variables añadir `MOCK_MODE=true` para Preview y Production. Recomendado: añadir `MOCK_SESSION_SECRET` con una clave aleatoria distinta a otros proyectos. No hacen falta variables de AWS, Meta o Supabase. Las variables se aplican al siguiente despliegue ([documentación de variables](https://vercel.com/docs/environment-variables)).
6. Pulsar **Deploy**. En la URL HTTPS resultante, comprobar `/chat`, `/distribuidores`, `/publicidad` y `/logo/Knectan_logo.svg`. Probar los tres tipos de mensaje, filtros, alta/baja de pedidos, recarga y activación mock de un plan.
7. Para cambios posteriores de variables, crear un nuevo deployment. Si se cambia la clave, borrar las cookies `knectan_demo` y `knectan_demo_orders` del navegador y volver a cargar.

### Persistencia de la demo

Los proveedores mock están aislados por `businessId` **verificado** y sesión. No escriben archivos ni llaman servicios externos. Los pedidos se sincronizan entre rutas mediante una cookie HttpOnly firmada y comprimida, acotada a menos de 4 KB y ligada a la sesión. La colección completa conserva altas y bajas, incluso cuando queda vacía. La demo permite hasta 30 pedidos; si alcanza su límite de espacio, rechaza el alta antes de modificar el estado. Esto permite recargar el panel aunque las funciones se ejecuten en instancias diferentes. La activación de planes se muestra mientras la vista permanece abierta; no representa una suscripción persistente.

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
| `POST /api/distributor/orders` | JSON `{ customer, channel, items_count, total_cents }` | Pedido pendiente; HTTP 201 |
| `DELETE /api/distributor/orders/[orderId]` | JSON `{ expected_version }` | `{ orderId, deleted_at }`; HTTP 200 |
| `POST /api/distributor/plans` | JSON `{ planId }` | Activación simulada, `monthly_price_cents` del servidor y fecha UTC; HTTP 201 |

Texto requiere `text`; imagen requiere `name`, `alt`, `data_url`; audio requiere `name`, `data_url`. Los archivos usan data URLs base64 para permitir el flujo local sin almacenamiento externo. No se aceptan URLs remotas. El límite del archivo decodificado es 2 MB y el del request completo es 3 MB. Los campos desconocidos, `businessId` en body/query y parámetros repetidos se rechazan con 400. Todos los errores públicos tienen exclusivamente `{ code, message }`; no incluyen stack ni detalles internos. Los montos son enteros seguros `*_cents` en MXN y las fechas UTC con milisegundos.

`expected_version` detecta cambios concurrentes en el proceso local (409). `clientMessageId` evita repetir el mismo envío dentro de la ventana de deduplicación mock; reutilizarlo con otro contenido devuelve 409. Las implementaciones reales deben definir almacenamiento e idempotencia duraderos.

Para conectar servicios reales desde el bootstrap **del servidor**, llamar `configureHttp(services, sessionVerifier)` de `src/modules/http/container.ts`. R2 debe implementar `SessionVerifier.verify(request)` verificando su proveedor de identidad; el actor incluye `userId`, `businessId`, `channel: "web"` y `sessionId` UUID. Ninguna cabecera de identidad ni un objeto del navegador constituyen una sesión válida. R1/R2 implementan `ChatService` y `DistributorService` con los contratos compartidos.

Al desactivar mocks sin una sesión verificada, las rutas devuelven 401. Sin servicios conectados, una sesión verificada recibe 503. Las cookies de demo nunca se aceptan por sí mismas en modo real. La app no implementa login, prompts, contabilidad, Bedrock, Meta ni migraciones.
