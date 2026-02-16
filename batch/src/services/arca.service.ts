import * as fs from "node:fs";
import * as soap from "soap";
import * as QRCode from "qrcode";
import * as forge from "node-forge";
import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";

/**
 * ARCA/AFIP endpoints configuration.
 */
interface ArcaEndpoints {
  wsaa: string;
  wsfev1: string;
}

/**
 * Cached authentication token.
 */
interface AuthToken {
  token: string;
  sign: string;
  expiresAt: Date;
}

/**
 * Company ARCA configuration.
 */
interface ArcaConfig {
  cuit: string;
  certificatePath: string;
  privateKeyPath: string;
  puntoVenta: number;
  lastInvoiceNumber: number;
  environment: "sandbox" | "production";
}

/**
 * Invoice data for ARCA emission.
 */
export interface ArcaInvoiceData {
  invoiceId: string;
  tipoComprobante: number;
  puntoVenta: number;
  conceptoIncluido: number;
  docTipo: number;
  docNro: string;
  importeGravado: number;
  importeNoGravado: number;
  importeExento: number;
  importeIva: number;
  importeTotal: number;
  fechaComprobante: string;
  fechaServicioDesde?: string;
  fechaServicioHasta?: string;
  fechaVencimientoPago?: string;
}

/**
 * ARCA emission result.
 */
export interface ArcaEmissionResult {
  success: boolean;
  cae?: string;
  caeVencimiento?: string;
  numeroComprobante?: number;
  qrData?: string;
  error?: string;
  errorDetails?: string[];
}

/**
 * ARCA invoice types mapping.
 */
export const ARCA_TIPO_COMPROBANTE = {
  FACTURA_A: 1,
  FACTURA_B: 6,
  FACTURA_C: 11,
  NOTA_CREDITO_A: 3,
  NOTA_CREDITO_B: 8,
  NOTA_CREDITO_C: 13,
  RECIBO_A: 4,
  RECIBO_B: 9,
  RECIBO_C: 15,
} as const;

/**
 * Document types for ARCA.
 */
export const ARCA_DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

/**
 * Service for ARCA (ex AFIP) electronic invoicing.
 * Handles authentication via WSAA and invoice emission via WSFEV1.
 */
export class ArcaService {
  private readonly endpoints: ArcaEndpoints;
  private readonly authTokenCache: Map<string, AuthToken> = new Map();

  /** WSAA service name for factura electronica. */
  private static readonly WSAA_SERVICE = "wsfe";

  /** Token lifetime in hours (AFIP uses 12 hours). */
  private static readonly TOKEN_LIFETIME_HOURS = 12;

  /**
   * Creates an instance of ArcaService.
   *
   * @param environment - ARCA environment (sandbox or production).
   */
  constructor(environment: "sandbox" | "production" = "sandbox") {
    this.endpoints = this.getEndpoints(environment);
  }

  /**
   * Gets the appropriate endpoints for the environment.
   */
  private getEndpoints(environment: "sandbox" | "production"): ArcaEndpoints {
    if (environment === "production") {
      return {
        wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL",
        wsfev1: "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL",
      };
    }
    return {
      wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL",
      wsfev1: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL",
    };
  }

