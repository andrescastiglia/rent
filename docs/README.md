# Documentación

La fuente vigente se lee en este orden:

1. [Contrato de producto](functional/requisitos-producto.md)
2. [ADR-001](technical/adr-001-modelo-producto.md)
3. [Historias principales](user/historias-de-usuario.md) y [refactor](user/historias-de-usuario-refactor-personas-contratos.md)
4. [OpenAPI](api/openapi.v1.json) y [capacidades](api/capabilities.v1.json)
5. [Despliegue](deployment/deployment.md) y runbooks específicos

## Catálogo y gobierno

El catálogo cubre todos los archivos bajo `docs/`. El corte común es
**2026-09-02**; Git conserva el historial de cada revisión.

- **Fuente — owner Producto — sin reemplazo:**
  `user/SISTEMA DE ALQUILERES.docx`.
- **Fuente normalizada — owner Producto — prevalece el contrato vigente:**
  `user/raw.md` y `user/reconciliacion-requisitos.md`.
- **Vigente de producto — owner Producto e Ingeniería — reemplaza requisitos
  incompatibles de las fuentes:** `functional/requisitos-producto.md`,
  `user/historias-de-usuario.md`, `user/historias-de-usuario-crm.md` y
  `user/historias-de-usuario-refactor-personas-contratos.md`.
- **Vigente técnico — owner Ingeniería — sin reemplazo vigente:**
  `technical/adr-001-modelo-producto.md`, `technical/arquitectura.md`,
  `technical/observability-prometheus.md`, `technical/payments.md`,
  `technical/seguridad-runtime.md`, `technical/uploads-seguros.md` y
  `technical/whatsapp-inbox.md`.
- **Vigente operativo — owner Operaciones e Ingeniería — sin reemplazo
  vigente:** `deployment/deployment.md`, `deployment/operations-slo.md` y
  `development/local-setup.md`.
- **Vigente generado — owner Ingeniería — se regenera desde el código:**
  `api/openapi.v1.json` y `api/capabilities.v1.json`.
- **Evidencia — owner Ingeniería — no normativa:**
  `auditoria-integral-2026-08-27.md`,
  `technical/frontend-wcag22-nielsen-audit.md` y
  `deployment/rag-production-readiness.md`.
- **Histórico — owner Producto e Ingeniería — reemplazado:**
  `functional/drf-original.md` por `functional/requisitos-producto.md`;
  `technical/c4-model.md`, `technical/der.md` y `technical/sequence.md` por
  `technical/arquitectura.md` y `technical/adr-001-modelo-producto.md`; y
  `user/casos-de-uso-datos-demo.md` por las historias vigentes.
- **Pendiente — owner Producto e Ingeniería — se vacía al aportar evidencia:**
  `plan-de-trabajo.md`.
- **Índice — owner Ingeniería — este archivo:** `README.md`.

Los documentos históricos se conservan para trazabilidad y no deben usarse
para generar código nuevo. Ante una diferencia, prevalecen los documentos en
el orden indicado al comienzo de este índice.
