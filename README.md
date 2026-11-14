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
