# Knectan

MVP de Knectan para comercios y proveedores, basado en el documento de arquitectura fuente fuera del repositorio.

## Stack

- Next.js App Router, React y TypeScript.
- CSS nativo: CSS Modules por componente y `app/globals.css` solo para tokens/reset. No se usa Tailwind.
- Supabase PostgreSQL/Auth/Storage como servicios de datos.
- Adaptadores de IA y mensajería desacoplados de la lógica de negocio.
- Canal principal del comerciante: WhatsApp mediante Infobip, con confirmaciones conversacionales; Flows queda fuera del MVP actual.

## Inicio

1. `npm install`
2. Copiar `.env.example` a `.env.local`; `MOCK_MODE=true` permite ejecutar sin credenciales externas.
3. `npm run dev`

Demo: `/chat`, `/distribuidores` y `/publicidad`. Incluye alta/baja de pedidos con KPIs y selector de tres planes de visibilidad con activación simulada. Validación: `npm run validate`, `npm run build` y `npm run test:e2e`.
La guía de entorno, pruebas, contratos y despliegue está en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

El webhook real está en `POST /api/webhooks/infobip`; requiere habilitación y configuración de servidor independientes de los mocks web. Ver la sección de Infobip en la guía de despliegue. Integración contra base local: `python3 scripts/check-role2-local.py` (solo el proveedor saliente se simula).

## Trabajo en paralelo

La división, contratos de integración, propiedad de carpetas y secuencia de integración están en [`docs/parallel-work.md`](docs/parallel-work.md). Cada persona debe trabajar principalmente en sus carpetas asignadas y coordinar cambios a contratos antes de implementarlos.

Ver [`docs/integration-contracts.md`](docs/integration-contracts.md) para distinguir contratos propuestos de funciones existentes, y [`docs/local-database.md`](docs/local-database.md) para la base local y comprobaciones.

## Chat de respaldo local

`npm run dev:local -- --port 3001` inicia el chat en `http://127.0.0.1:3001/chat` sin credenciales, WhatsApp, Infobip ni Supabase. Si ya hay otro servidor en ese puerto, elige otro. El chat conserva el estilo oscuro de la referencia y la marca Knectan. Incluye texto (Enter para enviar, Shift+Enter para salto de línea), emojis, fotos, archivos de audio y grabación de hasta un minuto en navegadores compatibles. Los archivos admiten hasta 2 MB.

Prueba `ayuda`, `catálogo`, `Vendí 3 cocas y 2 panes`, `Gasté 50 en luz`, `confirmar`, `cancelar` y `ventas de hoy`. Las operaciones solo se guardan después de confirmarlas. Usa el intérprete de ventas existente; no requiere un modelo externo. El catálogo inicial **es de prueba**, con Coca-Cola 600 ml a $20 y pan dulce a $10 (100 unidades de cada uno). Las fotos y audios se almacenan y reproducen, pero no se analizan ni transcriben.

Activa `MOCK_MODE=true` y `LOCAL_CHAT_MODE=true` solo en este entorno local. Los datos se guardan en `.local-chat/` (excluido de Git), o en `LOCAL_CHAT_DIR` si se configura. Se conserva el último historial de 20 mensajes y los movimientos confirmados sobreviven reinicios del servidor. Cada sesión tiene su propio registro: la cookie de demo dura seis horas; al vencer o borrarla se inicia otra sesión y los archivos anteriores quedan en disco. Este respaldo no se sincroniza con WhatsApp ni con la base de producción, no es un chat entre personas y no se debe desplegar como autenticación de producción. El reporte calcula el día en `America/Mexico_City`.

Para probar con Chrome instalado: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` después de `npm run build`. Las pruebas de navegador activan el respaldo local y guardan sus datos en `.local-chat/e2e`.
