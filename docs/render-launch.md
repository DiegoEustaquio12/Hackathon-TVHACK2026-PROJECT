# Prueba de WhatsApp en Render

Esta rama (`codex/whatsapp-deploy`) incorpora `render.yaml` para crear un Web Service de Next.js y servir en el mismo host la web y `POST /api/webhooks/infobip`. El estado se guarda en Supabase, no en el disco efímero de Render.

## Crear el servicio

1. En Render, inicia sesión y usa **New → Blueprint**.
2. Conecta el repositorio `DiegoEustaquio12/Hackathon-TVHACK2026-PROJECT`, selecciona la rama `codex/whatsapp-deploy` y el archivo `render.yaml`.
3. Render solicitará los valores marcados `sync: false`. Añade las credenciales existentes de Supabase e Infobip en Render; no las copies al repositorio. Confirma que `INFOBIP_WHATSAPP_SENDER` contenga solo 8–15 dígitos, sin `+`, como espera el código.
4. Crea y espera a que el servicio quede **Live**. Comprueba `https://<servicio>.onrender.com/api/health`; debe responder 200.
5. Configura en Infobip el webhook HTTPS `https://<servicio>.onrender.com/api/webhooks/infobip`, con Basic Auth usando exactamente el usuario y contraseña cargados en Render. Activa los eventos de mensaje entrante del sender configurado.
6. Envía un mensaje desde un número permitido y revisa los logs del servicio. La prueba final es recibir una respuesta en WhatsApp y verificar en Supabase que el movimiento confirmado se guardó.

La plantilla usa el plan gratuito para permitir una prueba sin iniciar cargos. En Render, los servicios gratuitos se suspenden tras 15 minutos sin tráfico y pueden tardar en arrancar al primer mensaje; no conviene tratarlo como servicio estable de producción. El plan Starter cuesta actualmente USD 7 al mes y mantiene el servicio activo; se selecciona en Render, no en el archivo, para evitar crear cargos sin autorización explícita. Render documenta este comportamiento en [límites del plan gratuito](https://render.com/docs/free) y [precios](https://render.com/pricing).

El flujo de WhatsApp usa Infobip. El webhook no depende de `MOCK_MODE`; ese flag solo mantiene disponible la web de demostración. Las banderas de audio y tickets siguen desactivadas, así que este despliegue de prueba se enfoca en mensajes de texto y operaciones existentes. Las migraciones requeridas deben estar aplicadas en el proyecto Supabase de estas credenciales antes de probar operaciones.
