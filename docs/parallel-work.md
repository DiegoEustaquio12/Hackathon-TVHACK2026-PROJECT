# Trabajo paralelo — Knectan / MicroAI

Actualizado: 14 de noviembre de 2026. Canal principal: **WhatsApp mediante Infobip**. El comerciante opera dentro del chat. Flows queda fuera del MVP actual; la web sirve para paneles y apoyo.

Leer esta guía y [los contratos](integration-contracts.md). Después continuar con [rol 1](roles/rol-1-ia-multimodal-y-datos.md), [rol 2](roles/rol-2-orquestacion-auth-mensajeria.md) o [rol 3](roles/rol-3-frontend-backend-despliegue.md).

## Estado de partida

| Parte | Estado y evidencia | Pendiente |
| --- | --- | --- |
| Datos / R1 | Migraciones 001–003 aplicadas localmente; repositorios de ventas, eventos y borradores; TypeScript y comprobaciones SQL pasaron | Parser, lookup de negocio, catálogo/reportes y medios |
| Infobip / R2 | El plan recibido reporta un envío real recibido por el destinatario | Adaptador, autenticación del webhook, entrada real y conversación automática |
| HTTP / R3 | Esqueleto Next.js con páginas iniciales | Contratos TS, endpoint público, paneles y despliegue |
| Supabase alojado | Repositorio vinculado a `microai-dev` | No asumir migraciones locales desplegadas allí |

Varios archivos de `src/`, migraciones y comprobaciones siguen sin seguimiento de Git: incluirlos en los PRs. Documentar una función no sustituye entregar su implementación.

## Trabajo inmediato en paralelo

| Rol | Primera entrega | Avanza usando | Entrega a otros |
| --- | --- | --- | --- |
| R1 | Parser de texto, catálogo y lookup de negocio por número | Catálogo fixture o base local | Intérprete real y consultas para R2 |
| R2 | Adaptador Infobip, normalización/autenticación y confirmaciones | Intérprete mock y repositorios existentes R1 | Handler y fixtures sanitizados para R3 |
| R3 | Contratos TS, transporte HTTP y URL pública | Handler mock inyectado | Ruta desplegada y configuración para R2 |

## Propiedad de archivos

| Propietario | Archivos |
| --- | --- |
| R1 | `src/modules/interpretation/`, `src/modules/media/`, `src/modules/data/`, `supabase/`, `docs/local-database.md`, documento R1 |
| R2 | `src/modules/messaging/`, `src/modules/orchestration/`, `src/modules/auth/`, documento R2 |
| R3 | `app/`, `components/`, `src/modules/http/`, `src/contracts/`, configuración raíz, `.env.example`, despliegue, documento R3 |
| R3 coordina cambios compartidos | Esta guía, contratos de integración, README y dependencias raíz |

El parser de **payload Infobip** es de R2; el intérprete de **ventas del comerciante** es de R1; validación y transporte HTTP son de R3. No duplicar esas implementaciones.

## Coordinación

1. Cada integrante usa rama y checkout/worktree propios. No cambiar la rama de una carpeta usada por otra persona/agente.
2. Primeros PRs: R1 publica repositorios y migraciones existentes; R3 publica tipos mínimos documentados. R2 empieza con interfaces locales compatibles mientras se integran.
3. Entregar PRs pequeños con archivos completos, instrucciones reproducibles, fixtures sanitizados y verificaciones reales. Evitar copias divergentes de contratos.
4. Para modificar una carpeta ajena, describir el cambio de interfaz en el PR y coordinar con el propietario; continuar las tareas independientes.
5. Cada persona configura sus variables locales. Secretos fuera de Git; datos ficticios en fixtures.
6. R1 controla el orden de migraciones: conservar aplicadas y añadir nuevas. Una sola persona designada despliega migraciones a `microai-dev` tras comprobar el destino; R3 configura el despliegue contra ese mismo entorno.
7. R3 coordina dependencias para evitar ediciones simultáneas a `package.json` y lockfile; incluir ambos cuando corresponda.

## Hitos

- **A — Independencia:** R1 interpreta fixtures; R2 procesa mensajes con dependencias mock; R3 prueba transporte con handler mock. Ninguno necesita credenciales ajenas.
- **B — Integración local:** fixture entrante -> intérprete real -> borrador -> confirmar -> una venta y stock actualizado. Probar reintentos y dos mensajes distintos confirmando el mismo borrador.
- **C — Transporte real:** R3 publica la URL; R2 configura enrutamiento y demuestra entrada y respuesta real. Verificar mensajes libres, no solo palabra clave de activación.
- **D — Demo WhatsApp:** “Vendí 3 cocas y 2 panes” -> resumen $90 -> confirmar -> dos artículos y descuento -> ventas del día. Separar resultados de mocks y pruebas reales.

Si Infobip no recibe mensajes, continuar A/B y documentar el bloqueo. Una demo web no demuestra recepción WhatsApp.

## Reglas comunes

- Un usuario propietario por negocio; número WhatsApp verificado y normalizado como identificación principal; UUID como clave interna. Nunca aceptar identidad de negocio desde el texto/formulario.
- Precio editable solo desde catálogo y conservado como snapshot en la venta.
- Toda venta conversacional del MVP requiere resumen y confirmación explícita, incluso con confianza alta.
- Stock obligatorio y no negativo; falta de stock rechaza la venta completa. No poner a cero unidades que todavía existen.
- MXN en centavos enteros; cantidades hasta tres decimales; fechas ISO UTC. Ventas y utilidad son conceptos distintos.
- Bedrock, audio, imágenes, distribuidores y publicidad siguen al recorrido de texto confirmado; no bloquean ese recorrido.
