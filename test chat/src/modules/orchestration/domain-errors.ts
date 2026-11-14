/** Only translate known business failures. Unknown/infrastructure errors remain retryable. */
const replies: Record<string,string> = {
  OUT_OF_STOCK: 'Agotado o inventario insuficiente. La venta no se registró; corrige las cantidades y crea un nuevo resumen.',
  DRAFT_EXPIRED: 'El resumen venció. Escribe la venta otra vez para revisar precios y existencias.',
  DRAFT_CANCELLED: 'Ese borrador fue cancelado. Inicia una nueva venta.',
  DRAFT_NOT_FOUND: 'No encontré ese resumen para tu negocio. Solicita uno nuevo.',
  DRAFT_ALREADY_CONFIRMED: 'La venta ya fue confirmada; no se puede cancelar como borrador.',
  EXPENSE_DRAFT_NOT_FOUND: 'No encontré esa propuesta de gasto para tu negocio.',
  EXPENSE_DRAFT_CANCELLED: 'La propuesta de gasto fue cancelada y no puede confirmarse.',
  EXPENSE_DRAFT_EXPIRED: 'La propuesta de gasto venció. Escribe el gasto de nuevo.',
  EXPENSE_ALREADY_CONFIRMED: 'El gasto ya fue registrado; cancelar una propuesta no revierte un gasto confirmado.',
  ONBOARDING_REQUIRED: 'Completa el alta con nombre y giro antes de operar.',
  BUSINESS_NOT_FOUND: 'Completa el alta de tu negocio antes de registrar operaciones.',
  ONBOARDING_CONFLICT: 'El número ya está vinculado a un negocio con datos distintos. Revisa el alta.',
  PRODUCT_NOT_FOUND: 'Un producto ya no está disponible en tu catálogo. Escribe la venta de nuevo.',
  PRODUCT_CHANGED: 'El producto cambió. Actualiza el catálogo y revisa los valores antes de guardar.',
  IDEMPOTENCY_CONFLICT: 'La operación original ya tiene datos diferentes. Inicia una nueva operación.',
  INVALID_QUANTITY: 'Indica cantidades positivas con hasta tres decimales.',
  INVALID_PRODUCT_UNIT: 'Ese producto se vende por pieza y necesita una cantidad entera.',
  QUOTE_VERSION_REQUIRED: 'Confirma usando la versión indicada en el resumen.',
  TIME_ZONE_REQUIRED: 'Configura la zona horaria de tu negocio antes de consultar el día.',
  INVALID_TIME_ZONE: 'La zona horaria no es válida. Indica un nombre IANA de tu ubicación.',
  TOTAL_TOO_LARGE: 'El total supera el límite por operación. Divide la venta en operaciones más pequeñas.',
};
export function domainErrorReply(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('message' in error) || typeof error.message !== 'string') return;
  return replies[error.message];
}
