import { parseInterestedCsv, parsePipelineStages } from "./interested-import";
it("preserves quoted fields, escaped quotes, multiline names and explicit consent", () => {
  expect(
    parseInterestedCsv(
      '\uFEFFfirstName,lastName,phone,email,operation,consentContact\r\n"Ana, María","""López""\nPaz",123,a@example.com,sale,true\r\n',
    ),
  ).toEqual([
    {
      firstName: "Ana, María",
      lastName: '"López"\nPaz',
      phone: "123",
      email: "a@example.com",
      operation: "sale",
      consentContact: true,
    },
  ]);
});
it("never invents consent when it is omitted", () =>
  expect(parseInterestedCsv("phone\n123")).toEqual([
    { phone: "123", consentContact: false },
  ]));
it.each([
  'phone\n"123',
  "firstName\nAna",
  "phone,phone\n1,2",
  "phone,unknown\n1,x",
  "phone,email\n123",
  "phone\n",
  "phone\n" + Array.from({ length: 201 }, (_, i) => i).join("\n"),
  "phone,operation\n123,invalid",
  "phone,consentContact\n123,yes",
  "phone,email\n,a@example.com",
])("rejects malformed or unsafe contact input %s", (source) =>
  expect(() => parseInterestedCsv(source)).toThrow(),
);
it("parses ordered pipeline stages without changing identifiers", () =>
  expect(parsePipelineStages("contacted|Contactado\nvisit|Visita")).toEqual([
    { id: "contacted", label: "Contactado" },
    { id: "visit", label: "Visita" },
  ]));
it.each([
  "x|",
  "a|A\na|B",
  "invalid id|A",
  Array.from({ length: 13 }, (_, i) => `stage${i}|A`).join("\n"),
  "a|" + "A".repeat(81),
])("rejects invalid pipeline %s", (source) =>
  expect(() => parsePipelineStages(source)).toThrow(),
);
