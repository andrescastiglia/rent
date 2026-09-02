# Pagos, cobranzas y liquidaciones

## Alcance actual

El dominio de pagos conecta facturas, cuentas corrientes, pagos, recibos y
liquidaciones. MercadoPago Checkout Pro está implementado en
`backend/src/payment-gateway`. La base neutral de transferencias y la
conciliación sandbox están implementadas; la conexión con un proveedor bancario
real y cripto permanecen pendientes del plan de trabajo.

La base neutral para cuentas virtuales permite persistir CBU/CVU, alias y la
propiedad asociada sin acoplarse todavía a Bind o Pomelo. Los alias activos son
únicos sin perder el historial de cuentas desactivadas o eliminadas, y el API
valida que usuario, propietario y propiedad pertenezcan a la misma compañía.
La creación del alias en un proveedor continúa pendiente. Los movimientos ya
pueden identificarse automáticamente por alias y conciliarse contra facturas.

## Conciliación bancaria neutral

`backend/src/bank-reconciliation` persiste movimientos normalizados con una
clave idempotente por compañía, proveedor e identificador externo. Los créditos
entrantes se asocian primero por cuenta virtual/propiedad y, si no hay cuenta,
por coincidencia única de monto y fecha dentro de una ventana de cinco días.

Una coincidencia crea y confirma un pago mediante `PaymentsService`, por lo que
aplica el mismo flujo contable FIFO y genera el mismo recibo PDF que un pago
registrado desde el API. El movimiento y su conciliación quedan vinculados a la
factura y al pago. Un bloqueo transaccional por movimiento serializa reintentos
concurrentes y evita pagos duplicados. La conciliación, la creación y
confirmación del pago, las imputaciones, el recibo y el estado del movimiento
usan el mismo `EntityManager`: cualquier error revierte el conjunto completo.
La generación del PDF se ejecuta después del commit y la respuesta se recarga
para reflejar su URL persistida.

Para desarrollo y CI existe `POST /bank-reconciliation/sandbox/movements`. El
endpoint está deshabilitado cuando `NODE_ENV=production`; no representa un
webhook productivo ni llama a Bind o Pomelo. Los movimientos no conciliados se
persisten para revisión.

El comando batch `reconcile-bank` reintenta créditos pendientes o no
conciliados, respetando antigüedad mínima, límite y compañía opcional. La
contabilidad se ejecuta exclusivamente en el backend mediante un endpoint
interno autenticado; el batch no duplica la lógica de pagos. Un movimiento que
continúa sin match crea o actualiza una alerta operativa idempotente. Si un
reintento posterior concilia el movimiento, la alerta abierta se resuelve
automáticamente.

Los administradores y miembros de staff pueden consultar estas alertas con
`GET /bank-reconciliation/alerts?status=open` y resolver una revisión manual con
`PATCH /bank-reconciliation/alerts/:id/resolve`.

## Flujo MercadoPago

1. Un administrador o inquilino autenticado crea una preferencia con
   `POST /payment-gateway/preferences` indicando el UUID de la factura.
2. El backend verifica que la factura pertenezca a la empresa y, para un
   inquilino, a su propia cuenta.
3. MercadoPago devuelve las URLs de Checkout Pro y el backend registra una
   transacción `pending` en `payment_gateway_transactions`.
4. MercadoPago envía eventos a `POST /payment-gateway/webhook`.
5. El backend valida la firma HMAC, consulta el pago en la API de MercadoPago y
   actualiza la transacción. Los reintentos sobre una transacción ya procesada
   no vuelven a aplicar el cambio.

Las facturas pendientes exponen `Pagar con MercadoPago` en su detalle web. Los
PDFs generados tanto por backend como por batch contienen un QR y un enlace a
ese mismo flujo. El enlace estable vuelve primero a la factura autenticada y
recién allí crea la preferencia, por lo que el PDF no contiene una preferencia
efímera ni credenciales del proveedor. Las notificaciones batch incluyen ese
enlace junto con el PDF.

## Configuración

Variables requeridas en producción:

```dotenv
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS=300
APP_URL=https://rent.example.com/api
BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN=...
BACKEND_INTERNAL_URL=http://backend:3001
```

La clave de webhook se obtiene en MercadoPago Developers, dentro de la
aplicación, en `Webhooks > Configurar notificaciones`. Debe guardarse únicamente
en el archivo de secretos del ambiente.

Referencia oficial: [Configurar notificaciones de pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/payment-notifications).

El webhook usa los encabezados `x-signature` y `x-request-id` y el query param
`data.id` (también se acepta `data_id` por compatibilidad). En producción el
backend rechaza la notificación si falta la clave configurada, la firma no
coincide, el identificador firmado difiere del cuerpo o el timestamp excede la
tolerancia.

## Migraciones

La tabla de transacciones de la pasarela se crea en
`migrations/079_add_payment_gateway_transactions.sql`. Toda modificación futura
del contrato persistido debe agregarse como una migración numerada nueva; las
migraciones existentes no se editan después de haber sido desplegadas.

La unicidad de alias bancarios activos se incorpora en
`migrations/092_enforce_active_bank_alias_uniqueness.sql`.
Las tablas `bank_movements` y `bank_reconciliations` se incorporan en
`migrations/093_add_bank_movement_reconciliation.sql`.
El tipo de job y `bank_reconciliation_alerts` se incorporan en
`migrations/094_add_bank_reconciliation_alerts_and_batch_job.sql`.

Validación local de la cadena completa:

```bash
./migrations/run-migrations.sh
cd backend
npm run test:e2e -- --runInBand payment-gateway.e2e-spec.ts
npm run test:e2e -- --runInBand payment-flow.e2e-spec.ts
```

Ejecución operativa:

```bash
cd batch
npm start -- reconcile-bank --limit 100 --min-age-minutes 5
npm start -- reconcile-bank --company-id <uuid> --dry-run
```

La frecuencia recomendada es cada diez minutos. El token interno debe ser un
secreto largo, distinto de JWT y credenciales bancarias, compartido solamente
entre batch y backend.

## Salida a producción

Antes de habilitar el checkout:

1. Configurar credenciales productivas y la firma secreta.
2. Registrar el webhook HTTPS de producción para eventos de pagos.
3. Ejecutar un pago controlado y verificar la transición de la transacción.
4. Confirmar que no se creen efectos duplicados al reenviar el mismo evento.
5. Verificar healthcheck y logs del backend después del despliegue.

La prueba real de sandbox y el cierre automático del circuito contable siguen
siendo requisitos para marcar `T213/T821` como completadas.
