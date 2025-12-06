# Especificación Técnica: Sistema de Facturación por Lotes

> **Documento**: Especificación técnica de implementación  
> **Plan de proyecto**: Ver [plan-facturacion.md](../plan-facturacion.md)

---

## 1. Estructura del Proyecto

```
/batch
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── commands/
│   │   ├── billing.command.ts
│   │   ├── overdue.command.ts
│   │   ├── reminders.command.ts
│   │   ├── late-fees.command.ts
│   │   ├── sync-indices.command.ts
│   │   └── reports.command.ts
│   ├── services/
│   │   ├── billing.service.ts
│   │   ├── invoice.service.ts
│   │   ├── arca.service.ts
│   │   ├── email.service.ts
│   │   ├── report.service.ts
│   │   ├── exchange-rate.service.ts
│   │   ├── adjustment.service.ts
│   │   └── indices/
│   │       ├── bcra.service.ts     # ICL Argentina
│   │       └── fgv.service.ts      # IGP-M Brasil
│   ├── templates/
│   │   ├── invoice-issued.hbs
│   │   ├── payment-reminder.hbs
│   │   ├── overdue-notice.hbs
│   │   └── monthly-owner-report.hbs
│   └── shared/
│       ├── database.ts
│       ├── config.ts
│       └── logger.ts
└── scripts/
    └── crontab.example
```

---

## 2. Modelo de Datos

### 2.1 Modificaciones a Entidades Existentes

#### Lease (Contrato)

```sql
-- Ajuste por inflación
ALTER TABLE leases ADD COLUMN adjustment_enabled BOOLEAN DEFAULT false;
ALTER TABLE leases ADD COLUMN adjustment_index VARCHAR(20);  -- 'ICL', 'IGP-M', 'CUSTOM'
ALTER TABLE leases ADD COLUMN adjustment_frequency VARCHAR(20) DEFAULT 'yearly';
ALTER TABLE leases ADD COLUMN adjustment_month INTEGER;  -- Mes en que aplica (1-12)
ALTER TABLE leases ADD COLUMN last_adjustment_date DATE;
ALTER TABLE leases ADD COLUMN last_adjustment_value DECIMAL(10,4);

-- Cláusula de aumento
ALTER TABLE leases ADD COLUMN increase_clause_enabled BOOLEAN DEFAULT false;
ALTER TABLE leases ADD COLUMN increase_clause_type VARCHAR(20);  -- 'percentage', 'fixed_amount', 'index_based'
ALTER TABLE leases ADD COLUMN increase_clause_value DECIMAL(10,4);
ALTER TABLE leases ADD COLUMN increase_clause_frequency VARCHAR(20);
ALTER TABLE leases ADD COLUMN increase_clause_month INTEGER;
ALTER TABLE leases ADD COLUMN next_increase_date DATE;

-- Facturación automática
ALTER TABLE leases ADD COLUMN auto_billing_enabled BOOLEAN DEFAULT true;

-- Multi-moneda
ALTER TABLE leases ADD COLUMN currency_code VARCHAR(3) DEFAULT 'ARS';  -- 'ARS', 'USD', 'BRL'
ALTER TABLE leases ADD COLUMN exchange_rate_type VARCHAR(20) DEFAULT 'official';  -- 'official', 'blue', 'mep'

-- ARCA
ALTER TABLE leases ADD COLUMN arca_enabled BOOLEAN DEFAULT false;
ALTER TABLE leases ADD COLUMN arca_invoice_type VARCHAR(10) DEFAULT 'B';
```

#### Company (Compañía)

