# Migraciones

Agregar aquí migraciones SQL versionadas. Definir primero claves foráneas, restricciones, índices, RLS y políticas por negocio; no desplegar con RLS deshabilitado.

008 añade buckets privados `business-audio`/`business-images`, metadatos `business_media` y políticas restrictivas para el almacenamiento multimedia en Supabase. Aplicada y comprobada en local y microai-dev. Ver `docs/media-storage.md`.

Actualización multimedia: 008 ya está aplicada y comprobada en microai-dev. Descarga Infobip AUDIO/IMAGE y primera extracción/revisión de tickets implementadas, con flags desactivados por defecto. Antes de producción faltan credenciales, HTTPS/enrutamiento y comprobar evento/redirecciones reales. La prueba local usa Supabase DB/Storage/Auth reales y HTTP externos simulados; no equivale a WhatsApp real. Ver `docs/receipt-interpretation.md` (desde docs: `receipt-interpretation.md`).
