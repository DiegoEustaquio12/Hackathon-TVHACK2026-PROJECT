# Continuidad del desarrollo — Knectan / MicroAI

Última actualización: 14 de noviembre de 2026. Este archivo resume decisiones del usuario y el estado comprobado para continuar en otro chat. Antes de actuar, revisar `git status`, commits recientes y archivos reales: otros integrantes pueden haber avanzado desde este resumen.

## Proyecto y objetivo

- Workspace: `/Users/roltac/Desktop/Hackathon-TVHACK2026-PROJECT`.
- Aplicación originalmente llamada **MicroAI**; el equipo también usa **Knectan**. Package npm: `microai`.
- Documento original: `/Users/roltac/Downloads/MicroAI_MVP_Arquitectura_Plan.md`.
- Administrador/POS para pequeños comercios mexicanos. **WhatsApp debe ser el canal principal del comerciante**, incluyendo registro, aclaraciones, confirmaciones y consultas. No sustituirlo por una aplicación web como flujo principal.
- Distribuidores tendrán catálogo/pedidos/panel web. La monetización propuesta es publicidad y comisión del 1% en pedidos entregados/confirmados de clientes nuevos; cobro automático, rifas y campañas avanzadas quedan fuera del MVP.
- Ya se descartó **WhatsApp Flows**. Se usa **Infobip WhatsApp**, manteniendo adaptadores independientes del proveedor. Meta directo tuvo bloqueo de cuenta en pruebas del otro integrante. No volver a depender de Flows para la demo.

## Estado Git al escribir este resumen

- Rama local `main`, HEAD `d0a7383` (`Add role 2 expense confirmation reports and product choices`), integrado con `origin/main` en el último pull.
- Commits relevantes: `62b7f5d` demo web R3; `e66fab3` alta/precios R1; `b633c9b` productos/gastos/reportes R1; trabajo R2 integrado hasta `d0a7383`.
- **La última implementación correctiva tiene cambios locales sin commit y archivos nuevos sin seguimiento.** Incluye migración 007, ruta Infobip, pruebas, cancelación de gastos, selecciones por renglón y documentación. No descartarlos ni asumir que ya están publicados. Guardarlos/integrarlos antes de futuros pulls que se solapen.
- No se hizo push, merge adicional, despliegue remoto ni envío de mensajes reales desde esta última implementación.

## Stack y entorno

- Next.js App Router 15.x, React 19, TypeScript, Zod 4.
- **CSS Modules y CSS nativo**, decisión explícita del usuario en lugar de Tailwind.
- Node requerido por `package.json`: `>=22 <25` (22 o 24); npm y Supabase CLI están instalados en el proyecto. CLI 3.x.
- Supabase: PostgreSQL, Auth y Storage. Proyecto remoto **`microai-dev`**, ya creado y vinculado mediante `supabase link`.
- Supabase local iniciado con Docker. Puertos configurados: API `54321`, DB `54322`, Studio `54323`.
- CLI 3.x: los comandos DB apuntan a **local por defecto**; `--remote` apunta al proyecto alojado. Revisar siempre `Target:`. No asumir que lo aplicado localmente existe en remoto.
- Vercel es el destino previsto. No se verificó un deployment público durante este trabajo.
- Bedrock se planeó como respaldo posterior. No hay modelo seleccionado/configurado ni llamadas de IA implementadas todavía.
- Supabase admite pgvector para búsqueda semántica futura; **no se configuraron embeddings ni búsqueda vectorial**. El matcher actual es determinista.
- Skills instaladas del proyecto en `.codex/skills`: taste-skill, frontend-design, impeccable, ui-ux-pro-max y find-skills. Usar las relevantes para UI; no son skills de datos/IA. El usuario pidió usarlas cuando correspondan.

## Reglas explícitas acordadas con el usuario

