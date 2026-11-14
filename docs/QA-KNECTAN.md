# Validación de Knectan

Fecha: 14 de noviembre de 2026. Entorno: Windows, Next.js 15, build de producción con `MOCK_MODE=true`.

## Resultado funcional

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | Correcto |
| `npm run lint` | Correcto, sin advertencias |
| `npm test` | 57 pruebas, 9 archivos, correctos |
| `npm run build` | Correcto; incluye páginas y endpoints nuevos |
| `npm run test:e2e` | 10 recorridos correctos en escritorio y móvil |
| axe WCAG A/AA | Sin violaciones en las vistas y diálogos probados |
| Anchos 1440, 1024, 820, 768, 390 y 320 px | Sin desbordamiento horizontal de página; tabla con desplazamiento interno accesible |
| Marca anterior | Sin coincidencias en código/documentación del proyecto, excluidos dependencias, cachés, resultados y skills |
| Logotipo | HTTP 200, imágenes cargadas, SVG público con el mismo SHA-256 que el original |

Se verificaron formularios, validación de campos, conversión decimal exacta de MXN a centavos, confirmación/Cancelación/Escape, restauración de foco, actualización de KPIs y persistencia de altas/bajas tras recarga. Las pruebas de servidor cubren identidad rechazada en payload/query, 401 sin sesión verificada, aislamiento de negocios/sesiones, versiones, colección vacía entre instancias y rechazo de cookies manipuladas. Una cookie antigua no revierte una escritura más reciente en la misma instancia.

El selector de publicidad recomienda según el mayor requerimiento de catálogo/volumen. La activación usa el precio del servidor y confirma solamente después de una respuesta válida. No hace cobros ni publica anuncios. Precios y beneficios son ilustrativos; el estado activo permanece en la vista abierta. Los pedidos mock están limitados a 30 y al tamaño de la cookie; no constituyen almacenamiento duradero ni control de concurrencia distribuida.

Capturas revisadas en `test-results/`: panel de escritorio, formulario móvil y planes en escritorio/móvil. Se regeneran con E2E y no se versionan. La revisión y axe complementan las pruebas de teclado; no representan una certificación completa de accesibilidad.

## Resultado de las skills visuales

`GATE: FAIL 31 (round 1 of 3)`.

El gate de taste-skill se ejecutó sobre el panel real y terminó con 31 hallazgos y 21 advertencias. No se declara aprobado ni se crearon exenciones. Sus reglas de composición para páginas comerciales exigen hero de una pantalla, navegación superior, una sección por pantalla, efectos y clases `.wrap`. Aplicarlas reemplazaría la arquitectura del panel operativo que el brief pide conservar. Los avisos de contraste exigen 7:1, mientras que el texto señalado tiene 5.39:1 y pasa el requisito AA de 4.5:1. Los selectores de estado conservan etiquetas accesibles y encabezado visible de tabla; el texto cortado corresponde a columnas dentro de una región que permite desplazamiento horizontal. La auditoría axe y los recorridos de teclado pasaron. Se mantienen estos hallazgos explícitos, sin rediseñar la aplicación para satisfacer criterios de landing page.

El launcher de Impeccable no pudo cargar su motor por restricciones de instalación; se leyeron directamente las guías y el contexto visual existente. El primer build encontró un permiso en `.next`; el build final pasó con permisos de ejecución adecuados. Una verificación de tipos coincidió con la regeneración de `.next`; la validación final se repitió después de completar el build y pasó. El primer arranque E2E quedó sin iniciar el servidor dentro del sandbox; el recorrido final con servidor y Chrome habilitados pasó.

Se conserva la paleta bosque/verde/papel y Segoe UI del proyecto, con controles nativos, espaciado y bordes consistentes. Voz: español directo, acciones concretas y estados de demo explícitos. Se usa exclusivamente el logotipo suministrado; no hay fotografías, renders, nombres de marca inventados ni dominios de ejemplo pendientes. Las reglas comerciales de hero, efectos y momentos no se añaden a este panel operativo.

El listado siguiente conserva todos los hallazgos del gate para su revisión.

