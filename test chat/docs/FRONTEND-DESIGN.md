# Interfaz Knectan

Modo: Operate. Tres tareas: conversar desde el comercio, gestionar pedidos como distribuidor y elegir un plan de visibilidad como proveedor. Se conserva la identidad verde ya presente en el repositorio; los archivos de `logo/` permanecen intactos.

Sistema: bosque `#173f2c`, acción `#216344`, papel `#f4f7f4`, superficie `#ffffff`, texto `#172b21`, secundario `#59695f`. Segoe UI con alternativas locales evita descargas de fuentes durante el build. La navegación lateral se convierte en navegación horizontal en móvil. El chat concentra historial y formulario; el panel presenta indicadores globales, filtros y tabla con desplazamiento accesible dentro de su región.

Se aplicaron frontend-design para jerarquía y voz, ui-ux-pro-max para formularios, contraste, foco y áreas táctiles, impeccable para estados y patrones de operación, y taste-skill para alineación y consistencia. Las recomendaciones de marketing de taste-skill (hero, una sección por pantalla, efectos, exportación estática) ceden ante el brief de una aplicación operativa con API de servidor. Los datos ficticios se identifican expresamente como demo por requerimiento del producto.

Interacciones: controles nativos, botones de al menos 44 px, foco visible, etiquetas explícitas, enlace para saltar al contenido y regiones vivas. Los cambios de pedido se confirman con Guardar. Las transiciones son breves y respetan movimiento reducido. No hay imágenes promocionales ni cifras de clientes inventadas; los fixtures están confinados al modo mock.


Extensión Knectan: el SVG original de `logo/Knectan_logo.svg` se copia sin alteraciones a `public/logo/` y se sirve con ruta absoluta en navegación, encabezado del chat y panel. Conserva proporciones y texto alternativo; no requiere dominios remotos ni optimización de imágenes en Vercel.

Los pedidos se agregan y quitan con diálogos nativos que contienen el foco, aceptan Escape y restauran el foco al control de origen o al botón Agregar pedido. La confirmación de eliminación comienza en Cancelar. La validación muestra errores junto a cada campo y dirige el foco al primero; los importes se convierten desde texto decimal sin redondear cantidades de más de dos decimales.

`/publicidad` conserva el mismo sistema y presenta un selector por catálogo/volumen y tres columnas comparables que se apilan en tablet y móvil. Los precios 299, 799 y 1,499 MXN mensuales y los beneficios son propuestas ilustrativas de demo, no tarifas comerciales confirmadas. La recomendación usa el mayor requerimiento: hasta 50 productos/100 pedidos, hasta 250/500 o cobertura total. La activación requiere respuesta HTTP válida antes de confirmar; no cobra ni cambia el chat. La selección activa se conserva en la vista abierta, no como suscripción persistente.