1. **Un propietario por negocio**, identificado principalmente por su número de WhatsApp. Guardar número internacional con código de país, solo dígitos, sin `+`, espacios o guiones. UUID como clave interna. No inventar conversiones de números mexicanos.
2. El teléfono debe provenir del remitente de un **webhook autenticado**. No confiar en números/IDs enviados en el texto o en formularios. En Infobip, `from` es el comerciante y `to` el número receptor de plataforma.
3. **Alta explícita**: preguntar nombre y **giro** del negocio antes de operar. Guardar ambos; el giro servirá como contexto para modelos futuros de creación asistida de productos. No crear negocios automáticamente al recibir “Hola” o una venta.
4. El precio se edita en el **panel de productos**, nunca durante la venta. La venta toma el catálogo y guarda descripción/precio históricos.
5. Toda venta necesita resumen y confirmación explícita, aun si el intérprete está seguro.
6. Si cambió el precio desde el resumen: mostrar claramente importe anterior/nuevo y pedir otra aprobación. Un comando/botón antiguo no aprueba la nueva versión.
7. La venta descuenta stock en la misma transacción. Stock obligatorio y no negativo. Falta de stock rechaza toda la venta; mostrar agotado/insuficiente sin poner a cero unidades restantes.
8. MXN en centavos enteros; cantidades hasta 3 decimales. Productos por pieza solo cantidades enteras.
9. “Vendí una coca” no determina automáticamente la presentación. Si hay varias, preguntar cuál (por ejemplo 600 ml o 2 litros). No elegir por popularidad, stock o precio.
10. Gastos separados de ventas; no presentar ventas menos gastos como utilidad. El reporte diario requiere zona horaria explícita del negocio, sin asumir que todo México usa la misma.

## División del equipo

- **Este chat y el usuario trabajan principalmente en ROL 1:** IA/interpretación de texto-audio-imagen, datos, migraciones, catálogo, ventas, gastos y reportes.
- ROL 2: Infobip, autenticación, normalización del webhook, orquestación, aclaraciones y confirmaciones.
- ROL 3: frontend, rutas HTTP, contratos web, configuración y despliegue.
- El usuario autorizó corregir la integración entre roles: por eso la última entrega también modifica R2 y monta la ruta R3. Esas correcciones son intencionales, no cambios ajenos que deban revertirse.
- Referencias: `docs/parallel-work.md`, `docs/roles/*.md`, `docs/integration-contracts.md`. Cada integrante usa rama/checkout propios y coordina cambios compartidos.

## Implementación del rol 1

### Esquema y migraciones

Están aplicadas **localmente** las migraciones en `supabase/migrations/`:

| Migración | Contenido |
| --- | --- |
| 001 | `businesses`, `products`, `sales`, `sale_items`, `expenses`; índices, restricciones, RLS |
| 002 | `record_whatsapp_sale`: precios/stock/venta transaccionales, idempotencia y restricción de escrituras directas |
| 003 | Origen `whatsapp`, eventos de metadatos y borradores de venta |
| 004 | Giro/alta explícita y resúmenes de precios versionados |
| 005 | Especificación de productos, alias, creación/edición, gastos idempotentes y reporte diario |
| 006 | Edición comercial exige snapshot `expected`; evita sobrescribir stock cambiado por otra venta |
| 007 | Almacenamiento durable R2, leases/fencing, sesiones/enlaces y propuestas cancelables de gastos |

No modificar migraciones ya aplicadas; crear una siguiente. `src/modules/auth/storage/role2.sql` era una propuesta; ahora es **solo un puntero a la migración 007**, no ejecutarlo aparte.

### Productos estándar

`docs/product-standard.md` y `src/modules/data/products.ts`:

- Campos: `product_type`, marca opcional `brand`, variante opcional `variant`, presentación/envase `presentation`, `content_amount`, `content_unit`, `sale_unit`, `aliases`, precio, stock y costo opcional.
- Ejemplo: **Coca-Cola Refresco Original 600 ml · Botella PET**.
- El servidor genera el nombre. Normaliza litros a ml y kg a g. 0.6 l y 600 ml representan la misma identidad dentro del negocio.
- Identidad única por negocio/especificación; precio y stock no cambian identidad. Creación idempotente.
- Un paquete es otra presentación; no se convierten automáticamente cajas a botellas. Cantidades/stock se expresan en unidad de venta.
- Productos anteriores se conservan sin inventar especificaciones. No se implementó todavía un flujo de migración técnica de esas filas.
- `createStandardProduct(...)` crea; `updateProductCommercials(...)` edita precio/stock/costo con valores originales `expected`. `PRODUCT_CHANGED` exige recargar/revisar.
- Las escrituras directas de productos/gastos para `anon`/`authenticated` se retiraron. R3 debe usar adaptadores de servidor con identidad verificada; nunca exponer `service_role`.

