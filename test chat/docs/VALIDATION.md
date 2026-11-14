# Validación del Rol 3

GATE: ERROR. El gate de taste-skill no pudo iniciar Chrome dentro del sandbox de Windows; no produjo informe de consistencia, layout ni copy. Conforme a la skill, no se reinició ese gate ni se declararon sus comprobaciones aprobadas. Las pruebas funcionales y de accesibilidad de navegador se ejecutaron después fuera del sandbox.

## Resultado final

| Verificación | Resultado |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | Aprobado |
| `npm run lint` (sin warnings permitidos) | Aprobado |
| `npm test` | 13 pruebas, 3 archivos, aprobadas |
| `npm run build` | Build de producción Next.js 15.5.29 aprobado |
| `npm run test:e2e` | 6 recorridos aprobados en Chrome de escritorio y móvil |
| axe WCAG A/AA, incluidas reglas WCAG 2.1 AA | Sin infracciones detectadas en las dos pantallas verificadas |
| Ancho de página | Sin desbordamiento a 1440, 1024, 820, 768, 390 y 320 px |
| Auditoría npm al instalar el árbol final | 0 vulnerabilidades reportadas |

El E2E usa el servidor compilado de producción con `MOCK_MODE=true`, no reemplaza las respuestas de los recorridos exitosos con interceptores. Los interceptores solo se usan para comprobar errores y su recuperación. Texto, imagen PNG y audio WAV recorren el cliente, los handlers, los servicios mock y el historial. El panel comprueba filtros, vacío, actualización de estado, indicadores y continuidad tras recargar.

Los tests de rutas cubren sesión ausente/alterada/expirada, cookies de demo rechazadas fuera del modo mock, rechazo de `businessId`, campos desconocidos y query duplicada, límite de payload, origen, JSON inválido, errores sanitizados, idempotencia y aislamiento. Una prueba adicional restituye pedidos firmados en una instancia mock nueva y comprueba el límite de 4 KB de cookie. La validación de origen incluye la diferencia entre el hostname interno de Next y el `Host` público.

## Revisión visual y skills

Se revisaron capturas del chat a 1440 y 390 px y del panel a 1440 px. La captura móvil inicial del panel del script `shoot.mjs` quedó incompleta al final; no se consideró evidencia de esa parte. El recorrido E2E final verificó el panel móvil completo y sus acciones. Las capturas temporales permanecen en `.taste-skill/shots/`, ignoradas por Git. Los scripts de performance y el checker completo de marketing no se consideran ejecutados/aprobados.

La interfaz es software en modo **Operate**, con la paleta verde existente, Segoe UI local, navegación lateral adaptable y CSS Modules. No se añadieron hero, efectos, escenas ni momentos de marketing; el flujo operativo y las rutas de servidor requeridas por el brief tienen prioridad. Voz: instrucciones breves, acciones explícitas y aviso visible de simulación. No se solicitaron ni usaron fotografías, identidades de clientes reales o nombres de marca nuevos; los comercios y cifras pertenecen exclusivamente a los fixtures pedidos por el brief. No hay stand-ins de contacto, dominio canónico o formularios comerciales pendientes. No se declararon waivers ni se ocultaron findings del checker.

## Límites

La comprobación automática de accesibilidad no equivale a una certificación WCAG completa. Se verificó el acceso inicial por teclado; la grabación de micrófono está implementada con liberación de tracks y límites, mientras que el recorrido automatizado de audio utiliza un archivo WAV. Los mocks no interpretan imágenes ni transcriben audio. El historial en servidor es temporal y puede perderse en arranques en frío; la continuidad de pedidos entre funciones utiliza una cookie firmada. Ver [DEPLOYMENT.md](DEPLOYMENT.md) para expiración, concurrencia y conexión de servicios reales.

La aplicación está preparada para desplegarse en Vercel; no se publicó un deployment ni se usaron credenciales de proveedores durante este trabajo. No se modificó `backend/` ni se añadieron esquemas o migraciones de base de datos.
