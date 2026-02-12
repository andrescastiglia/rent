# Guía Técnica: Obtención del IPC (Series de Tiempo AR)

Esta documentación describe cómo integrar el Índice de Precios al Consumidor (IPC) utilizando la API de Datos Argentina.

## 1. Endpoint y Parámetros Base

Para obtener el IPC Nivel General Nacional (base dic-2016), se utiliza el ID de serie `148.3_INIVELNAL_DICI_M_26`.

* **Endpoint:** `https://apis.datos.gob.ar/series/api/series/`
* **Formato:** JSON (predeterminado) o CSV.

## 2. Frecuencia de Actualización

* **Periodicidad:** Mensual.
* **Publicación:** La serie se actualiza aproximadamente a mediados de cada mes, siguiendo el calendario de publicación del **INDEC**.

## 3. Ejemplos de Implementación

### Obtener el último valor disponible

Para obtener solo el dato más reciente:
`GET /series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=1&sort=desc`

### Obtener serie histórica (JSON)

```bash
curl "https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&start_date=2023-01-01"
```

### Respuesta de Ejemplo (Estructura)

```json
{
    "data": [
        ["2023-12-01", 3533.19],
        ["2024-01-01", 4261.22]
    ],
    "meta": [
        { "frequency": "month", "id": "148.3_INIVELNAL_DICI_M_26" }
    ]
}
```

## 4. Parámetros Útiles para Programadores

| Parámetro | Función | Ejemplo |
| --- | --- | --- |
| `ids` | ID de la serie (IPC). | `148.3_INIVELNAL_DICI_M_26` |
| `representation` | Devuelve variaciones en lugar del índice. | `percent_change` (mensual) |
| `collapse` | Cambia la frecuencia de agregación. | `year` |
| `header` | Personaliza los encabezados (útil para CSV). | `titles` |

> [!TIP]
> Si necesitas la **inflación mensual**, agrega el parámetro `representation=percent_change` a tu consulta para evitar calcular la diferencia de índices manualmente.
