# Knectan · Manual de Identidad Gráfica v1.0

Edición para publicación · 14 de noviembre de 2026 · Autor: Knectan.

## Archivos

- KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4_v1.0.pdf: edición de publicación de 23 páginas A4 vertical.
- KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4.pdf: copia idéntica en la ruta estable del encargo.
- generar_manual.py: fuente editorial editable. Textos, diagramas, aplicaciones y montaje del PNG original sobre los fondos fotográficos.
- verificar_manual.py: validación de estructura, fuentes, imágenes, proporciones y extracción de texto.
- recursos/: referencia original, conversiones B/N propuestas, fuentes OFL, brief y dos fondos fotorrealistas generados con IA.
- qa/: páginas renderizadas, hojas de contacto, texto extraído y reporte de verificación.
- PROMPTS_MOCKUPS_v1.0.json: prompts completos y método de creación de los mockups.

## Estructura de consulta

Fundamentos; componentes; símbolo; logo; versiones; protección; tamaños; usos; color; tipografía; recursos; convivencia; producción impresa; voz; aplicaciones digitales; contextos fotográficos; accesibilidad; entrega y control.

Se tomó como referencia editorial Adobe Corporate Brand Guidelines (25 de octubre de 2010), copia pública consultada en The Compass for SBC. Se adoptaron el orden de activo-especificación-aplicación y los títulos directos. No se copiaron gráficos, texto, valores o normas de Adobe. El PDF enlaza la referencia. Las fuentes de contraste WCAG y las referencias previas de Stanford y Uber Eats se conservan en REFERENCIAS_Y_CORRECCIONES.md.

## Regeneración

Instalar las dependencias de requirements.txt y ejecutar:

```sh
python3 generar_manual.py
pdftoppm -r 110 -png KNECTAN_MANUAL_IDENTIDAD_GRAFICA_A4_v1.0.pdf qa/pagina
python3 verificar_manual.py
```

Las fuentes estáticas y sus licencias OFL 1.1 están incluidas. El script no necesita red. El montaje fotográfico sigue siendo editable: el fondo y el logo son objetos separados, sin reinterpretar ni deformar la marca.

## Alcance de la publicación

Edición final 1.0 con párrafos de lectura justificados y títulos, etiquetas y cifras alineados. Los textos cortos y columnas estrechas conservan alineación izquierda para evitar espacios excesivos. La paleta HEX/RGB, el sistema tipográfico y los tamaños de referencia se establecen como criterios de esta edición. Se eliminaron notas de trabajo y comentarios de aprobación.

La paleta digital se entrega también en tokens_marca_v1.0.json. Se incorporan criterios de fotografía, ilustración y movimiento, y pautas para organizar archivos de producción. Se conserva el brief original como documento histórico de entrada; los cambios posteriores solicitados por el usuario se reflejan en el manual final.

El PDF usa RGB y no incluye sangrado. Para fabricación se utilizan los requisitos del proveedor y la prueba física correspondiente. No está certificado como PDF/X ni PDF/UA. Las aplicaciones de interfaz son ejemplos; los datos mostrados son ficticios. Los mockups fotográficos fueron generados con IA y montados con el PNG original íntegro. El logo disponible sigue siendo raster, no un maestro vectorial.

Se eliminó la página de entrega y control a petición del usuario; el índice y los marcadores reflejan las 23 páginas finales.
