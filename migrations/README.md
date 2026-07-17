# Database Migrations

Este directorio contiene las migraciones incrementales que se aplican sobre el snapshot base de `scripts/init-db.sql`.

## Modelo Actual

- `scripts/init-db.sql` es el snapshot completo usado para crear una base local desde cero.
- `migrations/*.sql` contiene cambios incrementales para bases ya existentes.
- `schema_migrations` registra qué archivos ya fueron aplicados.
- `scripts/reset-db.sh` recrea la DB local, ejecuta el snapshot, registra las
  migraciones incluidas hasta `090_add_ai_rag_shadow_comparisons.sql` y ejecuta
  normalmente toda migración posterior.

Este modelo evita re-ejecutar migraciones antiguas sobre una estructura que ya las contiene.

## Ejecutar Migraciones

Desde la raíz del proyecto:

```bash
./migrations/run-migrations.sh
```

Ver estado:

```bash
./migrations/run-migrations.sh --status
```

Reset local completo:

```bash
./scripts/reset-db.sh --force
```

## Variables

El runner lee `.env` y usa estas variables:

```bash
POSTGRES_HOST
POSTGRES_PORT
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

## Crear Una Migración

1. Buscar el último número:

```bash
ls -1 migrations/*.sql | sort -V | tail -1
```

2. Crear el siguiente archivo con tres dígitos:

```bash
touch migrations/082_add_new_feature.sql
```

3. Hacer la migración idempotente cuando sea posible:

```sql
CREATE TABLE IF NOT EXISTS example_table (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

4. Probar contra una copia o base temporal antes de aplicarla en entornos compartidos.

## Reglas Prácticas

- No editar migraciones ya aplicadas en ambientes compartidos; crear una nueva.
- Si se actualiza `scripts/init-db.sql` para incluir una migración, verificar que `reset-db.sh` sigue dejando `schema_migrations` coherente.
- Para cambios con datos reales, tomar backup antes y usar SQL reversible/idempotente cuando sea razonable.
- Las funciones de `updated_at` viven en el schema `functions`; usar `functions.update_updated_at_column()` en tablas nuevas.

## Troubleshooting

Si una base ya tiene tablas pero no tiene `schema_migrations`, el runner se
niega a asumir estado por defecto. Para una base creada desde el snapshot
actual se registra la línea base hasta la última migración realmente incluida
y luego se ejecutan las posteriores:

```bash
./migrations/run-migrations.sh \
  --baseline-through 090_add_ai_rag_shadow_comparisons.sql \
  --force-baseline-through
```

Usar esa opción sólo después de confirmar que el snapshot contiene la
estructura esperada hasta esa migración. No usar `--baseline-all-if-missing`
para un snapshot atrasado: marcaría SQL pendiente como ejecutado.
