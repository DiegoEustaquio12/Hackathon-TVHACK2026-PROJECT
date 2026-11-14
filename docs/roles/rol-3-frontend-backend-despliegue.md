# Rol 3 — Frontend, backend HTTP y despliegue

## Objetivo

Construir interfaces, exponer contratos HTTP y mantener ejecutable e integrable la aplicación.

## Responsabilidades

- Construir chatbot web y panel de distribuidores.
- Crear formularios accesibles para capturar texto, audio e imagen.
- Implementar rutas API de Next.js con validación de request/response.
- Mantener contratos compartidos y mocks para permitir trabajo paralelo.
- Configurar entorno, build/CI y despliegue en Vercel.
- Mantener un modo mock local para que la interfaz avance antes de las integraciones externas.

## Carpetas a cargo

- `app/`
- `components/`
- `src/contracts/` (coordina cambios con los otros roles)
- `src/modules/http/`
- Configuración raíz y documentación de despliegue.

## Contratos de integración

Las rutas validan payloads (Zod), obtienen el actor desde sesión verificada y no confían en un `businessId` enviado por el navegador. Invocan servicios de orquestación y dominio mediante interfaces.

Las cantidades monetarias se representan como enteros en centavos MXN (`*_cents`); timestamps ISO UTC; errores como `{ code, message }`.

## No cubre

Prompts/modelos, políticas de WhatsApp, esquema/migraciones de base de datos ni lógica contable.

## Criterio de entrega

La demo web permite recorrer las pantallas contra mocks y desplegarse sin depender de Bedrock o credenciales de Meta.