### Repositorios e intérprete

- `src/modules/data/businesses.ts`: `findBusinessByWhatsApp`, `completeBusinessOnboarding`, `getBusinessCatalogue`, `interpretForWhatsApp`. Catálogo paginado y limitado al negocio resuelto por número.
- `src/modules/interpretation/parser.ts`: `interpretSaleMessage(request, catalogue, selections?)`, puro y sin persistencia.
- `product-matching.ts`: normalización conservadora de tokens, alias y medidas; no embeddings.
- Entiende “Vendí 3 cocas y 2 panes”, “vendí una coca 600ml”, precios explícitos solo si coinciden con catálogo, “Gasté 50 en luz” y “¿Cuánto vendí hoy?”.
- Devuelve `sale`/`expense`/`report`/`unknown`, artículos/propuesta o aclaración. Ambigüedad incluye `clarificationOptions` y `clarificationLine` para elegir por renglón. No devuelve un carrito parcial ejecutable.
- No hay transcripción, OCR ni modelo de lenguaje todavía.
- `src/modules/data/conversations.ts`: crear/confirmar/cancelar borrador de venta y registrar metadatos de eventos.
- `confirmSaleDraft({verifiedSender,draftId,quoteVersion})` devuelve unión: `confirmed` con `receipt`, `price_changed` con anterior/nuevo/version, o `quote_outdated`. Solo `confirmed` significa venta guardada.
- Clave de venta interna `draft:<uuid>`: reintentar eventos o confirmar varias veces no descuenta stock otra vez. Borrador pendiente vence a 15 minutos; no reserva stock.
- `sale-results.ts`: esquemas tipados y `formatPriceChangeNotice`.
- `whatsapp-sales.ts`/`recordWhatsAppSale`: helper bajo nivel **deprecado para el chat**; usar borradores versionados para confirmar.
- `accounting.ts`: `recordExpense` interno idempotente, `setBusinessTimeZone`, `getBusinessDailyReport`. Reporte incluye ventas, gastos y artículos, sin utilidad; límites UTC calculados desde día/zona local.
- `expense-drafts.ts`: proponer/confirmar/cancelar gastos mediante SQL. Cancelar pendientes invalida tokens anteriores, pero no revierte gastos confirmados.

## Rol 2 y correcciones más recientes

- `orchestration/service.ts`: `createRole2Service(config)` compone servicios reales y retorna handler `{rawBody,headers} -> {status,body}`.
- `messaging/infobip.ts`: cliente HTTP servidor, autenticación Basic del webhook, normalización de esquema legacy `results[].{messageId,from,to,receivedAt,message:{type,text}}`. El esquema debe contrastarse con el evento real de la cuenta. Solo texto implementado; medios llegan como unsupported.
- Alta: `ALTA Nombre | Giro`, resumen y `CONFIRMAR ALTA <token firmado>`, ligado al remitente/expiración.
- Venta: resumen con `CONFIRMAR <draftId> <quoteVersion>` / `CANCELAR <draftId>`.
- Selección corregida: `ELEGIR <token> <opción>`. Conserva venta/clave originales y selecciones por índice de renglón; no elimina otras presentaciones del catálogo. Soporta varias ambigüedades y una presentación explícita en otro renglón. Un solo token por menú y límites de longitud.
- Gasto: propuesta persistente; `CONFIRMAR GASTO <token>`, `CANCELAR GASTO <token>` o `CANCELAR GASTO` para todos los pendientes del negocio. Confirmación/cancelación serializadas en DB y con idempotencia.
- `ZONA America/Mexico_City` configura una zona que corresponda al negocio; luego puede responder reporte real.
- `domain-errors.ts`: errores conocidos como stock insuficiente/borrador vencido/gasto cancelado se convierten en explicaciones durables. Fallos técnicos desconocidos siguen reintentables.
- `r2_events` es la fuente durable del webhook: payload, lease de 60 s, fencing del worker y respuesta. `whatsapp_inbound_events` queda como metadatos anteriores; no confundirlo con el procesamiento real.
- La respuesta se persiste antes de enviarse. Una caída de red puede duplicar una respuesta, pero no el efecto de venta. Respuestas largas se dividen por líneas en bloques <=4096 caracteres.
- No hay worker de barrido autónomo, renovación de leases o cron de limpieza. La recuperación actual depende del reintento del evento; desacoplar IA lenta antes de añadirla al camino síncrono.
- Sesiones/enlaces web con hash, expiración y canje de un uso existen, pero falta montar login/canje público y conectar paneles reales.