```sql
-- Configuración ARCA
ALTER TABLE companies ADD COLUMN arca_enabled BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN arca_cuit VARCHAR(15);
ALTER TABLE companies ADD COLUMN arca_point_of_sale INTEGER;
ALTER TABLE companies ADD COLUMN arca_certificate BYTEA;
ALTER TABLE companies ADD COLUMN arca_private_key BYTEA;
ALTER TABLE companies ADD COLUMN arca_environment VARCHAR(20) DEFAULT 'testing';

-- Agente de retención (Argentina)
ALTER TABLE companies ADD COLUMN is_retention_agent BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN retention_iibb_rate DECIMAL(5,2);
ALTER TABLE companies ADD COLUMN retention_iva_rate DECIMAL(5,2);
ALTER TABLE companies ADD COLUMN retention_ganancias_rate DECIMAL(5,2);

-- País
ALTER TABLE companies ADD COLUMN country_code VARCHAR(2) DEFAULT 'AR';
```

#### Invoice (Factura)

```sql
-- Ajuste aplicado
ALTER TABLE invoices ADD COLUMN adjustment_applied BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN adjustment_index VARCHAR(20);
ALTER TABLE invoices ADD COLUMN adjustment_value DECIMAL(10,4);
ALTER TABLE invoices ADD COLUMN original_amount DECIMAL(12,2);

-- Multi-moneda
ALTER TABLE invoices ADD COLUMN currency_code VARCHAR(3) DEFAULT 'ARS';
ALTER TABLE invoices ADD COLUMN exchange_rate DECIMAL(12,6);
ALTER TABLE invoices ADD COLUMN amount_in_original_currency DECIMAL(12,2);

-- ARCA
ALTER TABLE invoices ADD COLUMN arca_enabled BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN arca_cae VARCHAR(20);
ALTER TABLE invoices ADD COLUMN arca_cae_expiry DATE;
ALTER TABLE invoices ADD COLUMN arca_invoice_type VARCHAR(10);
ALTER TABLE invoices ADD COLUMN arca_point_of_sale INTEGER;
ALTER TABLE invoices ADD COLUMN arca_receipt_number INTEGER;
ALTER TABLE invoices ADD COLUMN arca_emitted_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN arca_qr_data TEXT;
ALTER TABLE invoices ADD COLUMN arca_error TEXT;

-- Retenciones
ALTER TABLE invoices ADD COLUMN retention_iibb DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN retention_iva DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN retention_ganancias DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN net_amount DECIMAL(12,2);
```

### 2.2 Nuevas Entidades

#### InflationIndex

```sql
CREATE TABLE inflation_indices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    index_code VARCHAR(20) NOT NULL,      -- 'ICL', 'IGP-M'
    country_code VARCHAR(2) NOT NULL,     -- 'AR', 'BR'
    period_date DATE NOT NULL,
    value DECIMAL(12,6) NOT NULL,
    variation_monthly DECIMAL(8,4),
    variation_yearly DECIMAL(8,4),
    source VARCHAR(100),
    fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(index_code, period_date)
);
```

#### ExchangeRate

```sql
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(3) NOT NULL,    -- 'USD', 'BRL'
    to_currency VARCHAR(3) NOT NULL,      -- 'ARS'
    rate DECIMAL(12,6) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(50),                   -- 'BCRA', 'BCB', 'manual'
    fetched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency, rate_date)
);
```

#### NotificationPreference

```sql
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    invoice_issued BOOLEAN DEFAULT true,
    payment_received BOOLEAN DEFAULT true,
    payment_reminder BOOLEAN DEFAULT true,
    overdue_notice BOOLEAN DEFAULT true,
    late_fee_applied BOOLEAN DEFAULT true,
    adjustment_applied BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);
```

#### BillingJob (Auditoría)

```sql
CREATE TABLE billing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

#### ReportSchedule

```sql
CREATE TABLE report_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL,     -- 'monthly_summary', 'statement', 'settlement'
    frequency VARCHAR(20) NOT NULL,       -- 'daily', 'weekly', 'monthly'
    recipient_type VARCHAR(20) NOT NULL,  -- 'owner', 'tenant', 'admin'
    recipient_id UUID,                    -- NULL para admin (todos)
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID REFERENCES report_schedules(id),
    report_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,          -- 'pending', 'processing', 'completed', 'failed'
    period_start DATE,
    period_end DATE,
    recipient_email VARCHAR(255),
    file_path TEXT,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. APIs Externas

