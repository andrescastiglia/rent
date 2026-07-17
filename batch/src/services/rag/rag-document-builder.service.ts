import { createHash } from "node:crypto";
import { parse } from "node-html-parser";
import { RagChunkDraft, RagSourceEntity } from "./rag-types";

const DOCUMENT_CHUNK_SIZE = 4_000;
const DOCUMENT_CHUNK_OVERLAP = 400;

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const optionalLine = (label: string, value: unknown): string | null => {
  const normalized = stringValue(value);
  return normalized ? `${label}: ${normalized}` : null;
};

const numberLine = (label: string, value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? `${label}: ${number}` : null;
};

const booleanLabel = (value: unknown, yes: string, no: string): string =>
  value === true ? yes : no;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const normalizeText = (value: string): string => {
  const document = parse(value);
  document
    .querySelectorAll("script, style, noscript")
    .forEach((element) => element.remove());

  return document.structuredText
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const sha256 = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex");

export class RagDocumentBuilderService {
  build(source: RagSourceEntity): RagChunkDraft[] {
    switch (source.sourceType) {
      case "property":
        return [this.buildProperty(source)];
      case "document":
        return this.buildDocument(source);
      case "lease":
        return [this.buildLease(source)];
      case "invoice":
        return [this.buildInvoicePayment(source)];
      case "owner":
        return [this.buildOwnerPortfolio(source)];
      case "tenant_account":
        return [this.buildTenantAccount(source)];
      case "interested":
        return [this.buildInterestedProfile(source)];
      case "owner_activity":
      case "tenant_activity":
      case "interested_activity":
        return [this.buildActivity(source)];
    }
  }

  private singleChunk(
    source: RagSourceEntity,
    entityType: RagChunkDraft["entityType"],
    lines: Array<string | null>,
    metadata: Record<string, unknown>,
  ): RagChunkDraft {
    const content = lines
      .filter((line): line is string => Boolean(line))
      .join("\n");
    return {
      companyId: source.companyId,
      entityType,
      entityId: source.id,
      chunkKey: "summary",
      chunkIndex: 0,
      content,
      metadata: { sourceType: source.sourceType, ...metadata },
      contentHash: sha256(content),
      sourceUpdatedAt: source.updatedAt,
    };
  }

  private buildProperty(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    const operations = stringArray(data.operations);
    const amenities = stringArray(data.amenities);
    const guaranteeTypes = stringArray(data.acceptedGuaranteeTypes);
    const features = Array.isArray(data.features)
      ? data.features
          .filter(
            (feature): feature is Record<string, unknown> =>
              typeof feature === "object" && feature !== null,
          )
          .map((feature) =>
            [
              stringValue(feature.category),
              stringValue(feature.name),
              stringValue(feature.value),
            ]
              .filter(Boolean)
              .join(": "),
          )
          .filter(Boolean)
      : [];

    const address = [
      data.addressStreet,
      data.addressNumber,
      data.addressFloor ? `piso ${stringValue(data.addressFloor)}` : "",
      data.addressApartment
        ? `departamento ${stringValue(data.addressApartment)}`
        : "",
      data.addressCity,
      data.addressState,
      data.addressCountry,
    ]
      .map(stringValue)
      .filter(Boolean)
      .join(", ");

    const lines = [
      "Tipo: property_summary",
      `Propiedad ID: ${source.id}`,
      optionalLine("Nombre", data.name),
      optionalLine("Tipo de propiedad", data.propertyType),
      operations.length ? `Operaciones: ${operations.join("; ")}` : null,
      address ? `Ubicación: ${address}` : null,
      numberLine("Superficie total m²", data.totalArea),
      numberLine("Superficie cubierta m²", data.builtArea),
      `Mascotas: ${booleanLabel(data.allowsPets, "permitidas", "no permitidas")}`,
      amenities.length ? `Comodidades: ${amenities.join("; ")}` : null,
      features.length ? `Características: ${features.join("; ")}` : null,
      guaranteeTypes.length
        ? `Garantías aceptadas: ${guaranteeTypes.join("; ")}`
        : null,
      optionalLine("Descripción", data.description),
      optionalLine("Notas", data.notes),
    ].filter((line): line is string => Boolean(line));
    const content = lines.join("\n");

    return {
      companyId: source.companyId,
      entityType: "property_summary",
      entityId: source.id,
      chunkKey: "summary",
      chunkIndex: 0,
      content,
      metadata: {
        sourceType: "property",
        propertyType: data.propertyType,
        status: data.status,
        operationState: data.operationState,
        operations,
        city: data.addressCity,
      },
      contentHash: sha256(content),
      sourceUpdatedAt: source.updatedAt,
    };
  }

  private buildDocument(source: RagSourceEntity): RagChunkDraft[] {
    const data = source.data;
    const metadata =
      typeof data.metadata === "object" && data.metadata !== null
        ? (data.metadata as Record<string, unknown>)
        : {};
    const semanticText = [
      stringValue(data.description),
      stringValue(data.leaseContractText),
      stringValue(metadata.extractedText),
      stringValue(metadata.content),
      stringValue(metadata.text),
    ]
      .filter(Boolean)
      .join("\n\n");
    const normalizedText = normalizeText(semanticText);
    const pieces = this.splitText(normalizedText || stringValue(data.name));

    return pieces.map((piece, chunkIndex) => {
      const lines = [
        "Tipo: document_chunk",
        `Documento ID: ${source.id}`,
        optionalLine("Nombre", data.name),
        optionalLine("Tipo de documento", data.documentType),
        optionalLine("Entidad relacionada", data.relatedEntityType),
        data.relatedEntityId
          ? `Entidad relacionada ID: ${stringValue(data.relatedEntityId)}`
          : null,
        `Fragmento: ${chunkIndex + 1} de ${pieces.length}`,
        piece,
      ].filter((line): line is string => Boolean(line));
      const content = lines.join("\n");
      return {
        companyId: source.companyId,
        entityType: "document_chunk" as const,
        entityId: source.id,
        chunkKey: `content-${chunkIndex}`,
        chunkIndex,
        content,
        metadata: {
          sourceType: "document",
          documentType: data.documentType,
          status: data.status,
          relatedEntityType: data.relatedEntityType,
          relatedEntityId: data.relatedEntityId,
          tags: stringArray(data.tags),
        },
        contentHash: sha256(content),
        sourceUpdatedAt: source.updatedAt,
      };
    });
  }

  private buildLease(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    return this.singleChunk(
      source,
      "lease_summary",
      [
        "Tipo: lease_summary",
        `Contrato ID: ${source.id}`,
        optionalLine("Número", data.leaseNumber),
        optionalLine("Tipo", data.contractType),
        optionalLine("Propiedad", data.propertyName),
        optionalLine("Ciudad", data.propertyCity),
        optionalLine("Inquilino", data.tenantName),
        optionalLine("Propietario", data.ownerName),
        optionalLine("Frecuencia de pago", data.paymentFrequency),
        optionalLine("Términos", data.termsAndConditions),
        optionalLine("Cláusulas especiales", data.specialClauses),
        optionalLine("Notas", data.notes),
      ],
      {
        propertyId: data.propertyId,
        tenantId: data.tenantId,
        ownerId: data.ownerId,
        contractType: data.contractType,
      },
    );
  }

  private buildInvoicePayment(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    const payments = Array.isArray(data.payments)
      ? data.payments
          .filter(
            (payment): payment is Record<string, unknown> =>
              typeof payment === "object" && payment !== null,
          )
          .map((payment) =>
            [
              stringValue(payment.paymentNumber) || "sin número",
              stringValue(payment.method),
            ]
              .filter(Boolean)
              .join(" / "),
          )
      : [];
    return this.singleChunk(
      source,
      "invoice_payment_summary",
      [
        "Tipo: invoice_payment_summary",
        `Factura ID: ${source.id}`,
        optionalLine("Número", data.invoiceNumber),
        optionalLine("Contrato", data.leaseNumber),
        optionalLine("Propiedad", data.propertyName),
        optionalLine("Concepto", data.notes),
        payments.length
          ? `Pagos relacionados: ${payments.join("; ")}`
          : "Pagos relacionados: ninguno",
      ],
      {
        leaseId: data.leaseId,
        ownerId: data.ownerId,
        tenantId: data.tenantId,
        paymentIds: Array.isArray(data.payments)
          ? data.payments
              .map((item) =>
                typeof item === "object" && item !== null
                  ? (item as Record<string, unknown>).id
                  : undefined,
              )
              .filter(Boolean)
          : [],
      },
    );
  }

  private buildOwnerPortfolio(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    const properties = Array.isArray(data.properties)
      ? data.properties
          .filter(
            (property): property is Record<string, unknown> =>
              typeof property === "object" && property !== null,
          )
          .map((property) =>
            [
              stringValue(property.name),
              stringValue(property.propertyType),
              stringValue(property.city),
            ]
              .filter(Boolean)
              .join(" / "),
          )
          .filter(Boolean)
      : [];
    return this.singleChunk(
      source,
      "owner_portfolio_summary",
      [
        "Tipo: owner_portfolio_summary",
        `Propietario ID: ${source.id}`,
        optionalLine("Nombre", data.ownerName),
        properties.length
          ? `Propiedades: ${properties.join("; ")}`
          : "Propiedades: ninguna",
        optionalLine("Notas", data.notes),
      ],
      {
        userId: data.userId,
        propertyIds: Array.isArray(data.properties)
          ? data.properties
              .map((item) =>
                typeof item === "object" && item !== null
                  ? (item as Record<string, unknown>).id
                  : undefined,
              )
              .filter(Boolean)
          : [],
      },
    );
  }

  private buildTenantAccount(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    return this.singleChunk(
      source,
      "tenant_account_summary",
      [
        "Tipo: tenant_account_summary",
        `Cuenta de inquilino ID: ${source.id}`,
        optionalLine("Inquilino", data.tenantName),
        optionalLine("Contrato", data.leaseNumber),
        optionalLine("Propiedad", data.propertyName),
        optionalLine("Notas", data.notes),
      ],
      {
        tenantId: data.tenantId,
        tenantUserId: data.tenantUserId,
        leaseId: data.leaseId,
        propertyId: data.propertyId,
      },
    );
  }

  private buildInterestedProfile(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    const name = [data.firstName, data.lastName]
      .map(stringValue)
      .filter(Boolean)
      .join(" ");
    return this.singleChunk(
      source,
      "interested_profile_summary",
      [
        "Tipo: interested_profile_summary",
        `Interesado ID: ${source.id}`,
        name ? `Nombre: ${name}` : null,
        optionalLine("Operación", data.operation),
        optionalLine("Tipo de propiedad buscada", data.propertyTypePreference),
        optionalLine("Ciudad preferida", data.preferredCity),
        stringArray(data.preferredZones).length
          ? `Zonas preferidas: ${stringArray(data.preferredZones).join("; ")}`
          : null,
        stringArray(data.desiredFeatures).length
          ? `Características deseadas: ${stringArray(data.desiredFeatures).join("; ")}`
          : null,
        `Mascotas: ${booleanLabel(data.hasPets, "sí", "no")}`,
        stringArray(data.guaranteeTypes).length
          ? `Garantías: ${stringArray(data.guaranteeTypes).join("; ")}`
          : null,
        optionalLine("Notas de calificación", data.qualificationNotes),
      ],
      {
        status: data.status,
        assignedToUserId: data.assignedToUserId,
        operations: data.operations,
      },
    );
  }

  private buildActivity(source: RagSourceEntity): RagChunkDraft {
    const data = source.data;
    return this.singleChunk(
      source,
      "activity_chunk",
      [
        "Tipo: activity_chunk",
        `Actividad ID: ${source.id}`,
        optionalLine("Clase", source.sourceType),
        optionalLine("Tipo de actividad", data.type),
        optionalLine("Asunto", data.subject),
        optionalLine("Detalle", data.body),
      ],
      {
        activitySourceType: source.sourceType,
        subjectId: data.subjectId,
        propertyId: data.propertyId,
        createdByUserId: data.createdByUserId,
      },
    );
  }

  private splitText(text: string): string[] {
    if (text.length <= DOCUMENT_CHUNK_SIZE) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + DOCUMENT_CHUNK_SIZE);
      if (end < text.length) {
        const boundary = Math.max(
          text.lastIndexOf("\n", end),
          text.lastIndexOf(". ", end),
        );
        if (boundary > start + DOCUMENT_CHUNK_SIZE / 2) end = boundary + 1;
      }
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = Math.max(start + 1, end - DOCUMENT_CHUNK_OVERLAP);
    }
    return chunks.filter(Boolean);
  }
}
