# Base local de Knectan

La CLI conserva su vinculación al proyecto Supabase alojado existente. El rebranding de la aplicación no renombra ese recurso externo. En Supabase CLI 3, los comandos de base de datos apuntan al entorno local por defecto. Revisar siempre la línea `Target:` antes de aplicar cambios; `--remote` apunta al proyecto alojado.

## Inicio y datos de ejemplo

```bash
npx supabase start
npx supabase migration list
npx supabase db query --file supabase/seed.sql
```

El seed crea Abarrotes Lupita con Coca a $20 y Pan a $15, ambos con 10 unidades. Se puede ejecutar de nuevo sin duplicar registros ni reponer stock existente. No crea credenciales, usuarios de Auth, sesiones de WhatsApp ni ventas. El rol 2 deberá vincular la identidad autenticada al negocio antes de que RLS permita consultar estos datos desde la aplicación.

Abrir Supabase Studio local en `http://127.0.0.1:54323` y consultar `businesses` y `products` en Table Editor.

## Registro de ventas

La migración `202611140002_record_whatsapp_sale.sql` implementa la operación transaccional: toma precios del catálogo, bloquea filas, comprueba stock, lo descuenta e inserta venta y artículos. Deduplica reintentos y detecta claves reutilizadas con otro carrito.

La segunda migración retira la escritura directa de ventas a `authenticated` y permite ejecutar el RPC solo a `service_role`. También impide que un cliente cambie el número WhatsApp del negocio. La migración 005 también retira las escrituras directas de productos y gastos: el panel debe usar los RPC de servidor con identidad verificada.

Comprobar comportamiento en local sin conservar fixtures:

```bash
npx supabase db query --file supabase/checks/whatsapp-sales.sql
npx supabase db query --file supabase/checks/whatsapp-conversations.sql
npx supabase db query --file supabase/checks/onboarding-and-prices.sql
npx supabase db query --file supabase/checks/standard-products-accounting.sql
npx supabase db query --file supabase/checks/role2-storage.sql
```

La migración `202611140003_provider_independent_whatsapp.sql` mantiene las reglas de venta y cambia el origen predeterminado a `whatsapp`. Agrega eventos de proveedor y borradores de venta para reemplazar Flows por conversación con Infobip. Sus funciones solo son invocables desde servidor.

La migración `202611140004_onboarding_and_price_confirmation.sql` agrega giro y fecha de alta explícita, exige alta completa antes de vender y agrega resúmenes de precio versionados. Negocios existentes quedan pendientes de completar giro; no se inventa uno en la migración. La confirmación de borradores ahora recibe versión y devuelve un estado tipado. Ver el contrato de datos para adaptar consumidores anteriores.

La migración 005 agrega especificaciones/alias de productos, RPC de creación/edición comercial, gastos idempotentes y reporte diario. Las escrituras de productos/gastos desde clientes se sustituyen por RPC de servidor. Los productos antiguos se preservan sin inferir marca/contenido. Antes de consultar un día configurar la zona IANA mediante `setBusinessTimeZone`; no hay una zona supuesta silenciosamente.

La migración 006 exige `expected` al editar precio/costo/stock para evitar sobrescribir valores cambiados desde que se abrió el formulario, especialmente ventas simultáneas. Ante `PRODUCT_CHANGED`, recargar el producto y solicitar revisar la edición.

La migración 007 incorpora el almacenamiento R2 revisado: eventos con payload/respuesta durable y leases de 60 segundos, sesiones/enlaces privados y borradores de gasto cancelables. `src/modules/auth/storage/role2.sql` queda como referencia; no aplicarlo por separado.

Con Supabase local iniciado y migraciones aplicadas, ejecutar `python3 scripts/check-role2-local.py` para la prueba integrada real de repositorios y webhook. Obtiene credenciales de la CLI sin imprimirlas, verifica host local, simula solo HTTP hacia Infobip y borra sus fixtures al terminar. `npm test` omite deliberadamente esta prueba salvo ejecución explícita. No se envían mensajes reales.

## Base alojada y aceptación transaccional

Las migraciones 001–007 están aplicadas y comprobadas en `microai-dev` (`hfcetxrktdorebepttof`). El dry-run posterior quedó sin pendientes; las 11 tablas tienen RLS. Los RPC privilegiados están restringidos a servidor.

Para repetir las comprobaciones de dominio y permisos sin conservar datos:

```bash
python3 scripts/check-role1-database.py
# Remoto: ejecución explícita con fixtures transitorios y rollback.
python3 scripts/check-role1-database.py --remote-ref hfcetxrktdorebepttof
```

El comprobador reutiliza cuatro pruebas SQL con números sintéticos nuevos y aborta ante una identidad existente. Cada bloque revierte sus fixtures y una subtransacción exterior revierte cualquier cambio residual. Las aserciones inesperadas fallan la sentencia completa. No envía WhatsApp ni cambia migraciones. La CLI requiere acceso al destino elegido; no imprimir ni compartir credenciales.

Se comprobó en local y remoto. Es una prueba SQL secuencial, no una prueba del webhook desplegado, PostgREST remoto o concurrencia remota. `scripts/check-role2-local.py` sigue siendo exclusivamente local.