### 3.1 Índices de Inflación

| Índice | País | Fuente | API Endpoint | Uso |
|--------|------|--------|--------------|-----|
| ICL | AR | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/41` | Ley 27.551 |
| IGP-M | BR | BCB | `api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados` | Estándar alquileres |

### 3.2 Tipos de Cambio

| Moneda | País | Fuente | API Endpoint |
|--------|------|--------|--------------|
| USD/ARS | AR | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/4` |
| BRL/ARS | AR | BCRA | `api.bcra.gob.ar/estadisticas/v2.0/datosvariable/12` |
| USD/BRL | BR | BCB | `api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados` |

---

## 4. Servicios

### 4.1 BcraService

```typescript
// src/services/indices/bcra.service.ts

export class BcraService {
  private readonly API_URL = 'https://api.bcra.gob.ar/estadisticas/v2.0';
  
  async getICL(fromDate: Date, toDate: Date): Promise<ICLResponse[]> {
    const from = format(fromDate, 'yyyy-MM-dd');
    const to = format(toDate, 'yyyy-MM-dd');
    
    // ID Variable ICL: 41
    const url = `${this.API_URL}/datosvariable/41/${from}/${to}`;
    
    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    return response.data.results.map((item: any) => ({
      date: item.fecha,
      value: parseFloat(item.valor),
    }));
  }
  
  async getExchangeRate(currency: 'USD' | 'BRL', date: Date): Promise<number> {
    const variableId = currency === 'USD' ? 4 : 12;
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const url = `${this.API_URL}/datosvariable/${variableId}/${dateStr}/${dateStr}`;
    const response = await axios.get(url);
    
    return parseFloat(response.data.results[0]?.valor || 0);
  }
}
```

### 4.2 FgvService

```typescript
// src/services/indices/fgv.service.ts

export class FgvService {
  async getIGPM(fromDate: Date, toDate: Date): Promise<IGPMResponse[]> {
    // Código da série IGP-M no BCB: 189
    const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados';
    
    const response = await axios.get(url, {
      params: {
        formato: 'json',
        dataInicial: format(fromDate, 'dd/MM/yyyy'),
        dataFinal: format(toDate, 'dd/MM/yyyy'),
      },
    });
    
    return response.data.map((item: any) => ({
      date: item.data,
      value: parseFloat(item.valor),
    }));
  }
}
```

### 4.3 ExchangeRateService

```typescript
export class ExchangeRateService {
  async getRate(from: string, to: string, date: Date): Promise<number> {
    // 1. Buscar en cache (DB)
    const cached = await this.findCachedRate(from, to, date);
    if (cached) return cached.rate;
    
    // 2. Consultar API externa
    const rate = await this.fetchFromAPI(from, to, date);
    
    // 3. Guardar en cache
    await this.saveRate(from, to, date, rate);
    
    return rate;
  }
  
  async convertAmount(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string,
    date: Date
  ): Promise<ConversionResult> {
    if (fromCurrency === toCurrency) {
      return { amount, rate: 1, originalAmount: amount };
    }
    
    const rate = await this.getRate(fromCurrency, toCurrency, date);
    return {
      amount: Math.round(amount * rate * 100) / 100,
      rate,
      originalAmount: amount,
    };
  }
}
```

### 4.4 AdjustmentService