El gate ejecutó sus comprobadores de consistencia/composición. No se realizó una medición independiente con `perf.mjs`; no se declara un resultado de rendimiento de esa herramienta.

## Hallazgos abiertos del gate

1. **hero-fill** (1440, 390 px): main#main-content > div.dashboard_promotion__iwBgT "Publicidad y visibilidad para proveedore"

   the next section shows on the first screen: it starts at 212px on a 900px screen (the hero ends at 184px)

2. **nav** (1440 px): (the first screen)

   no nav bar across the top of the first screen (a header with the brand, the section links and the main action)

3. **no-visual** (1440, 390 px): main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN "Pedidos de comercios"

   no picture, effect or mock in this section; a feature section needs a visual

4. **button-styles** (1440 px): (one screen)

   3 button styles on one screen: soft, fill #ffffff, outline #819588 ("Actualizar panel"); soft, fill #ecf5ef ("Distribuidores"); soft, fill #216344, outline #216344 ("Agregar pedido"); the odd one out: "Agregar pedido"

5. **button-styles** (1440, 390 px): (the page)

   3 button styles on the page: soft, fill #ecf5ef x1 ("Distribuidores"); soft, fill #ffffff, outline #819588 x13 ("Actualizar panel"); soft, fill #216344, outline #216344 x1 ("Agregar pedido")

6. **copy-headline** (1440 px): div.workspace_heading__HXQLs > div.dashboard_panelBrand__s_1EL > div > h1 "Panel de distribuidores"

   "Panel de distribuidores" does not name what is sold (pedidos y publicidad para proveedores, pedidos, publicidad, para, from flags); only the line under it does

7. **text-contrast** (1440, 390 px): main#main-content > div:nth-of-type(3) > p.workspace_notice__IbB25 "Datos ficticios para explorar el panel. "

   body text in #59695f on #f4f7f4 reads 5.39:1 (needs 7:1)

8. **field-label** (1440 px): select#status-PED-1042

   a select[type=select-one] without a label you can see: its <label> is hidden

9. **field-label** (1440 px): select#status-PED-1043

   a select[type=select-one] without a label you can see: its <label> is hidden

10. **field-label** (1440 px): select#status-PED-1044

   a select[type=select-one] without a label you can see: its <label> is hidden

11. **field-label** (1440 px): select#status-PED-1045

   a select[type=select-one] without a label you can see: its <label> is hidden

12. **moment-none** (1440 px): (the page)

   a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md)

13. **hero-screen** (1440 px): main#main-content > div.workspace_heading__HXQLs "Panel de distribuidoresRevisa tus pedido"

   the hero ends at 184px on a 900px screen, 716px above the fold: it ends at the fold, 1px either way (SR-1)

14. **hero-screen** (1440 px): main#main-content > div.dashboard_promotion__iwBgT "Publicidad y visibilidad para proveedore"

   688px of the next section shows on the first screen (from 212px on a 900px screen): nothing below the hero shows at load (SR-1)

15. **section-height** (1440 px): main#main-content > p.dashboard_feedback__NCnWY

   the section is 24px tall (0 screens), 876px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2)

16. **section-air** (1440 px): main#main-content > p.dashboard_feedback__NCnWY

   the section shows no content: its content fills 0% of its 24px (55% or more) (SR-3)

17. **section-air** (1440 px): main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN > p.dashboard_footer__Tssr0 "Actualizado 14 nov, 06:23 a.m.. Los indi"

   a top border across 100% of the container, between the section's content: sections and their parts are told apart by air and ground, not lines (SR-3)

18. **one-section** (1440 px): div.workspace_heading__HXQLs > div.dashboard_panelBrand__s_1EL > div > h1 "Panel de distribuidores"

   the screen at scroll 0px (stride 0) shows 94px of section 2 and the heading of section 1 whole and the content of 3 sections, over 24px each beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (SR-4)

