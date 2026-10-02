import type { CreateInterestedProfileInput } from "@/types/interested";

type CsvCursor = {
  rows: string[][];
  row: string[];
  field: string;
  quoted: boolean;
};
function appendField(cursor: CsvCursor) {
  cursor.row.push(cursor.field.trim());
  cursor.field = "";
}
function appendRow(cursor: CsvCursor) {
  appendField(cursor);
  if (cursor.row.some(Boolean)) cursor.rows.push(cursor.row);
  cursor.row = [];
}
function consumeCharacter(
  cursor: CsvCursor,
  text: string,
  index: number,
): number {
  const character = text[index];
  if (character === '"') {
    if (cursor.quoted && text[index + 1] === '"') {
      cursor.field += '"';
      return index + 1;
    }
    cursor.quoted = !cursor.quoted;
    return index;
  }
  if (cursor.quoted) {
    cursor.field += character;
    return index;
  }
  switch (character) {
    case ",":
      appendField(cursor);
      break;
    case "\r":
    case "\n":
      appendRow(cursor);
      if (character === "\r" && text[index + 1] === "\n") return index + 1;
      break;
    default:
      cursor.field += character;
  }
  return index;
}
function parseRecords(source: string): string[][] {
  const cursor: CsvCursor = { rows: [], row: [], field: "", quoted: false };
  const text = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1)
    index = consumeCharacter(cursor, text, index);
  if (cursor.quoted) throw new Error("Unclosed CSV quote");
  appendRow(cursor);
  return cursor.rows;
}
function contactFromRecord(
  columns: string[],
  values: string[],
): CreateInterestedProfileInput {
  if (values.length !== columns.length) throw new Error("Invalid CSV row");
  const data = Object.fromEntries(
    columns.map((column, index) => [column, values[index]]),
  );
  if (!data.phone) throw new Error("A phone number is required");
  if (data.operation && !["rent", "sale"].includes(data.operation))
    throw new Error("Invalid operation");
  if (data.consentContact && !["true", "false"].includes(data.consentContact))
    throw new Error("Consent must be explicit");
  return {
    phone: data.phone,
    ...(data.firstName ? { firstName: data.firstName } : {}),
    ...(data.lastName ? { lastName: data.lastName } : {}),
    ...(data.email ? { email: data.email } : {}),
    ...(data.operation ? { operation: data.operation as "rent" | "sale" } : {}),
    consentContact: data.consentContact === "true",
  };
}
/** Quoted commas, escaped quotes and multiline fields preserve the submitted contact data. */
export function parseInterestedCsv(
  source: string,
): CreateInterestedProfileInput[] {
  const rows = parseRecords(source),
    columns = rows.shift() ?? [];
  const allowed = new Set([
    "firstName",
    "lastName",
    "phone",
    "email",
    "operation",
    "consentContact",
  ]);
  if (
    !columns.includes("phone") ||
    columns.some((column) => !allowed.has(column)) ||
    new Set(columns).size !== columns.length
  )
    throw new Error("Invalid CSV header");
  if (rows.length < 1 || rows.length > 200)
    throw new Error("Expected 1 to 200 contacts");
  return rows.map((values) => contactFromRecord(columns, values));
}
export type PipelineStage = { id: string; label: string };
export function parsePipelineStages(source: string): PipelineStage[] {
  const stages = source
    .trim()
    .split("\n")
    .map((line) => {
      const [id, ...label] = line.split("|");
      return { id: id.trim(), label: label.join("|").trim() };
    });
  if (
    stages.length < 1 ||
    stages.length > 12 ||
    new Set(stages.map((stage) => stage.id)).size !== stages.length ||
    stages.some(
      (stage) =>
        !/^[a-z][a-z0-9_-]{0,39}$/.test(stage.id) ||
        !stage.label ||
        stage.label.length > 80,
    )
  )
    throw new Error("Invalid pipeline stages");
  return stages;
}
