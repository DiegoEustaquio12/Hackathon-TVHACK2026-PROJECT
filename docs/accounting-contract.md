# Gastos y reportes — contrato R1 para R2/R3

Implementación en `src/modules/data/accounting.ts`. Todas las llamadas se hacen en servidor después de resolver el remitente autenticado y completar el alta del negocio. El cliente nunca elige el `business_id`.

## Gastos

```ts
const expense = await recordExpense(serverClient, {
  verifiedSender, operationKey: 'expense:' + confirmedExpenseId,
  concept: 'Luz', amountCents: 5000,
});
```

`recordExpense` devuelve un registro tipado con ID, concepto, importe y fechas. Acepta `occurredAt` ISO opcional; si se omite usa la fecha del servidor. La clave de operación debe corresponder al mismo gasto confirmado en todos sus reintentos. Repetir el gasto no duplica registros; cambiar concepto/importe/fecha explícita con la misma clave devuelve `IDEMPOTENCY_CONFLICT`.

El parser reconoce “Gasté $50 en luz” y genera una propuesta con `needsConfirmation=true`. El flujo R2 ahora guarda la propuesta en `r2_expense_drafts` mediante `createExpenseDraftRepository` (`src/modules/data/expense-drafts.ts`). El token firmado referencia el borrador, no autoriza por sí solo un gasto: la confirmación vuelve a comprobar remitente, estado y vencimiento en SQL. No usar los borradores de venta para gastos.

`CONFIRMAR GASTO <token>` confirma una única vez; los reintentos devuelven el registro original. `CANCELAR GASTO <token>` cancela esa propuesta, y `CANCELAR GASTO` cancela todas las propuestas pendientes de ese negocio. Los tokens anteriores ya no pueden confirmar borradores cancelados. Cancelar una propuesta no revierte gastos ya registrados; las reversas siguen fuera de esta entrega. `recordExpense` queda como operación interna usada por la confirmación transaccional.

Las escrituras directas de gastos desde navegador se retiraron; R3 debe usar un servicio de servidor con sesión verificada. `INVALID_EXPENSE` indica importe/concepto/clave inválidos. Los importes son enteros en centavos, nunca floats monetarios.

## Zona horaria explícita y reportes

```ts
await setBusinessTimeZone(serverClient, verifiedSender, 'America/Mexico_City');
const report = await getBusinessDailyReport(serverClient, verifiedSender);
// O consultar una fecha del negocio: getBusinessDailyReport(client, sender, '2026-11-14')
```

La zona es un nombre IANA válido en PostgreSQL. Debe configurarse según la ubicación del negocio: preguntar cuando falte. `TIME_ZONE_REQUIRED` no significa que no hubo ventas. `INVALID_TIME_ZONE` indica un nombre inválido.

El reporte tipado devuelve `day`, `time_zone`, `starts_at`, `ends_at`, `sales_count`, `sales_total_cents`, `expenses_total_cents` y `sold_items` (producto, descripción histórica, cantidad y subtotal). Los límites son inicio incluido y final excluido del día local, convertidos a instantes UTC. Las ventas y gastos se agregan por separado para evitar multiplicar importes al unir artículos.

“¿Cuánto vendí hoy?” devuelve intención `report` con `data.report='sales_today'`; R2 consulta este repositorio y responde con datos reales. No presentar ventas menos gastos como utilidad. Costos de producto históricos, compras, impuestos y métodos contables aún no están modelados para un reporte de ganancias.
