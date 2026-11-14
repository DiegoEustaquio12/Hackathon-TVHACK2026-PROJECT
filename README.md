# MicroAI

Base inicial del MVP descrito en `MicroAI_MVP_Arquitectura_Plan.md` (documento fuente fuera del repositorio).

## Stack

- Next.js App Router, React y TypeScript.
- CSS nativo: CSS Modules por componente y `app/globals.css` solo para tokens/reset. No se usa Tailwind.
- Supabase PostgreSQL/Auth/Storage como servicios de datos.
- Adaptadores de IA y mensajería desacoplados de la lógica de negocio.
- Canal principal del comerciante: WhatsApp mediante Infobip, con confirmaciones conversacionales; Flows queda fuera del MVP actual.

## Inicio

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar los secretos necesarios.
3. `npm run dev`

## Trabajo en paralelo

La división, contratos de integración, propiedad de carpetas y secuencia de integración están en [`docs/parallel-work.md`](docs/parallel-work.md). Cada persona debe trabajar principalmente en sus carpetas asignadas y coordinar cambios a contratos antes de implementarlos.

Ver [`docs/integration-contracts.md`](docs/integration-contracts.md) para distinguir contratos propuestos de funciones existentes, y [`docs/local-database.md`](docs/local-database.md) para la base local y comprobaciones.
