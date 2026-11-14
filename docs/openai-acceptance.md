# Aceptación R1 con OpenAI real

El adaptador está implementado; sus pruebas automáticas normales simulan HTTP. Para comprobar precisión con audios/fotos reales se agregó `scripts/check-role1-openai.py`, sin Supabase ni registros contables.

## Preparar archivos revisados

Guardar fuera del repositorio un manifiesto JSON y sus archivos. Ejemplo de estructura (sustituir por archivos reales y resultados revisados):

```json
{
  "catalogue": [{
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "Coca 600 ml", "sale_price_cents": 2000, "stock": 10,
    "aliases": ["coca"], "sale_unit": "piece"
  }],
  "audio": [{
    "file": "venta.ogg", "mimeType": "audio/ogg",
    "expected": {"kind": "sale", "items": [{
      "product_id": "22222222-2222-4222-8222-222222222222", "quantity": 3
    }]}
  }],
  "images": [{
    "file": "ticket.jpg", "mimeType": "image/jpeg", "currency": "MXN", "total_cents": 6000,
    "items": [{"description": "Coca 600 ml", "quantity": 3, "unit_price_cents": 2000, "line_total_cents": 6000}]
  }]
}
```

Las rutas son relativas al manifiesto. Para audio ambiguo o incierto usar `"expected": {"kind": "clarification"}`. Se admite una lista vacía de audio o imágenes, pero al menos un archivo total. No se generan resultados esperados con IA: deben revisarse manualmente. Probar grabaciones mexicanas con ruido, cantidades/presentaciones, productos desconocidos y silencio. El intérprete sigue siendo determinista: por ejemplo cantidades en palabras que no reconoce producen aclaración, no una venta inventada.

## Ejecución explícita

Configurar `OPENAI_API_KEY` en el entorno local seguro, sin pegarla en el chat ni guardarla en Git. Luego:

```bash
python3 scripts/check-role1-openai.py --manifest /ruta/privada/manifest.json --allow-upload
```

Sin `--allow-upload` o sin clave, el script termina antes de subir archivos. La ejecución con esa opción envía los fixtures seleccionados a OpenAI y consume API. Utiliza el transcriptor/extractor reales de producción, no un reemplazo mock. No usa credenciales Supabase, no escribe ventas ni envía WhatsApp.

Audio: compara productos/cantidades resueltos o la necesidad de aclaración y exige confirmación pendiente. Imagen: compara moneda, total y campos revisados de cada renglón. Las aserciones muestran solo número de caso/resultado booleano, no transcripciones ni texto del ticket. Vitest muestra duración del ensayo; no se implementó medición de tokens/costo o un informe estadístico completo. Un caso fallido requiere inspección autorizada de la transcripción/lectura para distinguir error acústico/OCR de limitación del parser; este runner no guarda ese contenido automáticamente.

`npm run validate` omite la aceptación real por defecto. **No se ejecutó contra OpenAI durante esta entrega**, por falta de clave/fixtures reales configurados. El estado no equivale a precisión verificada ni a una prueba de WhatsApp real.
