# Revisión administrativa de enmiendas

La migración 133 agrega un historial separado para resolver enmiendas aún no
aplicadas. Cada revisión guarda responsable, fecha, motivo y snapshots anterior y
posterior. No sustituye la aprobación original ni altera sus términos. La tabla
rechaza actualizaciones de su evidencia; la aplicación no expone edición o borrado
de revisiones.

## Acciones

`POST /amendments/:id/reviews` requiere administrador o personal con permiso de
contratos, motivo de 10–2000 caracteres, `expectedUpdatedAt` obtenido al leer la
enmienda e `idempotencyKey` UUID. `GET /amendments/:id/reviews` consulta el historial
con el mismo alcance administrativo y de compañía.

- `cancel`: anula borradores, pendientes o aprobaciones aún no aplicadas, incluidas
  las históricas y las que tienen errores. Retira el cambio de la cola y conserva
  aprobación, evidencia previa e historial. También admite contratos e inmuebles
  dados de baja lógicamente, para retirar trabajos obsoletos.
- `schedule`: habilita expresamente una aprobación histórica en `legacy_review`.
  Revalida contrato activo y valores admitidos. Si está vigente intenta aplicarla;
  en caso contrario conserva la fecha original para el worker. Los conflictos
  contables o de calendario siguen produciendo un error visible; no se fuerzan.

Una enmienda aplicada no admite ninguna de estas acciones. Tampoco se rehabilitan
rechazadas o anuladas, ni se editan valores aprobados para hacerlos pasar por la
aprobación original. Una corrección requiere otra enmienda.

La revisión utiliza el orden de bloqueo inmueble → contrato → enmienda y una
constancia de operación. Si el worker cambia el estado mientras se revisa, se
requiere una nueva lectura. En una carrera entre anulación y aplicación solo una
puede producir el efecto. Reintentar la misma solicitud devuelve su respuesta
original sin duplicar historial; cambiar parámetros bajo su clave se rechaza.
Si falla el historial o la constancia, se revierten también contrato, inmueble y
estado de aplicación. La herramienta `post_amendment_review` utiliza la clave
estable de la bandeja y exige el mismo permiso y motivo.

## Interfaz

El detalle del contrato presenta las enmiendas, vigencia, valores acordados,
estados separados de aprobación/aplicación y evidencia de cambios. Administradores
y personal autorizado pueden consultar historial y confirmar una revisión con
motivo. Propietarios/inquilinos con acceso al contrato ven las enmiendas sin estos
controles administrativos.

Una respuesta incierta conserva la solicitud y su clave en la vista y ofrece
recuperar el mismo resultado. Bloquea otro envío simultáneo y cambios a esa decisión;
actualizar consulta datos sin reenviar. Al abandonar la página se pierde la clave
local: al volver se consulta el estado actual y el historial. Las transiciones
terminales del servidor impiden repetir la decisión con otra clave. Un rechazo
explícito exige actualizar antes de decidir de nuevo. Un fallo al refrescar el
contrato después de una respuesta satisfactoria no vuelve a enviar la revisión.

## Evidencia y pendientes

PostgreSQL cubre motivos/versiones/claves inválidos, alcance por rol y compañía,
anulación de estados admitidos, contratos dados de baja, aprobación histórica,
conflictos, aplicación concurrente, inmutabilidad del historial y rollback por
fallo de auditoría. La bandeja real prueba pérdida de respuesta y recuperación.
Web prueba confirmación, lectura/historial, rechazo de versiones obsoletas,
respuesta perdida y doble envío. La prueba de navegador usa respuestas controladas;
no sustituye las pruebas de backend real.

Siguen pendientes el formulario web de alta/envío/aprobación/rechazo de enmiendas,
la revisión de los registros históricos reales y el despliegue coordinado. Requiere
las migraciones 128, 132 y 133. Un rollback conserva historial y enmiendas aplicadas;
no elimina evidencia ni revierte cambios contractuales automáticamente.
