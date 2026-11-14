# Base local de MicroAI

La CLI está vinculada a `microai-dev`. En Supabase CLI 3, los comandos de base de datos apuntan al entorno local por defecto. Revisar siempre la línea `Target:` antes de aplicar cambios; `--remote` apunta al proyecto alojado.

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

La segunda migración retira la escritura directa de ventas a `authenticated` y permite ejecutar el RPC solo a `service_role`. También impide que un cliente cambie el número WhatsApp del negocio. El panel de productos conserva permisos para editar precios y existencias de su propio negocio.

Comprobar comportamiento en local sin conservar fixtures:

```bash
npx supabase db query --file supabase/checks/whatsapp-sales.sql
npx supabase db query --file supabase/checks/whatsapp-conversations.sql
npx supabase db query --file supabase/checks/onboarding-and-prices.sql
```

La migración `202611140003_provider_independent_whatsapp.sql` mantiene las reglas de venta y cambia el origen predeterminado a `whatsapp`. Agrega eventos de proveedor y borradores de venta para reemplazar Flows por conversación con Infobip. Sus funciones solo son invocables desde servidor.

La migración `202611140004_onboarding_and_price_confirmation.sql` agrega giro y fecha de alta explícita, exige alta completa antes de vender y agrega resúmenes de precio versionados. Negocios existentes quedan pendientes de completar giro; no se inventa uno en la migración. La confirmación de borradores ahora recibe versión y devuelve un estado tipado. Ver el contrato de datos para adaptar consumidores anteriores.