## Endpoint y configuración reales

- Ruta nueva: `app/api/webhooks/infobip/route.ts`, `POST /api/webhooks/infobip`.
- Composición perezosa de servidor: `src/modules/http/infobip.ts`; límite de cuerpo 256 KiB antes de acumularlo, headers originales y ningún requisito de cookie de demo.
- Está **deshabilitada por defecto** salvo `INFOBIP_WEBHOOK_ENABLED=true`; configuración incompleta devuelve 503, sin fallback a mocks.
- Variables de `.env.example` (sin compartir valores secretos):

```dotenv
SUPABASE_URL=
# Puede usar NEXT_PUBLIC_SUPABASE_URL como fallback de URL, nunca de clave.
SUPABASE_SERVICE_ROLE_KEY=
INFOBIP_WEBHOOK_ENABLED=false
INFOBIP_BASE_URL=
INFOBIP_API_KEY=
INFOBIP_WHATSAPP_SENDER=
INFOBIP_WEBHOOK_USERNAME=
INFOBIP_WEBHOOK_PASSWORD=
INFOBIP_ONBOARDING_SECRET=
```

- Sender de plataforma: dígitos sin `+`. Password Basic: al menos 24 caracteres. Secret de continuaciones: al menos 32 bytes, estable entre instancias/despliegues mientras existan aprobaciones vigentes.
- Configurar en Infobip el mismo perfil Basic y la URL HTTPS real. Verificar entrada de mensajes libres; no basta una palabra clave de activación.
- El plan de R2 reportó un envío real recibido mediante remitente de prueba. La recepción/respuesta automática real aún no se comprobó en este trabajo. Una clave de Infobip se documentó como expuesta previamente: usar una nueva revocando la anterior, sin pegar secretos en chats/commits/logs.
- No se habilitaron credenciales ni se enviaron mensajes externos durante las últimas correcciones.

## Demo web del rol 3

- `/chat` y `/distribuidores` funcionan como demo **mock** con texto/carga de imagen/audio, historial temporal y pedidos ficticios.
- `.env.example` tiene `MOCK_MODE=true`; este modo solo corresponde a la demo web, independiente del webhook real.
- El panel de distribuidores no está respaldado por pedidos reales en DB. No hay todavía tablas reales de distribuidores, pedidos, compras, comisiones o campañas en estas migraciones.
- `configureHttp` en `http/container.ts` permite inyectar servicios web reales. La autenticación/servicios web no están conectados por defecto.
- `src/contracts/common.ts` mantiene `Actor` web; WhatsApp tiene `WhatsAppActor` separado. No forzar uno sobre el otro y romper la demo.

## Pruebas realizadas y comandos

La última ejecución pasó:

- `npm run validate`: TypeScript, lint y **57 pruebas**; una integración local se omite deliberadamente en el recorrido por defecto.
- `npm run build`: producción Next.js, incluyendo ruta Infobip.
- `python3 scripts/check-role2-local.py`: **prueba adicional aprobada**, con PostgreSQL/PostgREST local reales y únicamente HTTP saliente Infobip simulado. Comprueba claims simultáneos, confirmaciones simultáneas, duplicados de evento, cambio de precio y cancelación de gastos; elimina sus fixtures.
- `supabase/checks/role2-storage.sql`: comprobaciones SQL aprobadas con rollback para leases, identidad, replay, enlaces de uso único, cancelación/expiración de gastos y permisos.
- Los E2E UI fueron entregados por R3; no se volvieron a ejecutar en la última corrección porque no se cambiaron pantallas. No afirmar que se probaron WhatsApp real o despliegue público.

```bash
npm ci
npx supabase start
npx supabase db push                # CLI 3: local; comprobar Target
npm run validate
npm run build
python3 scripts/check-role2-local.py
```

Comprobaciones SQL locales disponibles:

```bash
npx supabase db query --file supabase/checks/whatsapp-sales.sql
npx supabase db query --file supabase/checks/whatsapp-conversations.sql
npx supabase db query --file supabase/checks/onboarding-and-prices.sql
npx supabase db query --file supabase/checks/standard-products-accounting.sql
npx supabase db query --file supabase/checks/role2-storage.sql
```