```typescript
export class AdjustmentService {
  async calculateAdjustedRent(lease: Lease): Promise<AdjustedRentResult> {
    let newRentAmount = lease.rentAmount;
    let adjustmentApplied = null;
    
    // 1. Aplicar ajuste por índice (ICL, IGP-M)
    if (lease.adjustmentIndex && this.shouldApplyAdjustment(lease)) {
      const currentIndex = await this.getLatestIndex(lease.adjustmentIndex);
      const baseIndex = lease.lastAdjustmentValue;
      const variation = (currentIndex.value / baseIndex) - 1;
      newRentAmount = lease.rentAmount * (1 + variation);
      
      adjustmentApplied = {
        index: lease.adjustmentIndex,
        baseValue: baseIndex,
        currentValue: currentIndex.value,
        variation: variation * 100,
      };
    }
    
    // 2. Aplicar cláusula de aumento
    if (lease.increaseClauseEnabled && this.shouldApplyIncrease(lease)) {
      switch (lease.increaseClauseType) {
        case 'percentage':
          newRentAmount *= (1 + lease.increaseClauseValue / 100);
          break;
        case 'fixed_amount':
          newRentAmount += lease.increaseClauseValue;
          break;
      }
    }
    
    return {
      originalAmount: lease.rentAmount,
      adjustedAmount: Math.round(newRentAmount * 100) / 100,
      adjustment: adjustmentApplied,
    };
  }
  
  private shouldApplyAdjustment(lease: Lease): boolean {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    return currentMonth === lease.adjustmentMonth;
  }
}
```

### 4.5 BillingService

```typescript
export class BillingService {
  async generateInvoice(lease: Lease, billingDate: Date): Promise<Invoice> {
    // 1. Calcular monto ajustado
    const adjustedRent = await this.adjustmentService.calculateAdjustedRent(lease);
    
    // 2. Convertir moneda si es necesario
    let finalAmount = adjustedRent.adjustedAmount;
    let exchangeRate = null;
    let amountInOriginalCurrency = null;
    
    if (lease.currencyCode !== 'ARS') {
      const conversion = await this.exchangeRateService.convertAmount(
        adjustedRent.adjustedAmount,
        lease.currencyCode,
        'ARS',
        billingDate
      );
      finalAmount = conversion.amount;
      exchangeRate = conversion.rate;
      amountInOriginalCurrency = conversion.originalAmount;
    }
    
    // 3. Calcular retenciones (si aplica)
    let retentions = { iibb: 0, iva: 0, ganancias: 0 };
    if (lease.company.isRetentionAgent) {
      retentions = {
        iibb: finalAmount * (lease.company.retentionIibbRate / 100),
        iva: finalAmount * (lease.company.retentionIvaRate / 100),
        ganancias: finalAmount * (lease.company.retentionGananciasRate / 100),
      };
    }
    
    // 4. Crear factura
    const invoice = await this.invoiceService.create({
      leaseId: lease.id,
      originalAmount: adjustedRent.originalAmount,
      subtotal: finalAmount,
      currencyCode: lease.currencyCode,
      exchangeRate,
      amountInOriginalCurrency,
      retentionIibb: retentions.iibb,
      retentionIva: retentions.iva,
      retentionGanancias: retentions.ganancias,
      netAmount: finalAmount - retentions.iibb - retentions.iva - retentions.ganancias,
      arcaEnabled: lease.arcaEnabled && lease.company.arcaEnabled,
    });
    
    // 5. Emitir en ARCA si corresponde
    if (invoice.arcaEnabled) {
      await this.arcaService.emitInvoice(invoice);
    }
    
    // 6. Enviar notificación
    await this.emailService.sendInvoice(invoice);
    
    return invoice;
  }
}
```

---

## 5. Integración ARCA (ex AFIP)

### 5.1 Flujo de Emisión

```mermaid
sequenceDiagram
    participant BS as BillingService
    participant AS as ArcaService
    participant WSAA as ARCA Auth
    participant WSFEV1 as ARCA Factura

    BS->>AS: emitInvoice(invoice)
    
    alt Token expirado
        AS->>WSAA: LoginCMS(certificate, privateKey)
        WSAA-->>AS: Token + Sign
    else Token válido
        AS->>AS: Usar token existente
    end
    
    AS->>WSFEV1: FECAESolicitar(auth, invoiceData)
    
    alt Success
        WSFEV1-->>AS: CAE + Vencimiento + Nro Comprobante
        AS->>AS: Generar QR
        AS-->>BS: ArcaResponse(success)
    else Error
        WSFEV1-->>AS: Error details
        AS-->>BS: ArcaResponse(error)
    end
```

