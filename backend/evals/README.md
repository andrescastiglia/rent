# Evaluación RAG y rollout

El dataset `rag-eval.dataset.json` contiene 50 casos por empresa y rol
(`admin`, `staff`, `owner`, `tenant`). Incluye consultas estructuradas,
semánticas, híbridas, financieras y adversariales. Cada caso declara la
conducta esperada, estrategia, entidades conocidas y tipos de fuente
requeridos.

## Modos

- `TOOLS`: comportamiento legado y rollback inmediato.
- `RAG_SHADOW`: ejecuta ambos caminos, guarda únicamente hashes y métricas en
  `ai_rag_shadow_comparisons`, y muestra la respuesta de tools.
- `RAG_READ`: usa RAG para lecturas; las mutaciones siguen por tools.
- `HYBRID`: habilita RAG y permite retirar tools de lectura mediante
  `AI_RAG_RETIRED_READ_TOOLS`.

Los modos distintos de `TOOLS` sólo aplican a las empresas incluidas en
`AI_RAG_ENABLED_COMPANY_IDS`.

## Ejecución

```bash
npm run rag:eval -- --report /tmp/rag-eval.json --strict
npm run rag:eval -- --role owner
npm run rag:eval -- --category adversarial --strict
npm run rag:shadow-report -- --hours 24
```

El informe incluye recall@K, precisión/autorización de fuentes, groundedness,
exactitud financiera por fuente, abstención correcta, respuestas incorrectas
sin abstención, estrategia, latencia p50/p95, tokens y costo estimado. Las tasas
de costo se configuran con `AI_RAG_INPUT_USD_PER_MILLION` y
`AI_RAG_OUTPUT_USD_PER_MILLION`.

La ejecución estricta falla ante cualquier caso fallido, fuga de alcance,
afirmación financiera sin fuente estructurada o respuesta sin evidencia.

Por seguridad, el runner usa exclusivamente el dataset versionado
`rag-eval.dataset.json`; no acepta rutas arbitrarias del sistema de archivos.
El endpoint puede ser local (`localhost`, `127.0.0.1` o `::1`). Para evaluar
contra un host remoto debe usar HTTPS y su origen exacto debe estar incluido en
`AI_EVAL_ALLOWED_ORIGINS` (lista separada por comas).

## Promoción y rollback

La promoción se hace por empresa: `RAG_SHADOW` → `RAG_READ` → `HYBRID`. Antes
de incluir owner/tenant se ejecuta el dataset completo y la categoría
adversarial con cero fugas. El rollback funcional consiste en volver
`AI_RETRIEVAL_MODE=TOOLS` y reiniciar el backend; no se eliminan tablas ni
chunks para poder diagnosticar y retomar el rollout.