19. **one-section** (1440 px): main#main-content > div.dashboard_promotion__iwBgT > div > h2 "Publicidad y visibilidad para proveedore"

   the screen at scroll 212px (the top of section 2) shows 94px of section 2 and the heading of section 2 whole and the content of 2 sections, over 24px each beside section 4: a screen shows one section (another may peek 8px, 24px WARN) (and 1 more like it: scroll 330px) (SR-4)

20. **one-heading** (1440 px): h2#orders-title "Pedidos de comercios"

   headings of two sections show whole on one screen at 5 of 17 scroll positions (29.4%; at scroll 0, 50, 100, 150px), here with "Publicidad y visibilidad para pr": at most 3% on a desktop (SR-5)

21. **container-edges** (1440 px): main#main-content > div.workspace_heading__HXQLs "Panel de distribuidoresRevisa tus pedido"

   the content of section 1 runs 272px from the left and 40px from the right (read from its outermost blocks: no .wrap): 272 and 40px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

22. **container-edges** (1440 px): main#main-content > div.dashboard_promotion__iwBgT "Publicidad y visibilidad para proveedore"

   the content of section 2 runs 296px from the left and 64px from the right (read from its outermost blocks: no .wrap): the page's container starts at 272px; 296 and 64px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (SR-6)

23. **container-edges** (1440 px): main#main-content > div:nth-of-type(3) "Valor de pedidos$13,692.80MXN · Excluye "

   the content of section 4 runs 272px from the left and 40px from the right (read from its outermost blocks: no .wrap): 272 and 40px are not one margin; the margin is 64-120px at 1440px (one container, equal margins, 2px either way) (and 1 more like it: "Comercio de demostración") (SR-6)

24. **container-edges** (1440 px): a.skip-link "Saltar al contenido"

   a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

25. **container-edges** (1440 px): div.workspace_shell__N2d5G "Asistente Distribuidores PublicidadTu co"

   a <div> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6)

26. **container-edges** (1440 px): div.workspace_heading__HXQLs > div.dashboard_panelBrand__s_1EL > div > h1 "Panel de distribuidores"

   the h1 starts 94px right of the container's left: every h1 and h2 starts on it, 2px either way (SR-6)

27. **container-edges** (1440 px): h2#orders-title "Pedidos de comercios"

   4 text blocks start on a left line at x 297, 25px from the container's left: text starts on the container's left, or on one split line (x 752, 848, 944) (also "6 pedidos en la vista", "Buscar comercio o pedido", "Actualizado 14 nov, 06:23 a.m.. ") (and 1 more like it: "Pedidos de comercios") (SR-6)

28. **row-lines** (1440 px): main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN > form.dashboard_filters__OoLsN "Buscar comercio o pedidoEstado del pedid"

   a row of 2 items: its first item starts at 297px, the container's left line at 272px; its last item ends at 1233px, the container's right line at 1400px (2px either way) (SR-7)

29. **cut-text** (390 px): table.dashboard_table__BcCml > thead > tr > th:nth-of-type(3) "Total MXN"

   cut 33px at the right by the overflow of main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN (and 6 more like it: "$2,480.50", "$1,320.00", "$5,640.80", "$987.50", ...)

30. **cta** (390 px): main#main-content > div:nth-of-type(3) > p.workspace_notice__IbB25 "Datos ficticios para explorar el panel. "

   the last section before the footer ends with no button

31. **container** (1440, 390 px): page

   no .wrap

## Advertencias del gate

1. **flush**: main#main-content > div.dashboard_promotion__iwBgT > div > h2 "Publicidad y visibilidad para proveedore"

   its first line sits 21px under the top edge of div.dashboard_promotion__iwBgT, where the ground changes

2. **flush**: main#main-content > div.dashboard_promotion__iwBgT > div > p "Compara tres planes y encuentra el alcan"

   its last line sits 21px above the lower edge of div.dashboard_promotion__iwBgT, where the ground changes to dl.dashboard_kpis___MryH

3. **flush**: div:nth-of-type(3) > dl.dashboard_kpis___MryH > div.dashboard_kpi__xstuW:nth-of-type(1) > dt "Valor de pedidos"

   its first line sits 26px under the top edge of dl.dashboard_kpis___MryH, where the ground changes

