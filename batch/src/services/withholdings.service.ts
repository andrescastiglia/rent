import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";

/**
 * Withholding calculation result.
 */
export interface WithholdingResult {
  iibb: number;
  iibbJurisdiction?: string;
  iva: number;
  ganancias: number;
  total: number;
  breakdown: WithholdingBreakdown[];
}

/**
 * Individual withholding breakdown item.
 */
export interface WithholdingBreakdown {
  type: "iibb" | "iva" | "ganancias";
  rate: number;
  base: number;
  amount: number;
  description: string;
}

/**
 * Company withholding configuration.
 */
export interface WithholdingConfig {
  isWithholdingAgent: boolean;
  iibbRate: number;
  iibbJurisdiction?: string;
  ivaRate: number;
  gananciasRate: number;
  gananciasMinAmount: number;
}

/**
 * Owner fiscal data for withholdings.
 */
export interface OwnerFiscalData {
  cuit?: string;
  taxCategory?: string;
  iibbExempt: boolean;
  ivaExempt: boolean;
  gananciasExempt: boolean;
}

/**
 * Service for calculating tax withholdings.
 * Supports IIBB, IVA, and Ganancias withholdings for Argentina.
 */
export class WithholdingsService {
  /**
   * Default withholding rates (percentages).
   */
  private static readonly DEFAULT_RATES = {
    iibb: 3.5,
    iva: 0,
    ganancias: 6.0,
  };

  /**
   * Minimum amounts for certain withholdings.
   */
  private static readonly DEFAULT_MIN_AMOUNTS = {
    ganancias: 50000, // ARS - typical minimum for ganancias retention
  };

  private static readonly DEFAULT_CONFIG: WithholdingConfig = {
    isWithholdingAgent: false,
    iibbRate: 0,
    ivaRate: 0,
    gananciasRate: 0,
    gananciasMinAmount: 0,
  };

  /**
   * Calculates withholdings for an invoice.
   *
   * @param companyId - Company ID (withholding agent).
   * @param ownerId - Owner ID (subject to withholding).
   * @param amount - Invoice amount (base for calculation).
   * @returns Withholding result with breakdown.
   */
  async calculateWithholdings(
    companyId: string,
    ownerId: string,
    amount: number,
  ): Promise<WithholdingResult> {
    const config = await this.getCompanyConfig(companyId);

    const result: WithholdingResult = {
      iibb: 0,
      iva: 0,
      ganancias: 0,
      total: 0,
      breakdown: [],
    };

    // If company is not a withholding agent, return zeros
    if (!config.isWithholdingAgent) {
      return result;
    }

    const ownerData = await this.getOwnerFiscalData(ownerId);

    // Calculate IIBB withholding
    if (!ownerData.iibbExempt && config.iibbRate > 0) {
      const iibb = this.calculateIibb(amount, config);
      result.iibb = iibb.amount;
      result.iibbJurisdiction = config.iibbJurisdiction;
      result.breakdown.push(iibb);
    }

    // Calculate IVA withholding
    if (!ownerData.ivaExempt && config.ivaRate > 0) {
      const iva = this.calculateIva(amount, config);
      result.iva = iva.amount;
      result.breakdown.push(iva);
    }

    // Calculate Ganancias withholding
    if (!ownerData.gananciasExempt && config.gananciasRate > 0) {
      const ganancias = this.calculateGanancias(amount, config);
      result.ganancias = ganancias.amount;
      if (ganancias.amount > 0) {
        result.breakdown.push(ganancias);
      }
    }

    result.total = result.iibb + result.iva + result.ganancias;

    logger.debug("Withholdings calculated", {
      companyId,
      ownerId,
      amount,
      result,
    });

    return result;
  }

  /**
   * Calculates IIBB withholding.
   */
  private calculateIibb(
    amount: number,
    config: WithholdingConfig,
  ): WithholdingBreakdown {
    const rate = config.iibbRate;
    const withholdingAmount = Math.round(amount * (rate / 100) * 100) / 100;

    return {
      type: "iibb",
      rate,
      base: amount,
      amount: withholdingAmount,
      description: config.iibbJurisdiction
        ? `Retención IIBB ${config.iibbJurisdiction} (${rate}%)`
        : `Retención IIBB (${rate}%)`,
    };
  }

  /**
   * Calculates IVA withholding.
   */
  private calculateIva(
    amount: number,
    config: WithholdingConfig,
  ): WithholdingBreakdown {
    const rate = config.ivaRate;
    const withholdingAmount = Math.round(amount * (rate / 100) * 100) / 100;

    return {
      type: "iva",
      rate,
      base: amount,
      amount: withholdingAmount,
      description: `Retención IVA (${rate}%)`,
    };
  }

  /**
   * Calculates Ganancias withholding.
   * Only applies if amount exceeds minimum threshold.
   */
  private calculateGanancias(
    amount: number,
    config: WithholdingConfig,
  ): WithholdingBreakdown {
    const rate = config.gananciasRate;
    const minAmount =
      config.gananciasMinAmount ||
      WithholdingsService.DEFAULT_MIN_AMOUNTS.ganancias;

    // Only apply if amount exceeds minimum
    if (amount < minAmount) {
      return {
        type: "ganancias",
        rate,
        base: amount,
        amount: 0,
        description: `Retención Ganancias no aplica (monto < $${minAmount})`,
      };
    }

    const withholdingAmount = Math.round(amount * (rate / 100) * 100) / 100;

    return {
      type: "ganancias",
      rate,
      base: amount,
      amount: withholdingAmount,
      description: `Retención Ganancias (${rate}%)`,
    };
  }

