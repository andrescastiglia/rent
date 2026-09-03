# Contrato de producto vigente

**Estado:** vigente  
**Corte:** 2026-09-02  
**Responsables:** producto e ingeniería

Este documento resume las reglas obligatorias. Las historias detallan criterios de aceptación y el [ADR-001](../technical/adr-001-modelo-producto.md) resuelve decisiones estructurales.

## Operación diaria

- El inicio prioriza tareas vencidas o del día, cobranzas, renovaciones, comunicaciones y acciones pendientes de revisión.
- Cada tarea abre directamente la acción necesaria.
- Ventas y alquileres comparten personas, propiedades, contratos, documentos y controles de autorización.

## Personas y acceso

- Una persona puede ser propietaria, inquilina y compradora a la vez sin duplicar sus datos.
- El acceso al sistema es opcional para propietarios y se activa explícitamente.
- `admin` tiene acceso total; `staff` requiere permiso por módulo; los roles externos solo acceden a relaciones propias.

## Contratos

- Hay una entidad `Contract` con tipo `rental` o `sale`, siempre vinculada directamente a una propiedad.
- El ciclo es `draft`, `active` o `finalized`; la firma y las condiciones por fecha se registran/calculan aparte.
- Un contrato existente admite PDF, DOCX, Markdown o TXT como archivo interpretable.
- Un DOCX también puede convertirse en plantilla HTML editable conservando nombre y MIME de origen.

## Evaluación de interesados

- Se registran presupuesto, cantidad de personas, mascotas, garantías, ubicación, tipo de inmueble e ingresos mensuales comprobables.
- Para alquiler se calcula la relación ingreso/alquiler; para venta financiada se utiliza ingreso/cuota cuando existe el plan.
- La modalidad laboral no sustituye documentación económica ni se usa como criterio discriminatorio.

## Datos y despliegue

- Los cambios de esquema son migraciones versionadas, idempotentes y aditivas mientras existan consumidores legados.
- `oracle` es el único ambiente productivo y no se usa para ensayos ni pruebas.
- La publicación se construye y valida localmente/CI; producción solo recibe artefactos inmutables, secretos y migraciones aprobadas.
- Recuperación ante desastres y ensayo de restauración quedan fuera de esta etapa.