### 5.2 Cálculo de Retenciones

```typescript
// Ejemplo: Factura de $100.000 con retenciones
const subtotal = 100000;  // ARS

const retentionIIBB = subtotal * 0.035;      // 3.5% = $3.500
const retentionGanancias = subtotal * 0.06;  // 6.0% = $6.000

const netAmount = subtotal - retentionIIBB - retentionGanancias;  // $90.500

// Liquidación al propietario:
// - Alquiler: $100.000
// - Ret. IIBB: -$3.500
// - Ret. Ganancias: -$6.000
// - Comisión (5%): -$5.000
// - Neto a depositar: $85.500
```

---

## 6. Multi-Moneda

### 6.1 Flujo de Facturación

```mermaid
flowchart TD
    A[Contrato en USD] --> B{Fecha de facturación}
    B --> C[Obtener tipo de cambio del día]
    C --> D[Calcular monto en ARS]
    D --> E[Aplicar ajustes/retenciones en ARS]
    E --> F[Generar factura]
    F --> G[Guardar ambos montos]
    
    G --> H[amount_in_original_currency: USD]
    G --> I[total: ARS]
    G --> J[exchange_rate: valor usado]
```

---

## 7. Reportes Automáticos

### 7.1 Tipos de Reportes

| Reporte | Frecuencia | Destinatario | Contenido |
|---------|------------|--------------|-----------|
| Resumen Mensual | 1ro de cada mes | Propietario | Facturas, pagos, balance |
| Estado de Cuenta | Semanal (opcional) | Inquilino | Deuda, próximos vencimientos |
| Liquidación | Mensual | Propietario | Ingresos - Comisiones - Retenciones |
| Morosidad | Diario | Admin | Facturas vencidas > 30 días |

### 7.2 ReportService

```typescript
export class ReportService {
  async generateMonthlyOwnerReport(ownerId: string, period: Date): Promise<Report> {
    const startDate = startOfMonth(period);
    const endDate = endOfMonth(period);
    
    // 1. Obtener datos del período
    const invoices = await this.getOwnerInvoices(ownerId, startDate, endDate);
    const payments = await this.getOwnerPayments(ownerId, startDate, endDate);
    const properties = await this.getOwnerProperties(ownerId);
    
    // 2. Calcular totales
    const summary = {
      totalInvoiced: invoices.reduce((sum, i) => sum + i.total, 0),
      totalCollected: payments.reduce((sum, p) => sum + p.amount, 0),
      totalPending: invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.total, 0),
      totalOverdue: invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.total, 0),
      commissions: this.calculateCommissions(invoices),
      retentions: this.calculateRetentions(invoices),
      netAmount: 0,
    };
    summary.netAmount = summary.totalCollected - summary.commissions - summary.retentions;
    
    // 3. Generar PDF
    const pdfPath = await this.generatePDF('monthly-owner-report', {
      owner: await this.getOwner(ownerId),
      period: { start: startDate, end: endDate },
      properties,
      invoices,
      payments,
      summary,
    });
    
    // 4. Enviar por email
    await this.emailService.sendReport({
      to: owner.email,
      subject: `Resumen Mensual - ${format(period, 'MMMM yyyy', { locale: es })}`,
      template: 'monthly-report-email',
      attachments: [{ filename: 'resumen-mensual.pdf', path: pdfPath }],
    });
    
    return { pdfPath, summary };
  }
}
```

---

## 8. Comandos CLI

