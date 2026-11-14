# Migraciones

Agregar aquí migraciones SQL versionadas. Definir primero claves foráneas, restricciones, índices, RLS y políticas por negocio; no desplegar con RLS deshabilitado.

008 añade buckets privados `business-audio`/`business-images`, metadatos `business_media` y políticas restrictivas para el almacenamiento multimedia en Supabase. Aplicada localmente; pendiente de coordinar remoto. Ver `docs/media-storage.md`.
