# Estándar interno de productos — Knectan

Un producto vendible es una **presentación concreta**, no solo un nombre coloquial. El estándar es interno; no presupone un catálogo universal ni certificación GS1. El giro orienta futuras sugerencias IA, sin prohibir que una papelería venda bebidas.

## Campos obligatorios y opcionales

| Campo | Ejemplo | Regla |
| --- | --- | --- |
| `product_type` | Refresco | Tipo/base del producto, obligatorio |
| `brand` | Coca-Cola | Opcional si realmente no tiene marca; no inventarla |
| `variant` | Original | Variante opcional; separar Zero, sabores, etc. |
| `presentation` | Botella PET | Presentación/envase obligatorio |
| `content_amount` | 600 | Contenido neto por presentación, positivo |
| `content_unit` | ml | Entrada: ml/l/g/kg/piece; almacenamiento: ml/g/piece |
| `sale_unit` | piece | Unidad que descuentan las cantidades de venta y stock: piece/kg/g/l/ml |
| `aliases` | coca, refresco de cola | Hasta 30 nombres alternativos; pueden coincidir entre presentaciones |
| `priceCents` | 2000 | Precio por unidad de venta, entero MXN centavos |
| `stock` | 10 | Existencia en unidades de venta; entero cuando se vende por pieza |
| `costCents` | 1500 | Opcional; no inferir utilidad si falta o no es confiable |

El servidor genera `name`: **Coca-Cola Refresco Original 600 ml · Botella PET**. No enviar un nombre libre como sustituto de la especificación. Normaliza 0.6 l y 600 ml a la misma identidad. Rechaza duplicados incompatibles y reintentos con contenido distinto. La identidad combina tipo, marca, variante, presentación, contenido y unidad de venta dentro del negocio; precio y existencia no cambian la identidad.

Un paquete es otra presentación: para un paquete de seis botellas, registrar contenido total y una presentación explícita como “Paquete 6 x 600 ml”. Vender una unidad de ese producto descuenta un paquete. El MVP no desarma paquetes ni convierte automáticamente stock de cajas a botellas. Para granel, definir la unidad de venta con cuidado: stock y cantidades usan esa unidad, no el contenido del envase.

## Interpretación de mensajes

- “Vendí una coca” -> cantidad 1; si hay más de una presentación candidata, preguntar y devolver `clarificationOptions` con IDs/nombres. No elegir por popularidad, precio o stock.
- “Vendí una coca 600ml” o “una coca de 0.6 litros” -> busca la presentación de 600 ml dentro del catálogo del negocio.
- Si solo existe una presentación compatible, propone esa presentación, cuyo nombre completo se muestra antes de confirmar.
- Si no existe, solicita corregir el nombre o registrar un producto. No inventar marca, tamaño, precio o costo.
- No vender cantidades fraccionarias de productos por pieza. Las cantidades de granel admiten hasta tres decimales.
- Confirmar la venta después del resumen completo. La selección de una presentación no equivale a confirmar una venta.

## APIs de servidor del rol 1

`createStandardProduct(client, { verifiedSender, operationKey, specification, priceCents, stock, costCents? })` en `src/modules/data/products.ts` crea la presentación. El remitente se verifica antes de invocar el repositorio; no viene de un formulario arbitrario. El alta del negocio debe estar completa.

`updateProductCommercials(client, { verifiedSender, productId, priceCents, stock, costCents?, expected: { priceCents, stock, costCents } })` modifica datos comerciales. `expected` contiene los valores originales del formulario; si una venta u otra edición ya los modificó, devuelve `PRODUCT_CHANGED` y exige recargar. El stock nuevo es un conteo absoluto explícito, no una compra ni una suma de unidades. Omitir el nuevo `costCents` deja costo desconocido (`null`); enviar el costo actual si se desea conservarlo.

Las escrituras directas a `products` para clientes `anon`/`authenticated` se retiraron: R3 debe montar adaptadores de servidor con sesión verificada. La sesión web debe resolver el número vinculado al negocio; nunca confiar en `verifiedSender` enviado por el navegador. Las lecturas mantienen RLS.

No se transforma automáticamente el catálogo anterior: sus filas continúan legibles, sin inventar especificaciones. R3 debe ofrecer revisión/migración explícita de productos anteriores; hasta revisarlos pueden provocar preguntas adicionales.

## Creación asistida por IA posterior

Los modelos reciben nombre/giro del negocio y proponen una especificación con este contrato. La propuesta se revisa con el comerciante y luego se valida mediante el mismo RPC. Giro y texto libre no autorizan crear productos automáticamente. Si falta presentación o tamaño, el modelo debe preguntar. No hay transcripción, OCR ni generación de productos implementada todavía.
