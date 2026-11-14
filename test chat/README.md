# Chat local de prueba de Knectan

Respaldo local independiente para conversar con el asistente cuando WhatsApp no está disponible. Conserva la identidad de Knectan y la interfaz oscura del chat de referencia.

## Ejecutar

Requiere Node.js 22 o superior.

```sh
npm install
npm run dev:local -- --port 3001
```

Abre <http://127.0.0.1:3001/chat>. Si el puerto está ocupado, usa otro. `dev:local` activa datos de prueba locales; no requiere configurar WhatsApp, Infobip ni Supabase.

Escribe `ayuda` para ver ejemplos. El chat puede registrar ventas y gastos después de pedir confirmación, consultar ventas del día, conservar historial, enviar texto, adjuntar imágenes y audios y grabar notas de voz desde un navegador compatible. Los datos locales se guardan en `.local-chat/`, que Git excluye.

El catálogo precargado es solo una muestra: Coca-Cola 600 ml ($20) y pan dulce ($10), ambos con 100 unidades. Las fotos y notas de voz se conservan y reproducen, pero este modo no las analiza ni las transcribe. El registro no se sincroniza con la aplicación de producción.
