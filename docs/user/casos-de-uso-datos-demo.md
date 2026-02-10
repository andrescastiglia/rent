# Casos de Uso de Datos Demo

## Objetivo
Documentar los casos de uso minimos para:

1. Propietarios y propiedades.
2. Interesados en distintos tipos.
3. Plantillas de contratos de alquiler y compra/venta.

Estos casos se cargan automaticamente con `scripts/reset_data.sql`.

## 1) Propietarios / Propiedades

### Caso A: cartera orientada a alquiler
- Propietario: **Ana Gomez**.
- Propiedades:
  - `Edificio Sol` (departamentos para alquiler, estado `available`).
  - `PH Centro` (alquiler activo, estado `rented`).
- Objetivo funcional:
  - cubrir busquedas y filtros de propiedades de alquiler.
  - cubrir propiedad en estado ocupado/alquilado.

### Caso B: cartera orientada a venta y mixta
- Propietario: **Bruno Diaz**.
- Propiedades:
  - `Local Comercial Norte` (solo venta, estado `available`).
  - `Lote Barrio Verde` (venta + alquiler, estado `reserved`).
- Objetivo funcional:
  - cubrir filtros por operacion `sale`.
  - cubrir propiedades con operaciones mixtas (`rent` + `sale`).
  - cubrir estados comerciales no triviales (`reserved`).

### Dependencias tecnicas cubiertas
- `companies` -> `users` -> `owners` -> `properties` -> `units`.
- Se agrega un contrato de alquiler activo para el caso de propiedad `rented`.

## 2) Interesados en distintos tipos

Se crean perfiles para cubrir el flujo comercial simplificado de estados:
`interested`, `tenant`, `buyer`.

### Casos incluidos
1. **Interesado alquiler**:
   - operacion principal `rent`, estado `interested`.
2. **Interesado compra**:
   - operacion principal `sale`, estado `interested`.
3. **Interesado mixto**:
   - operaciones `rent` y `sale`, estado `interested`.
4. **Convertido a inquilino**:
   - estado `tenant`, con `converted_to_tenant_id` vinculado.
5. **Convertido a comprador**:
   - estado `buyer`, con `converted_to_sale_agreement_id` vinculado.

### Dependencias tecnicas cubiertas
- `users` (staff/admin) para asignacion de responsable.
- `tenants` para conversion a inquilino.
- `sale_folders` + `sale_agreements` para conversion a comprador.

## 3) Plantillas de contratos (alquiler y compra/venta)

### Plantillas cargadas
1. **Alquiler estandar** (`contract_type = rental`).
2. **Alquiler con ajustes y mora** (`contract_type = rental`).
3. **Compra/venta estandar** (`contract_type = sale`).

### Variables incluidas en ejemplos
- Generales: `{{today}}`.
- Contrato: `{{lease.*}}`.
- Propiedad: `{{property.*}}`.
- Propietario: `{{owner.*}}`.
- Inquilino: `{{tenant.*}}`.
- Comprador: `{{buyer.*}}`.

### Objetivo funcional
- Validar render de borrador desde plantilla.
- Validar confirmacion de contrato con reemplazo de variables.
- Validar coexistencia de plantillas por tipo de contrato.

## Script de carga
- Archivo: `scripts/reset_data.sql`
- Caracteristicas:
  - limpia filas respetando dependencias (truncate con cascade).
  - inserta datos base y casos de uso con IDs fijos.
  - es idempotente: ejecutarlo N veces deja el mismo resultado final.

## Orden de insercion usado
1. Monedas (`currencies`).
2. Empresa (`companies`).
3. Usuarios (`users`).
4. Propietarios e inquilino (`owners`, `tenants`).
5. Propiedades y unidades (`properties`, `units`).
6. Carpeta y acuerdo de venta (`sale_folders`, `sale_agreements`).
7. Interesados (`interested_profiles`).
8. Plantillas (`lease_contract_templates`).
9. Contrato de alquiler y cuenta corriente (`leases`, `tenant_accounts`).
