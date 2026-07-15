import { RagDocumentBuilderService } from "./rag-document-builder.service";
import { RagSourceEntity } from "./rag-types";

describe("RagDocumentBuilderService", () => {
  const builder = new RagDocumentBuilderService();

  it("builds a deterministic property summary without operational secrets", () => {
    const source: RagSourceEntity = {
      id: "10000000-0000-0000-0000-000000000001",
      companyId: "20000000-0000-0000-0000-000000000001",
      updatedAt: new Date("2026-07-14T12:00:00.000Z"),
      sourceType: "property",
      data: {
        name: "Departamento Palermo",
        propertyType: "apartment",
        status: "active",
        operationState: "available",
        operations: ["rent"],
        addressCity: "Buenos Aires",
        allowsPets: true,
        amenities: ["balcón", "luminoso"],
        features: [{ category: "ambientes", name: "cantidad", value: "3" }],
        passwordHash: "must-not-leak",
      },
    };

    const first = builder.build(source);
    const second = builder.build(source);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      entityType: "property_summary",
      chunkKey: "summary",
      chunkIndex: 0,
    });
    expect(first[0].content).toContain("Mascotas: permitidas");
    expect(first[0].content).toContain("Comodidades: balcón; luminoso");
    expect(first[0].content).not.toContain("must-not-leak");
    expect(first[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("splits long document content into stable overlapping chunks", () => {
    const source: RagSourceEntity = {
      id: "30000000-0000-0000-0000-000000000001",
      companyId: "20000000-0000-0000-0000-000000000001",
      updatedAt: new Date("2026-07-14T12:00:00.000Z"),
      sourceType: "document",
      data: {
        name: "Contrato",
        documentType: "lease_contract",
        status: "approved",
        relatedEntityType: "lease",
        relatedEntityId: "40000000-0000-0000-0000-000000000001",
        leaseContractText: `<p>${"cláusula extensa. ".repeat(700)}</p>`,
      },
    };

    const chunks = builder.build(source);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks.every((chunk) => chunk.entityType === "document_chunk")).toBe(
      true,
    );
    expect(chunks[0].content).not.toContain("<p>");
    expect(
      new Set(chunks.map((chunk) => chunk.contentHash)).size,
    ).toBeGreaterThan(1);
  });

  it("parses malformed HTML without leaking executable element contents", () => {
    const source: RagSourceEntity = {
      id: "30000000-0000-0000-0000-000000000002",
      companyId: "20000000-0000-0000-0000-000000000001",
      updatedAt: new Date("2026-07-14T12:00:00.000Z"),
      sourceType: "document",
      data: {
        name: "Documento inseguro",
        leaseContractText:
          "<p>Texto seguro &amp; válido</p><script>alert('secreto')</script ><p>oculto por script mal cerrado</p>",
      },
    };

    const [chunk] = builder.build(source);

    expect(chunk.content).toContain("Texto seguro & válido");
    expect(chunk.content).not.toContain("alert");
    expect(chunk.content).not.toContain("oculto por script mal cerrado");
  });

  it("decodes each HTML entity exactly once", () => {
    const source: RagSourceEntity = {
      id: "30000000-0000-0000-0000-000000000003",
      companyId: "20000000-0000-0000-0000-000000000001",
      updatedAt: new Date("2026-07-14T12:00:00.000Z"),
      sourceType: "document",
      data: {
        name: "Entidades",
        leaseContractText: "<p>A &amp; B; literal: &amp;lt;script&amp;gt;</p>",
      },
    };

    const [chunk] = builder.build(source);

    expect(chunk.content).toContain("A & B; literal: &lt;script&gt;");
    expect(chunk.content).not.toContain("literal: <script>");
  });
});
