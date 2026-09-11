# New Relic — Rent en producción

- Cuenta: `8213841`.
- [Dashboard Rent — Producción](https://one.newrelic.com/redirect/entity/ODIxMzg0MXxWSVp8REFTSEJPQVJEfGRhOjEzMTY0Mzc4).
- Definición: `rent-production.dashboard.json` (input de `dashboardCreate` de NerdGraph).
- Lectura compartida dentro de New Relic; edición reservada al propietario.

El dashboard muestra tráfico, latencia media y p95, tasa de errores, memoria
por servicio y transacciones lentas. Las consultas usan inicialmente la última
hora y filtran exclusivamente `RENT-Backend-production`,
`RENT-Frontend-production` y `RENT-Batch-production`.

El worker reporta memoria aunque no tenga transacciones. El frontend corresponde
al servidor Next.js; Browser Monitoring no está configurado. Los agentes APM
reportan a la cuenta, pero no crean automáticamente este dashboard personalizado.

Las nueve consultas NRQL se validaron contra datos reales y se comprobó por
lectura posterior que el dashboard contiene los diez widgets previstos.
No volver a ejecutar `dashboardCreate` para actualizarlo: utilizar su GUID
existente y `dashboardUpdate` para evitar duplicados.

[API de dashboards de New Relic](https://docs.newrelic.com/docs/apis/nerdgraph/examples/nerdgraph-dashboards/).
