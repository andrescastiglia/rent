# Uploads seguros

## Contrato vigente

Los documentos y las imágenes de propiedades no se publican desde un directorio
del proceso. La ruta global `/uploads/` está deshabilitada.

### Documentos

- La compañía se toma exclusivamente del actor autenticado. El cliente no puede
  elegir `companyId`.
- `entityType` usa una lista cerrada y la entidad padre debe existir, pertenecer a
  la compañía y no estar eliminada.
- La URL `PUT` vence en cinco minutos, firma tipo y tamaño, y apunta a una clave
  aleatoria bajo `quarantine/<companyId>/`.
- La confirmación vuelve a validar compañía, estado, clave, tamaño y MIME del
  objeto. Después copia a una clave opaca determinista, persiste la aprobación y
  elimina la copia en cuarentena.
- Sólo los documentos aprobados se listan o reciben una URL `GET`; esa URL también
  vence en cinco minutos y la consulta está limitada a la compañía autenticada.
- Una confirmación ya aprobada es idempotente. Si falla la persistencia, la copia
  en cuarentena se conserva y la promoción se puede reintentar sobre la misma
  clave final.

El bucket debe ser privado. Configurar una lifecycle policy para borrar objetos
`quarantine/` abandonados después de 24 horas. El log
`document_quarantine_cleanup_failed` requiere alerta; `document_upload_approved`
permite correlacionar documento y compañía sin registrar nombre ni contenido.

### Imágenes de propiedades

- El interceptor y el servicio limitan cada archivo a 5 MiB.
- Se aceptan únicamente JPEG, PNG y WebP, y se comprueba la firma binaria en lugar
  de confiar sólo en el `Content-Type` enviado por el cliente.
- La imagen temporal queda en `property_images`, ligada a compañía y cargador. Su
  vista previa pública necesita una firma HMAC con vencimiento de quince minutos.
- Al guardar una propiedad, el backend valida la compañía y que la imagen no esté
  asignada a otra propiedad; recién entonces quita el estado temporal. La URL
  persistida no conserva el token temporal.
- Definir `PROPERTY_IMAGE_SIGNING_SECRET` con un valor aleatorio dedicado. Durante
  la transición existe fallback a `JWT_SECRET`; no reutilizarlo en producción.

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

La cobertura incluye ID de otra compañía, metadata S3 distinta, fallo de DB durante
la promoción, token temporal ausente/inválido/vencido, MIME falsificado y exceso de
tamaño.
