# Uploads seguros

## Contrato vigente

Los documentos y las imágenes de propiedades no se publican desde un directorio
del proceso. La ruta global `/uploads/` está deshabilitada.

### Documentos

- La compañía se toma exclusivamente del actor autenticado. El cliente no puede
  elegir `companyId`.
- `entityType` usa una lista cerrada y la entidad padre debe existir, pertenecer a
  la compañía, no estar eliminada y estar vinculada al actor autenticado.
- Administración y personal con permiso de contratos operan sobre la compañía.
  El propietario queda limitado a sus inmuebles y relaciones; el inquilino, a su
  alquiler activo o contratos propios; y el comprador, a su compraventa. Inquilino
  y comprador sólo tienen lectura.
- `POST /documents/upload-url` crea un registro pendiente con una referencia
  `db://document/<id>`. Su URL `PUT` apunta a `/documents/:id/content` en la API.
- La URL lleva una firma HMAC con contexto exclusivo de documentos, basada en
  `JWT_SECRET`, y vence en cinco minutos. Vincula documento, operación y actor.
  No se necesita una credencial adicional. No registrar el parámetro `token`.
- `PUT` recibe el cuerpo binario con el `Content-Type` declarado, hasta 10 MiB
  (5 MiB para fotos), y verifica tamaño, MIME, compañía y relación con la entidad.
  Guarda los bytes en `documents.file_data`; un documento aprobado no se puede
  sobrescribir usando una URL de subida anterior.
- La confirmación verifica en una única sentencia SQL que los bytes existan y
  tengan el tamaño declarado, y registra estado, verificador y fecha. Es
  idempotente y no elimina contenido si falla la persistencia.
- Los listados y respuestas de metadatos excluyen la columna binaria. Sólo los
  documentos aprobados reciben una URL `GET` firmada por cinco minutos. Al usarla
  se vuelven a verificar estado, compañía y relación del actor con la entidad.
- Las descargas llevan `Content-Disposition: attachment`, `Cache-Control:
  no-store` y `X-Content-Type-Options: nosniff`. La eliminación es lógica.
- Todos los PDF generados, incluidos los recibos de compraventa, se guardan en
  PostgreSQL. Backups y restauraciones deben incluir `documents.file_data`.

### Imágenes de propiedades

- El interceptor y el servicio limitan cada archivo a 5 MiB.
- Se aceptan únicamente JPEG, PNG y WebP, y se comprueba la firma binaria en lugar
  de confiar sólo en el `Content-Type` enviado por el cliente.
- La imagen temporal queda en `property_images`, ligada a compañía y cargador. Su
  vista previa pública necesita una firma HMAC con vencimiento de quince minutos.
- Un propietario sólo puede descartar o adjuntar imágenes temporales cargadas por
  su propio usuario. Administración y personal conservan alcance de compañía.
- Al guardar una propiedad, el backend valida la compañía y que la imagen no esté
  asignada a otra propiedad; recién entonces quita el estado temporal. La URL
  persistida no conserva el token temporal.
- Definir `PROPERTY_IMAGE_SIGNING_SECRET` con un valor aleatorio dedicado. La
  validación de arranque lo exige en todo entorno que no sea de prueba.

## Despliegue y rollback

Antes de desplegar el corte de `/uploads/`, inventariar en la base las referencias
`/uploads/properties/`. Si existen, migrar cada archivo válido a `property_images`,
actualizar `properties.images` en una transacción y verificar conteo y checksum.
El workspace actual no contiene archivos legados, pero esto no sustituye el
inventario del entorno productivo.

El cambio no agrega ni elimina columnas. Para rollback de aplicación se puede
volver al artefacto anterior sin revertir datos. No se debe reactivar el directorio
estático como mitigación: ante una migración incompleta, restaurar el artefacto
anterior detrás de acceso restringido o completar la migración desde el backup.

## Verificación reproducible

Desde `backend/`:

```bash
npm run type-check
npm run lint:check
npm test -- --runInBand \
  src/documents/documents.service.spec.ts \
  src/documents/documents.controller.spec.ts \
  src/properties/properties.service.spec.ts \
  src/properties/property-images.controller.spec.ts \
  src/main.spec.ts
```

La cobertura incluye ID de otra compañía, entidad no relacionada dentro de la misma
compañía, alquiler activo del inquilino, contenido de tamaño/MIME distinto, fallo de DB durante
la confirmación, token temporal ausente/inválido/vencido, MIME falsificado y exceso de
tamaño.
