// WhatsApp supports simple emphasis, paragraphs and lists, not web Markdown
// tables. Format only the outgoing message; conversation history stays intact.
export function formatWhatsappAssistantText(value: string): string {
  const lines = value.trim().split('\n');
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.trim().startsWith('|') &&
      /^\s*\|?[\s:|-]+\|\s*$/.test(lines[index + 1] ?? '')
    ) {
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim());
      const headers = cells(line);
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        output.push(
          '- ' +
            cells(lines[index])
              .map((cell, position) => `${headers[position] ?? ''}: ${cell}`)
              .join(' · '),
        );
        index += 1;
      }
      index -= 1;
      continue;
    }
    output.push(line.replace(/^\s{0,3}#{1,6}\s+/, ''));
  }
  return output
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)');
}