  /**
   * Gets company withholding configuration.
   */
  private async getCompanyConfig(
    companyId: string,
  ): Promise<WithholdingConfig> {
    const columns = await this.getCompaniesColumns();
    const hasLegacyColumns = columns.has("is_withholding_agent");

    if (hasLegacyColumns) {
      return this.getLegacyCompanyConfig(companyId);
    }

    return this.getJsonCompanyConfig(companyId);
  }

  private async getCompaniesColumns(): Promise<Set<string>> {
    const result = await AppDataSource.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'companies'`,
    );

    return new Set(
      result.map((row: { column_name?: string }) => row.column_name || ""),
    );
  }

  private async getLegacyCompanyConfig(
    companyId: string,
  ): Promise<WithholdingConfig> {
    const result = await AppDataSource.query(
      `SELECT 
         is_withholding_agent as "isWithholdingAgent",
         withholding_iibb_rate as "iibbRate",
         withholding_iibb_jurisdiction as "iibbJurisdiction",
         withholding_iva_rate as "ivaRate",
         withholding_ganancias_rate as "gananciasRate",
         withholding_ganancias_min_amount as "gananciasMinAmount"
       FROM companies
       WHERE id = $1`,
      [companyId],
    );

    if (result.length === 0) {
      return WithholdingsService.DEFAULT_CONFIG;
    }

    const row = result[0];
    return {
      isWithholdingAgent: row.isWithholdingAgent || false,
      iibbRate: this.toNumber(row.iibbRate),
      iibbJurisdiction: row.iibbJurisdiction || undefined,
      ivaRate: this.toNumber(row.ivaRate),
      gananciasRate: this.toNumber(row.gananciasRate),
      gananciasMinAmount: this.toNumber(row.gananciasMinAmount),
    };
  }

  private async getJsonCompanyConfig(
    companyId: string,
  ): Promise<WithholdingConfig> {
    const result = await AppDataSource.query(
      `SELECT
         COALESCE(withholding_agent_iibb, false) as "withholdingAgentIibb",
         COALESCE(withholding_agent_ganancias, false) as "withholdingAgentGanancias",
         COALESCE(withholding_rates, '{}'::jsonb) as "withholdingRates"
       FROM companies
       WHERE id = $1`,
      [companyId],
    );

    if (result.length === 0) {
      return WithholdingsService.DEFAULT_CONFIG;
    }

    const row = result[0];
    const rates = (row.withholdingRates || {}) as Record<string, unknown>;
    const iibbRate = this.firstNumber(rates, ["iibb", "iibbRate"]);
    const ivaRate = this.firstNumber(rates, ["iva", "ivaRate"]);
    const gananciasRate = this.firstNumber(rates, [
      "ganancias",
      "gananciasRate",
    ]);
    const gananciasMinAmount = this.firstNumber(rates, [
      "gananciasMinAmount",
      "ganancias_min_amount",
    ]);
    const iibbJurisdictionRaw =
      rates.iibbJurisdiction || rates.iibb_jurisdiction;
    const iibbJurisdiction =
      typeof iibbJurisdictionRaw === "string" && iibbJurisdictionRaw.trim()
        ? iibbJurisdictionRaw
        : undefined;

    return {
      isWithholdingAgent:
        Boolean(row.withholdingAgentIibb) ||
        Boolean(row.withholdingAgentGanancias),
      iibbRate,
      iibbJurisdiction,
      ivaRate,
      gananciasRate,
      gananciasMinAmount,
    };
  }

  private firstNumber(source: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = source[key];
      const parsed = this.toNumber(value);
      if (parsed !== 0 || value === 0 || value === "0") {
        return parsed;
      }
    }

    return 0;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Gets owner fiscal data for exemptions.
   */
  private async getOwnerFiscalData(ownerId: string): Promise<OwnerFiscalData> {
    const result = await AppDataSource.query(
      `SELECT 
                o.cuit,
                o.tax_category as "taxCategory",
                COALESCE(o.iibb_exempt, false) as "iibbExempt",
                COALESCE(o.iva_exempt, false) as "ivaExempt",
                COALESCE(o.ganancias_exempt, false) as "gananciasExempt"
             FROM owners o
             WHERE o.user_id = $1`,
      [ownerId],
    );

    if (result.length === 0) {
      // Default: no exemptions
      return {
        iibbExempt: false,
        ivaExempt: false,
        gananciasExempt: false,
      };
    }

    return result[0];
  }

  /**
   * Validates withholding configuration for a company.
   *
   * @param companyId - Company ID to validate.
   * @returns Validation result with any issues found.
   */
  async validateConfiguration(companyId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const config = await this.getCompanyConfig(companyId);
    const issues: string[] = [];

    if (!config.isWithholdingAgent) {
      return { valid: true, issues: [] };
    }

    if (config.iibbRate > 0 && !config.iibbJurisdiction) {
      issues.push("IIBB rate configured but jurisdiction not specified");
    }

    if (config.iibbRate > 10) {
      issues.push(`IIBB rate (${config.iibbRate}%) seems unusually high`);
    }

    if (config.gananciasRate > 0 && config.gananciasMinAmount === 0) {
      issues.push("Ganancias rate configured but minimum amount not set");
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
