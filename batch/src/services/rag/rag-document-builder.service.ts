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
    return source.sourceType === "property"
      ? [this.buildProperty(source)]
      : this.buildDocument(source);
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
      optionalLine("Estado operativo", data.operationState),
      optionalLine("Estado", data.status),
      address ? `Ubicación: ${address}` : null,
      numberLine("Superficie total m²", data.totalArea),
      numberLine("Superficie cubierta m²", data.builtArea),
      numberLine("Año de construcción", data.yearBuilt),
      numberLine("Unidades", data.totalUnits),
      numberLine("Ocupantes máximos", data.maxOccupants),
      `Mascotas: ${booleanLabel(data.allowsPets, "permitidas", "no permitidas")}`,
      amenities.length ? `Comodidades: ${amenities.join("; ")}` : null,
      features.length ? `Características: ${features.join("; ")}` : null,
      guaranteeTypes.length
        ? `Garantías aceptadas: ${guaranteeTypes.join("; ")}`
        : null,
      optionalLine("Descripción", data.description),
      optionalLine("Notas", data.notes),
      `Actualizado: ${source.updatedAt.toISOString()}`,
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
        optionalLine("Estado", data.status),
        optionalLine("Entidad relacionada", data.relatedEntityType),
        data.relatedEntityId
          ? `Entidad relacionada ID: ${stringValue(data.relatedEntityId)}`
          : null,
        `Fragmento: ${chunkIndex + 1} de ${pieces.length}`,
        piece,
        `Actualizado: ${source.updatedAt.toISOString()}`,
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
