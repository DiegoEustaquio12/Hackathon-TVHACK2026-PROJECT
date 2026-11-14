---
name: nextjs-http-contract
description: Implementa rutas API en Next.js App Router, esquemas Zod en src/contracts/ y adaptadores en src/modules/http/ con sesión verificada, centavos MXN (*_cents), timestamps ISO UTC y errores { code, message }. Úsala al crear o editar endpoints, contratos o mocks.
---

# Reglas de Contratos y Capa HTTP (Rol 3)

1. **Contratos (`src/contracts/`):**
   - Valida entradas y salidas con Zod y exporta los tipos inferidos.
   - Montos monetarios: siempre enteros en centavos MXN con sufijo `*_cents` (`z.number().int()`).
   - Fechas: strings ISO 8601 UTC (`z.string().datetime({ offset: false })`).
   - Errores HTTP: estructura exacta `{ code: string, message: string }`.

2. **Seguridad y Sesión (`src/modules/http/` y `app/api/`):**
   - Obtén el actor y su `businessId` únicamente desde la sesión verificada en servidor.
   - Usa `.strict()` en esquemas de entrada para rechazar cualquier `businessId` enviado por el navegador en body o query params.
   - Si no hay sesión válida, retorna `401` con `{ code: "UNAUTHORIZED", message: "..." }`.

3. **Desacoplamiento y Mocks:**
   - Los handlers en `app/api/` solo validan con Zod, resuelven la sesión e invocan interfaces definidas en `src/contracts/services.ts`.
   - Cuando `MOCK_MODE=true`, el contenedor de servicios inyecta implementaciones mock sin depender de AWS Bedrock ni Meta/WhatsApp.