4. **flush**: dl.dashboard_kpis___MryH > div.dashboard_kpi__xstuW:nth-of-type(1) > dd > small "MXN · Excluye cancelados"

   its last line sits 30px above the lower edge of dl.dashboard_kpis___MryH, where the ground changes to section.dashboard_orders__OiNGN

5. **flush**: button#add-order "Agregar pedido"

   its first line sits 25px under the top edge of section.dashboard_orders__OiNGN, where the ground changes

6. **fold-card**: div.workspace_shell__N2d5G > aside.workspace_sidebar__ivEU5 "Asistente Distribuidores Publicidad Tu c"

   the 232x1736 card starts on the first screen and runs 836px past its bottom

7. **copy-buttons**: div.workspace_shell__N2d5G > aside.workspace_sidebar__ivEU5 > nav.workspace_nav__yORrs > a:nth-of-type(2) "Distribuidores"

   "Distribuidores" does not start with a verb (book, buy, try, start, get, see...) (and 3 more like it: "Actualizar panel", "Explorar planes", "Guardar")

8. **copy-actions**: (the page)

   the main action "Agregar pedido" does not read word for word the same in the nav or hero

9. **heading-scale**: div:nth-of-type(3) > dl.dashboard_kpis___MryH > div.dashboard_kpi__xstuW:nth-of-type(2) > dd "6 En esta demostración"

   3 lines of plain text set larger than the section headings (30px against h2 19px)

10. **section-gaps**: main#main-content > div.workspace_heading__HXQLs / main#main-content > div.dashboard_promotion__iwBgT

   51px between these sections, -41% against the median 87px

11. **section-gaps**: main#main-content > div.dashboard_promotion__iwBgT / main#main-content > div:nth-of-type(3) > dl.dashboard_kpis___MryH

   111px between these sections, +28% against the median 87px of gaps at a change of ground

12. **label-centre**: div.workspace_shell__N2d5G > aside.workspace_sidebar__ivEU5 > nav.workspace_nav__yORrs > a:nth-of-type(2) "Distribuidores"

   its label sits 36px off-centre (12px of room at the left, 48px at the right)

13. **stranded-action**: main#main-content > div.workspace_heading__HXQLs > button.workspace_button__0C0To "Actualizar panel"

   stands 550px across from the nearest text of its block ("Panel de distribuidores") (and 2 more like it: "Explorar planes", "Agregar pedido")

14. **copy-length**: main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN "Pedidos de comercios"

   1 section over 90 words a screen outside the UI mocks ("Pedidos de comercios" 140); 53 words a screen across the page (223 words in 4.2 screens): a tech page says it in about 80 or fewer

15. **share-meta**: head

   the head lacks og:title, og:description, og:image, twitter:card, theme-color: a shared link shows no picture or title of its own

16. **form-fields**: main#main-content > div:nth-of-type(3) > section.dashboard_orders__OiNGN > form.dashboard_filters__OoLsN

   the form has no status line (role="status"): sending, sent and errors are never read out

17. **form-fields**: tr:nth-of-type(1) > td:nth-of-type(5) > div.dashboard_rowActions__ghbbD > form.dashboard_change__wIiZ8

   the form has no status line (role="status"): sending, sent and errors are never read out

18. **form-fields**: tr:nth-of-type(2) > td:nth-of-type(5) > div.dashboard_rowActions__ghbbD > form.dashboard_change__wIiZ8

   the form has no status line (role="status"): sending, sent and errors are never read out

19. **form-fields**: tr:nth-of-type(3) > td:nth-of-type(5) > div.dashboard_rowActions__ghbbD > form.dashboard_change__wIiZ8

   the form has no status line (role="status"): sending, sent and errors are never read out

20. **button-styles**: a.skip-link "Saltar al contenido"

   on the phone 3 buttons run the full width of their column, but 2 keep their own width, like "Saltar al contenido" is 172px of 390px: one action in two sizes

21. **copy-stat-strip**: copy x1: "6 / 2 / 4"

   stat strip x1