```typescript
// src/index.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('batch')
  .description('Billing batch processes')
  .version('1.0.0');

program.command('billing')
  .description('Genera facturas para contratos que corresponden hoy')
  .option('-d, --date <date>', 'Fecha de facturación (YYYY-MM-DD)')
  .option('--dry-run', 'Simular sin crear facturas')
  .action(BillingCommand.execute);

program.command('overdue')
  .description('Marca facturas vencidas')
  .action(OverdueCommand.execute);

program.command('reminders')
  .description('Envía recordatorios de pago')
  .option('--days <days>', 'Días antes del vencimiento', '3')
  .action(RemindersCommand.execute);

program.command('late-fees')
  .description('Aplica intereses por mora')
  .action(LateFeesCommand.execute);

program.command('sync-indices')
  .description('Sincroniza índices de inflación y tipos de cambio')
  .option('--index <index>', 'Índice específico (ICL, IGP-M)')
  .action(SyncIndicesCommand.execute);

program.command('reports')
  .description('Genera y envía reportes programados')
  .option('--type <type>', 'Tipo de reporte (monthly, weekly, daily)')
  .option('--owner <id>', 'ID del propietario específico')
  .option('--dry-run', 'Simular sin enviar emails')
  .action(ReportsCommand.execute);

program.parse();
```

---

## 9. Configuración

### 9.1 Variables de Entorno

```env
# /batch/.env

# Database (shared)
DATABASE_URL=postgresql://user:pass@localhost:5432/rent

# SendGrid
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=facturacion@empresa.com

# ARCA
ARCA_ENVIRONMENT=testing

# APIs de índices
BCRA_API_URL=https://api.bcra.gob.ar/estadisticas/v2.0
FGV_API_URL=https://api.bcb.gov.br/dados/serie

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/batch/batch.log
```

### 9.2 Dependencias

```json
{
  "name": "@rent/batch",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "pg": "^8.11.0",
    "axios": "^1.6.0",
    "handlebars": "^4.7.8",
    "@sendgrid/mail": "^8.1.0",
    "soap": "^1.0.0",
    "qrcode": "^1.5.3",
    "date-fns": "^3.0.0",
    "date-fns-tz": "^2.0.0",
    "winston": "^3.11.0",
    "dotenv": "^16.3.0",
    "puppeteer": "^21.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## 10. Templates de Email

### 10.1 Factura Emitida

```handlebars
{{! templates/invoice-issued.hbs }}
<h1>Nueva Factura</h1>
<p>Estimado/a {{tenant.name}},</p>
<p>Se ha emitido una nueva factura por el alquiler de {{property.address}}:</p>
<table>
  <tr><td>Período:</td><td>{{period}}</td></tr>
  <tr><td>Monto:</td><td>{{formatCurrency invoice.total}}</td></tr>
  <tr><td>Vencimiento:</td><td>{{formatDate invoice.dueDate}}</td></tr>
  {{#if invoice.arcaCae}}
  <tr><td>CAE:</td><td>{{invoice.arcaCae}}</td></tr>
  {{/if}}
</table>
```

### 10.2 Recordatorio de Pago

```handlebars
{{! templates/payment-reminder.hbs }}
<h1>Recordatorio de Pago</h1>
<p>Estimado/a {{tenant.name}},</p>
<p>Le recordamos que tiene una factura próxima a vencer:</p>
<table>
  <tr><td>Factura:</td><td>#{{invoice.number}}</td></tr>
  <tr><td>Monto:</td><td>{{formatCurrency invoice.total}}</td></tr>
  <tr><td>Vencimiento:</td><td>{{formatDate invoice.dueDate}}</td></tr>
</table>
```

### 10.3 Aviso de Mora

```handlebars
{{! templates/overdue-notice.hbs }}
<h1>Aviso de Mora</h1>
<p>Estimado/a {{tenant.name}},</p>
<p>La siguiente factura se encuentra vencida:</p>
<table>
  <tr><td>Factura:</td><td>#{{invoice.number}}</td></tr>
  <tr><td>Monto original:</td><td>{{formatCurrency invoice.total}}</td></tr>
  <tr><td>Días de mora:</td><td>{{daysOverdue}}</td></tr>
  <tr><td>Intereses:</td><td>{{formatCurrency lateFees}}</td></tr>
  <tr><td>Total a pagar:</td><td>{{formatCurrency totalDue}}</td></tr>
</table>
```
