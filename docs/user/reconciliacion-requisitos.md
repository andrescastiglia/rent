# Reconciliación de requisitos de usuario

**Estado:** vigente  
**Fecha:** 2026-09-02

## Fuentes

- `SISTEMA DE ALQUILERES.docx`: pedido original, conservado sin modificaciones.
- `raw.md`: transcripción normalizada.
- `historias-de-usuario.md` y `historias-de-usuario-refactor-personas-contratos.md`: criterios verificables.
- `requisitos-producto.md` y ADR-001: interpretación canónica cuando una fuente difiere.

## Resoluciones

- El perfil económico usa la redacción canónica “ingresos mensuales comprobables y relación ingreso/cuota o alquiler”.
- Se aceptan propietarios sin cuenta, personas multirrol, contrato unificado, asociación directa a propiedad, estados acotados y los dos flujos DOCX.
- Se rechaza el DOC binario legado porque no puede interpretarse de forma segura con el parser disponible; debe convertirse a DOCX. La carga existente admite PDF, DOCX, Markdown y TXT.
- Se reemplazan dashboards paralelos por un inicio único orientado a tareas y revisión.
- Se conservan todas las historias de pagos. Para eliminar colisiones, las historias del refactor se renumeraron `US-PAY-07` a `US-PAY-10`; `US-PAY-01` a `US-PAY-06` mantienen su identidad original.
- Se descarta `unitId` únicamente en contratos. El inventario de unidades legado no se elimina en esta etapa para evitar pérdida de datos.
