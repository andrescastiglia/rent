# Arquitectura técnica vigente

**Estado:** vigente
**Corte:** 2026-09-02
**Responsable:** ingeniería

## Sistema

La plataforma es un monolito modular desplegado como cuatro artefactos coordinados:

- API NestJS (`backend`) con PostgreSQL/pgvector, Redis, S3 compatible y proveedores externos.
- Web Next.js (`frontend`).
- Aplicación nativa Expo/React Native (`mobile`).
- Procesos batch TypeScript (`batch`).

PostgreSQL es la fuente de verdad. Las operaciones externas posteriores a un commit se publican mediante outbox; los webhooks entrantes usan inbox e idempotencia. OpenAPI y el manifiesto de capacidades sincronizan backend, web, mobile e IA.

## Dominio

- `User` representa durante la migración la identidad única de una persona y su acceso opcional. `roles` admite roles simultáneos y `role` conserva compatibilidad.
- `Owner`, `Tenant` y `Buyer` son perfiles de relación de esa misma identidad, no personas duplicadas.
- `Contract` es el agregado contractual para alquiler o venta y apunta directamente a `Property`.
- El nombre físico `leases` es una compatibilidad temporal. `/contracts` es la API canónica y `/leases` es un alias legado.
- `SaleAgreement` extiende un contrato de venta con su plan de cuotas; no es otro contrato.
- El ciclo contractual y el flujo de firma son estados independientes según [ADR-001](adr-001-modelo-producto.md).

## Autorización

Toda consulta se limita por `companyId`. El guard evalúa el conjunto completo de roles. Un rol `staff` necesita permiso afirmativo por módulo; los roles externos son de autoservicio y solo acceden a relaciones propias. Las operaciones mutables de IA pasan por propuesta, reautenticación y revisión.

## Navegación

Web y mobile abren en un inicio orientado a tareas: vencimientos, cobros, renovaciones, comunicaciones y acciones pendientes de revisión. Las pantallas por módulo son vistas secundarias. Las rutas visibles y los deep links aplican el mismo manifiesto de capacidades.

## Despliegue

`oracle` es el único ambiente productivo. No se ejecutan pruebas ni ensayos allí. Un tag firmado sobre `main` dispara CI, compila artefactos inmutables, ejecuta migraciones aditivas y cambia el symlink de la versión de manera atómica. Los secretos se administran como GitHub Actions secrets y se materializan con permisos restrictivos en el `.env` compartido del servidor.

El rollback de aplicación restaura el symlink anterior. Las migraciones publicadas deben ser compatibles hacia adelante porque la recuperación destructiva de datos y disaster recovery quedan para otra etapa.

## Fuera de la arquitectura vigente

No forman parte del runtime actual: microservicios independientes, GraphQL, Elasticsearch, Kubernetes, Qdrant/Rust, DocuSign habilitado sin proveedor real ni PWA como sustituto de la aplicación nativa. Los documentos que los describen están clasificados como históricos o exploratorios en [el índice](../README.md).
