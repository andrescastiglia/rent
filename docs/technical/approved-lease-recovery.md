# Recuperación de operaciones aprobadas sobre contratos

Estas herramientas ahora persisten el resultado original en la misma transacción
del cambio contractual, usando la constancia de dominio de la migración 128:

- `post_lease_draft_render`: texto resuelto a partir de la plantilla.
- `patch_lease_draft_text`: edición del texto y su formato.
- `post_lease_confirm` y `patch_lease_activate`: confirmación, inmueble, cuenta
  del inquilino y cola de documento.
- `patch_lease_terminate` y `patch_lease_finalize`: cierre del contrato y estado
  del inmueble. Ambos conservan el comportamiento vigente `finalized`.

La clave estable de la aprobación se transmite al servicio. Si el proceso pierde
la respuesta después del commit, el reintento autorizado devuelve el resultado
original, incluso si el contrato cambió de estado o tuvo una baja posterior.
No vuelve a resolver la plantilla, anexar el motivo, crear una cuenta ni encolar
otro PDF. Cambiar la operación o sus parámetros con la misma clave produce un
conflicto. Las rutas HTTP sin clave conservan sus validaciones de estado actuales.

La edición de texto y el renderizado bloquean inmueble y contrato en el mismo
orden que la confirmación. El resultado se lee dentro de la transacción. Si
confirmar gana la carrera, la edición posterior se rechaza; si editar gana, la
confirmación utiliza ese texto. Ninguno de esos dos editores puede reabrir un
contrato ya activo mediante una escritura atrasada. Las lecturas de plantilla
del renderizado utilizan el administrador de esa transacción.

Las pruebas PostgreSQL recorren la bandeja real: reautenticación, respuesta
perdida después del efecto, cambio posterior y baja, recuperación concurrente,
rechazo por otra compañía/rol y conservación de cuentas/outbox. Otros casos
fuerzan el fallo al persistir la constancia y comprueban rollback completo,
edición/renderizado concurrentes con confirmación y cambio de parámetros bajo
la misma clave. No se llaman proveedores externos ni se genera el PDF dentro
de la confirmación.

No requiere una migración adicional sobre 128. Las aprobaciones históricas sin
contrato de recuperación siguen necesitando revisión manual. Aún quedan por
portar enmiendas, además de herramientas
mutables de otros dominios. Altas y edición general/revisiones se incorporan en el
[contrato de borradores recuperables](approved-lease-drafts.md). La renovación
se incorpora en [su recorrido atómico](approved-lease-renewals.md); este avance no garantiza
todo el ciclo contractual. Crons e integraciones
permanecen deshabilitados. Bajas y plantillas continúan en
[su recorrido recuperable](approved-lease-deletions-templates.md).
La importación HTTP/web continúa en [su recorrido recuperable](recoverable-contract-imports.md).