`scripts/check-role2-local.py` obtiene URL/clave local de la CLI sin imprimirlas y rechaza hosts externos. No pasarle la base real. El script requiere Python 3 además de Node/CLI. La corrección de lint usa `--no-warn-ignored` porque `next-env.d.ts` está ignorado intencionalmente. Next puede regenerar ese archivo al compilar; evitar introducir referencias a `.next` que no existan en un checkout limpio antes de typecheck.

## Qué sigue para terminar

1. Revisar/guardar los cambios locales de la última entrega y compartirlos con el equipo. No hacer reset o sobrescribirlos para repetir implementaciones ya hechas.
2. Coordinar aplicación de migraciones 001–007 a `microai-dev`; primero verificar el proyecto y `npx supabase db push --dry-run --remote`. No hacer reset remoto. Un responsable despliega migraciones; la app alojada usa la misma DB.
3. R3 configura variables y publica HTTPS; R2 configura perfil/enrutamiento de entrada de Infobip y contrasta el payload real. Es la prioridad inmediata para demostrar WhatsApp de punta a punta.
4. Probar desde un teléfono permitido: alta -> catálogo estándar -> “vendí una coca” -> elegir presentación -> resumen -> confirmar -> verificar `sales/sale_items/products`; repetir confirmación; falta de stock; cambio de precio; gasto/cancelación; reporte y zona horaria.
5. Completar panel de productos, autenticación web y datos reales de paneles según los contratos; después distribuidores/pedidos si el alcance de la demo lo exige.
6. Completar rol 1 multimodal: descarga segura a cargo del adaptador R2, referencias de almacenamiento hacia R1, transcripción/OCR/interpretación, respaldo Bedrock/modelo por seleccionar. Toda salida estructurada debe usar el mismo estándar, validación y confirmaciones; no generar ventas/productos automáticamente.
7. Implementar creación asistida de productos usando giro como contexto, con revisión explícita del comerciante y el mismo RPC estándar. No hay esta IA implementada todavía.

Aspectos que aún requieren atención, sin dar por resueltos: recuperación automática/retención de payloads, UI amigable para comandos firmados largos, permisos/políticas reales en remoto, y cancelación de alta (`CANCELAR ALTA` actualmente no revoca de forma persistente un token firmado anterior; revisar si se presenta como cancelación definitiva). Los puntos anteriores no invalidan las pruebas locales ya indicadas.

## Preferencias de colaboración

El usuario prefiere español claro, acciones concretas y continuidad autónoma. Se confundió con explicaciones extensas de configuración: guiar un paso a la vez. No volver a preguntar reglas ya decididas. Consultar fuentes oficiales para detalles actuales de proveedores. No pedir ni imprimir secretos. No afirmar que una prueba con mocks equivale a WhatsApp real. No desplegar ni contactar terceros sin autorización correspondiente.

## Revisión de continuidad — 15 de noviembre de 2026 (UTC)

- Se contrastaron el resumen, el árbol de trabajo y los commits: HEAD inicial `d0a7383`; la entrega correctiva seguía local, sin commit.
- Se repitieron satisfactoriamente `npm run validate` (57 pruebas, una integración omitida), `npm run build` y `python3 scripts/check-role2-local.py` (una integración con Supabase local real; HTTP saliente Infobip simulado).
- Se comprobó el destino alojado mediante `npx supabase db push --dry-run --remote`: **microai-dev**, ref `hfcetxrktdorebepttof`, etiquetado `production` por la CLI. El plan propone las migraciones **001–007**; ninguna se aplicó en esta revisión.
- Una consulta remota de solo lectura a `pg_tables` no encontró tablas en el esquema `public`. Esto comprueba que no están las tablas de negocio; no constituye una revisión integral de permisos del proyecto.
- No existe vínculo local `.vercel/project.json`. No se verificó dominio público, variables de Vercel, enrutamiento de Infobip ni WhatsApp real. No se hizo push ni despliegue.
- El build regeneró `next-env.d.ts`; se repuso exactamente su contenido previo para evitar introducir dependencia de `.next` en un checkout limpio.
- Próximo paso operativo: aplicar las siete migraciones revisadas en el entorno alojado mediante el responsable de migraciones; después configurar/publicar la aplicación y enlazar Infobip. No usar un reset remoto.
