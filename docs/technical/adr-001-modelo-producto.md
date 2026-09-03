# ADR-001: modelo canónico de personas, contratos y navegación

- **Estado:** aceptado
- **Fecha:** 2026-09-02
- **Responsable:** producto e ingeniería
- **Reemplaza:** alternativas incompatibles de `drf-original.md`, `c4-model.md`, `der.md` y `sequence.md`

## Decisión

1. Una persona es única dentro de una compañía y puede reunir simultáneamente los roles `owner`, `tenant` y `buyer`. `admin` y `staff` representan además capacidades internas. Durante la migración, `users.role` conserva el rol primario por compatibilidad y `users.roles` es el conjunto canónico.
2. Un propietario puede existir sin acceso. Crear el contacto no activa credenciales; el acceso se habilita explícitamente después.
3. `Contract` es la entidad contractual única para alquiler y venta. El almacenamiento físico `leases` y el endpoint `/leases` se conservan temporalmente como compatibilidad; las integraciones nuevas usan `/contracts`. `sale_agreements` contiene únicamente el plan de cuotas de un contrato de venta.
4. Todo contrato se asocia directamente a `property_id`. `unitId` no forma parte del contrato.
5. El ciclo persistido solo admite `draft`, `active` y `finalized`. La firma se registra aparte como `not_started`, `pending`, `signed`, `declined`, `voided` o `expired`. “Vigente”, “vencido” y “por vencer” son condiciones calculadas para la interfaz.
6. Un DOCX puede seguir dos flujos explícitos: adjuntarse como contrato existente o importarse y convertirse en plantilla editable. Ninguno implica el otro.
7. El inicio es una bandeja orientada a tareas y revisión. Los módulos son destinos secundarios abiertos desde cada tarea.
8. La evaluación económica usa “ingresos mensuales comprobables y relación ingreso/cuota o alquiler”. La documentación económica respalda la evaluación sin inferir solvencia por modalidad laboral.

## Compatibilidad y migración

La migración es aditiva: no elimina tablas, filas, enum values ni endpoints anteriores. Las ventas nuevas crean contrato y plan de cuotas en una misma transacción. Las ventas históricas sin propiedad quedan legibles y deberán vincularse mediante inventario asistido antes de imponer `NOT NULL` en una etapa posterior.

## Consecuencias

- Autorización y navegación deben evaluar todos los roles de la persona.
- Los perfiles comerciales pueden reutilizar una identidad existente por email dentro de la misma compañía.
- La firma no modifica por sí sola el ciclo contractual; la activación continúa siendo una acción explícita.
- Los nombres físicos legados se retirarán únicamente mediante una migración posterior con evidencia productiva.
