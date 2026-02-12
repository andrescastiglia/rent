# Cómo obtener el ICL para alquiler usando la API del BCRA

Según la API de Estadísticas del BCRA vigente, el Índice para Contratos de Locación (ICL) tiene el ID de variable `40`.

## Endpoints disponibles

1. Para obtener todas las variables monetarias disponibles:

```bash
GET https://api.bcra.gob.ar/estadisticas/v3.0/monetarias
```

2. Para obtener datos del ICL en un rango de fechas:

```bash
GET https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/40?desde={fecha_desde}&hasta={fecha_hasta}&limit=5000
```

Donde:

- `40` es el ID de la variable ICL
- `{fecha_desde}` debe estar en formato `YYYY-MM-DD` (ej: `2023-01-01`)
- `{fecha_hasta}` debe estar en formato `YYYY-MM-DD` (ej: `2024-01-01`)

Ejemplo de uso:

```bash
# Obtener ICL desde enero 2023 hasta febrero 2024
curl "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/40?desde=2023-01-01&hasta=2024-02-01&limit=5000"
```

Respuesta esperada:

La API devuelve un JSON con esta estructura:

```json
{
  "status": 200,
  "results": [
    {
      "idVariable": 40,
      "fecha": "2023-01-01",
      "valor": 1.52
    },
    ...
  ]
}
```

### Notas importantes:

- No requiere autenticación - La API oficial del BCRA es pública y gratuita.
- El ICL se publica diariamente - Se obtienen valores diarios.
- Base del índice: El ICL tiene base 1 al 30/06/2020.
- En batch se corre `sync-indices` diariamente y se conserva solo el último valor disponible de cada mes en `inflation_indices.period_date`.