  /**
   * Emits an electronic invoice through ARCA.
   *
   * @param companyId - Company ID.
   * @param invoiceData - Invoice data.
   * @returns Emission result.
   */
  async emitInvoice(
    companyId: string,
    invoiceData: ArcaInvoiceData,
  ): Promise<ArcaEmissionResult> {
    logger.info("Starting ARCA invoice emission", {
      companyId,
      invoiceId: invoiceData.invoiceId,
    });

    try {
      // Get company ARCA config
      const config = await this.getCompanyConfig(companyId);
      if (!config) {
        return {
          success: false,
          error: "Company not configured for ARCA",
        };
      }

      // Get or refresh auth token
      const auth = await this.getAuthToken(config);
      if (!auth) {
        return {
          success: false,
          error: "Failed to authenticate with ARCA",
        };
      }

      // Get next invoice number
      const nextNumber = await this.getNextInvoiceNumber(
        config,
        auth,
        invoiceData.tipoComprobante,
      );

      // Build invoice request
      const request = this.buildFECAERequest(
        config,
        auth,
        invoiceData,
        nextNumber,
      );

      // Call WSFEV1
      const result = await this.callFECAESolicitar(request);

      if (result.success && result.cae) {
        // Update company last invoice number
        await this.updateLastInvoiceNumber(companyId, nextNumber);

        // Generate QR code
        result.qrData = await this.generateQrData(
          config.cuit,
          invoiceData,
          result.cae,
          nextNumber,
        );

        // Update invoice with CAE
        await this.updateInvoiceWithCae(
          invoiceData.invoiceId,
          result.cae,
          result.caeVencimiento,
          invoiceData.tipoComprobante,
          invoiceData.puntoVenta,
          nextNumber,
          result.qrData,
        );
      }

      return result;
    } catch (error) {
      logger.error("ARCA emission failed", {
        companyId,
        invoiceId: invoiceData.invoiceId,
        error: error instanceof Error ? error.message : error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Gets company ARCA configuration.
   */
  private async getCompanyConfig(
    companyId: string,
  ): Promise<ArcaConfig | null> {
    const result = await AppDataSource.query(
      `SELECT 
                arca_cuit as cuit,
                arca_certificate_path as "certificatePath",
                arca_private_key_path as "privateKeyPath",
                arca_punto_venta as "puntoVenta",
                arca_last_invoice_number as "lastInvoiceNumber",
                arca_environment as environment
             FROM companies 
             WHERE id = $1 AND arca_cuit IS NOT NULL`,
      [companyId],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      cuit: result[0].cuit,
      certificatePath: result[0].certificatePath,
      privateKeyPath: result[0].privateKeyPath,
      puntoVenta: result[0].puntoVenta || 1,
      lastInvoiceNumber: result[0].lastInvoiceNumber || 0,
      environment: result[0].environment || "sandbox",
    };
  }

  /**
   * Gets or refreshes authentication token via WSAA.
   */
  private async getAuthToken(
    config: ArcaConfig,
  ): Promise<{ token: string; sign: string } | null> {
    const cacheKey = config.cuit;
    const cached = this.authTokenCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      return { token: cached.token, sign: cached.sign };
    }

    try {
      const tra = this.buildLoginTicketRequest();
      const cms = await this.signTra(tra, config);
      const response = await this.callWsaaLogin(cms);

      if (response) {
        const expiresAt = new Date();
        expiresAt.setHours(
          expiresAt.getHours() + ArcaService.TOKEN_LIFETIME_HOURS - 1,
        );

        this.authTokenCache.set(cacheKey, {
          token: response.token,
          sign: response.sign,
          expiresAt,
        });

        return response;
      }
    } catch (error) {
      logger.error("WSAA authentication failed", {
        cuit: config.cuit,
        error: error instanceof Error ? error.message : error,
      });
    }

    return null;
  }

  /**
   * Builds the TRA (Ticket de Requerimiento de Acceso) XML.
   */
  private buildLoginTicketRequest(): string {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 10 * 60 * 1000);
    const expirationTime = new Date(now.getTime() + 10 * 60 * 1000);

    const uniqueId = Math.floor(Date.now() / 1000);

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${generationTime.toISOString()}</generationTime>
    <expirationTime>${expirationTime.toISOString()}</expirationTime>
  </header>
  <service>${ArcaService.WSAA_SERVICE}</service>
</loginTicketRequest>`;
  }

  /**
   * Signs the TRA with the company's private key and certificate.
   * Creates a CMS (PKCS#7) signed message as required by AFIP WSAA.
   */
  private async signTra(tra: string, config: ArcaConfig): Promise<string> {
    try {
      // Read certificate and private key
      const certPem = fs.readFileSync(config.certificatePath, "utf8");
      const keyPem = fs.readFileSync(config.privateKeyPath, "utf8");

      // Parse certificate and private key with node-forge
      const cert = forge.pki.certificateFromPem(certPem);
      const privateKey = forge.pki.privateKeyFromPem(keyPem);

      // Create PKCS#7 signed data
      const p7 = forge.pkcs7.createSignedData();

      // Set the content to sign (the TRA XML)
      p7.content = forge.util.createBuffer(tra, "utf8");

      // Add the certificate
      p7.addCertificate(cert);

      // Add signer with SHA-256
      p7.addSigner({
        key: privateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data,
          },
          {
            type: forge.pki.oids.messageDigest,
            // value will be auto-populated at signing time
          },
          {
            type: forge.pki.oids.signingTime,
            value: new Date().toISOString(),
          },
        ],
      });

      // Sign the data
      p7.sign();

      // Convert to DER format and then to Base64
      const asn1 = p7.toAsn1();
      const der = forge.asn1.toDer(asn1);
      const cms = forge.util.encode64(der.getBytes());

      return cms;
    } catch (error) {
      logger.error("Failed to sign TRA", {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error(
        `Failed to sign TRA: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Calls WSAA LoginCms service.
   */
  private async callWsaaLogin(
    cms: string,
  ): Promise<{ token: string; sign: string } | null> {
    try {
      const client = await soap.createClientAsync(this.endpoints.wsaa);

      const result = await client.loginCmsAsync({ in0: cms });

      if (result?.[0]?.loginCmsReturn) {
        const xml = result[0].loginCmsReturn;
        const tokenMatch = xml.match(/<token>([^<]+)<\/token>/);
        const signMatch = xml.match(/<sign>([^<]+)<\/sign>/);

        if (tokenMatch && signMatch) {
          return {
            token: tokenMatch[1],
            sign: signMatch[1],
          };
        }
      }
    } catch (error) {
      logger.error("WSAA login call failed", {
        error: error instanceof Error ? error.message : error,
      });
    }

    return null;
  }

  /**
   * Gets the next invoice number from ARCA.
   */
  private async getNextInvoiceNumber(
    config: ArcaConfig,
    auth: { token: string; sign: string },
    tipoComprobante: number,
  ): Promise<number> {
    try {
      const client = await soap.createClientAsync(this.endpoints.wsfev1);

      const result = await client.FECompUltimoAutorizadoAsync({
        Auth: {
          Token: auth.token,
          Sign: auth.sign,
          Cuit: config.cuit.replaceAll(/-/g, ""),
        },
        PtoVta: config.puntoVenta,
        CbteTipo: tipoComprobante,
      });

      if (result?.[0]?.FECompUltimoAutorizadoResult?.CbteNro) {
        return result[0].FECompUltimoAutorizadoResult.CbteNro + 1;
      }
    } catch (error) {
      logger.warn("Could not get last invoice number from ARCA", {
        error: error instanceof Error ? error.message : error,
      });
    }

    return config.lastInvoiceNumber + 1;
  }

  /**
   * Builds the FECAESolicitar request.
   */
  private buildFECAERequest(
    config: ArcaConfig,
    auth: { token: string; sign: string },
    invoiceData: ArcaInvoiceData,
    numeroComprobante: number,
  ): Record<string, unknown> {
    return {
      Auth: {
        Token: auth.token,
        Sign: auth.sign,
        Cuit: config.cuit.replaceAll(/-/g, ""),
      },
      FeCAEReq: {
        FeCabReq: {
          CantReg: 1,
          PtoVta: config.puntoVenta,
          CbteTipo: invoiceData.tipoComprobante,
        },
        FeDetReq: {
          FECAEDetRequest: {
            Concepto: invoiceData.conceptoIncluido,
            DocTipo: invoiceData.docTipo,
            DocNro: invoiceData.docNro.replaceAll(/-/g, ""),
            CbteDesde: numeroComprobante,
            CbteHasta: numeroComprobante,
            CbteFch: invoiceData.fechaComprobante,
            ImpTotal: invoiceData.importeTotal,
            ImpTotConc: invoiceData.importeNoGravado,
            ImpNeto: invoiceData.importeGravado,
            ImpOpEx: invoiceData.importeExento,
            ImpIVA: invoiceData.importeIva,
            ImpTrib: 0,
            FchServDesde: invoiceData.fechaServicioDesde || "",
            FchServHasta: invoiceData.fechaServicioHasta || "",
            FchVtoPago: invoiceData.fechaVencimientoPago || "",
            MonId: "PES",
            MonCotiz: 1,
          },
        },
      },
    };
  }

  /**
   * Calls WSFEV1 FECAESolicitar.
   */
  private async callFECAESolicitar(
    request: Record<string, unknown>,
  ): Promise<ArcaEmissionResult> {
    try {
      const client = await soap.createClientAsync(this.endpoints.wsfev1);

      const result = await client.FECAESolicitarAsync(request);

      const response = result?.[0]?.FECAESolicitarResult;

      if (response?.FeCabResp?.Resultado === "A") {
        const detalle = response.FeDetResp?.FECAEDetResponse?.[0];

        return {
          success: true,
          cae: detalle?.CAE,
          caeVencimiento: detalle?.CAEFchVto,
          numeroComprobante: detalle?.CbteDesde,
        };
      }

      const errors: string[] = [];
      if (response?.Errors?.Err) {
        const errArr = Array.isArray(response.Errors.Err)
          ? response.Errors.Err
          : [response.Errors.Err];
        for (const err of errArr) {
          errors.push(`${err.Code}: ${err.Msg}`);
        }
      }

      return {
        success: false,
        error: "ARCA rejected the invoice",
        errorDetails: errors,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "SOAP call failed",
      };
    }
  }

  /**
   * Generates QR code data for the invoice.
   */
  private async generateQrData(
    cuit: string,
    invoiceData: ArcaInvoiceData,
    cae: string,
    numero: number,
  ): Promise<string> {
    const qrPayload = {
      ver: 1,
      fecha: invoiceData.fechaComprobante,
      cuit: cuit.replaceAll(/-/g, ""),
      ptoVta: invoiceData.puntoVenta,
      tipoCmp: invoiceData.tipoComprobante,
      nroCmp: numero,
      importe: invoiceData.importeTotal,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: invoiceData.docTipo,
      nroDocRec: invoiceData.docNro.replaceAll(/-/g, ""),
      tipoCodAut: "E",
      codAut: cae,
    };

    const jsonStr = JSON.stringify(qrPayload);
    const base64 = Buffer.from(jsonStr).toString("base64");
    const url = `https://www.afip.gob.ar/fe/qr/?p=${base64}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(url);
      return qrDataUrl;
    } catch {
      return url;
    }
  }

  /**
   * Updates company's last invoice number.
   */
  private async updateLastInvoiceNumber(
    companyId: string,
    number: number,
  ): Promise<void> {
    await AppDataSource.query(
      `UPDATE companies 
             SET arca_last_invoice_number = $2, updated_at = NOW()
             WHERE id = $1`,
      [companyId, number],
    );
  }

  /**
   * Updates invoice with CAE information.
   */
  private async updateInvoiceWithCae(
    invoiceId: string,
    cae: string,
    caeVencimiento: string | undefined,
    tipoComprobante: number,
    puntoVenta: number,
    numero: number,
    qrData: string,
  ): Promise<void> {
    const tipoMap: Record<number, string> = {
      1: "factura_a",
      6: "factura_b",
      11: "factura_c",
      3: "nota_credito_a",
      8: "nota_credito_b",
      13: "nota_credito_c",
    };

    await AppDataSource.query(
      `UPDATE invoices 
             SET arca_cae = $2,
                 arca_cae_expiration = $3,
                 arca_tipo_comprobante = $4,
                 arca_punto_venta = $5,
                 arca_numero_comprobante = $6,
                 arca_qr_data = $7,
                 updated_at = NOW()
             WHERE id = $1`,
      [
        invoiceId,
        cae,
        caeVencimiento,
        tipoMap[tipoComprobante] || "factura_b",
        puntoVenta,
        numero,
        qrData,
      ],
    );

    logger.info("Invoice updated with CAE", {
      invoiceId,
      cae,
      numero,
    });
  }
}
