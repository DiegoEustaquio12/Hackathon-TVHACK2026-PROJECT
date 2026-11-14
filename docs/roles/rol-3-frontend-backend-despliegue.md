# Rol 3 — Frontend, backend HTTP y despliegue

## Objetivo actual

Entregar el transporte público de Infobip y los paneles de Knectan. WhatsApp es el canal principal del comerciante; la web sirve como apoyo. Leer [guía paralela](../parallel-work.md) y [contratos](../integration-contracts.md).

## Trabajo inmediato en paralelo

1. Materializar en `src/contracts/` los tipos documentados de Actor, mensaje, interpretación y errores. Mantener mocks compatibles para que R1/R2 no esperen al despliegue.
2. Preparar `POST /api/webhooks/infobip` con handler inyectable, límite de tamaño y lectura única del cuerpo. Entregar bytes/cabeceras originales a R2; autenticación y clasificación pertenecen a R2. Probar con handler mock mientras llega el real.
3. Publicar HTTPS en Vercel y entregar URL/método/estado a R2 para configurar enrutamiento. Diferenciar ruta montada de integración real; el mock público no puede fingir efectos de venta.
4. Actualizar `.env.example` con nombres de variables acordados con R2, sin secretos. El cliente privilegiado Supabase vive en servidor; la app alojada apunta a `microai-dev`, no a la base local.
5. Implementar panel de productos con precio/stock editables fuera de la venta y luego reportes. Usar catálogo fixture mientras R1 entrega consultas; auth mock únicamente en desarrollo local mientras R2 entrega sesiones.
6. Reemplazar mocks por adaptadores reales. Coordinar con R1 las migraciones de la base alojada antes del tráfico real; una persona designada las despliega.

## Carpetas a cargo

`app/`, `components/`, `src/modules/http/`, `src/contracts/`, configuración raíz, dependencias/lockfile, `.env.example`, despliegue y este documento. Coordinar cambios a README y guías compartidas. No editar migraciones/repositorios R1 ni implementar otro adaptador Infobip/orquestador.

## UI y reglas de integración

El panel de productos debe recopilar la especificación de [product-standard.md](../product-standard.md), no solo un nombre libre. Usar `createStandardProduct` y `updateProductCommercials` desde servidor; el segundo exige los valores originales `expected` y devuelve `PRODUCT_CHANGED` si la información quedó antigua. La migración 005 retira escrituras directas del navegador sobre productos/gastos. Las lecturas conservan RLS. Para gastos/reportes ver [accounting-contract.md](../accounting-contract.md); pedir zona horaria y nunca etiquetar ventas menos gastos como utilidad.

- Next.js, TypeScript y CSS Modules. Globales solo para reset/tokens. Aplicar las skills visuales disponibles al implementar pantallas.
- Identidad desde sesión verificada; `businessId` del navegador no autoriza acceso. R2 implementa identidad y R3 conecta sesión/transporte.
- Precios de catálogo, sin edición durante venta; mostrar agotados/errores de stock y evitar venta parcial.
- MXN en centavos enteros, fechas ISO UTC, errores HTTP `{ code, message }` sin filtrar detalles internos.
- Auth mock y claves privilegiadas nunca expuestas en producción. Si falla autenticación, rechazar, no aceptar negocios arbitrarios.
- Acordar códigos HTTP con R2: éxito tras procesamiento o aceptación durable. Registrar metadatos del evento R1 no garantiza cola durable.

## Entregables

- PR temprano de contratos TS, fixture/mocks y ejemplo del handler.
- Ruta HTTP con verificación de entrada, errores y autenticación delegada.
- URL pública real, variables necesarias y procedimiento reproducible de despliegue.
- Build y evidencia del entorno usado, sin secretos ni mensajes completos en logs.

## Criterio de entrega

El endpoint entrega un evento autenticado por R2 al orquestador. Reportar pruebas mock aparte de recepción WhatsApp real. Los paneles editan solo productos del negocio autenticado y el build pasa. Antes de habilitar cambios de precio durante una confirmación, coordinar detección/nuevo resumen con R1/R2.

## Después del recorrido principal

Panel de distribuidores, pedidos, acceso web complementario y mejoras visuales. No retrasar la URL pública requerida para WhatsApp por terminar esas pantallas.
