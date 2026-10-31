import { createHash } from "node:crypto";

export const START_MARKER = "<!-- frontal:start";
export const END_MARKER = "<!-- frontal:end -->";

export interface MarkerBlock {
  description: string;
  hash: string;
  raw: string;
  recordYaml: string;
}

export function extractMarkerBlock(body: string): MarkerBlock | null {
  const startIdx = body.indexOf(START_MARKER);
  if (startIdx === -1) {
    return null;
  }
  const endIdx = body.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) {
    return null;
  }

  const raw = body.slice(startIdx, endIdx + END_MARKER.length);
  const inner = body.slice(startIdx + START_MARKER.length, endIdx).trim();

  const hashMatch = /hash=([a-f0-9]{64})/i.exec(inner);
  const hash = hashMatch ? hashMatch[1] : "";

  const yamlMatch = /```yaml\n([\s\S]*?)```/.exec(inner);
  const recordYaml = yamlMatch ? yamlMatch[1].trim() : "";

  const description = inner
    .replace(/hash=[a-f0-9]{64}/i, "")
    .replace(/```yaml[\s\S]*?```/g, "")
    .trim();

  return { description, hash, raw, recordYaml };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isEdited(body: string, storedHash: string): boolean {
  const block = extractMarkerBlock(body);
  if (!block) {
    return false;
  }
  if (!storedHash) {
    return false;
  }
  return block.hash !== storedHash;
}

export function hasRegenerateCheckbox(body: string): boolean {
  return /\[ \]\s*Regenerate description/i.test(body);
}

export function isTickmarked(body: string): boolean {
  return /\[x\]\s*Regenerate description/i.test(body);
}

export function renderMarkerBlock(
  description: string,
  recordYaml: string
): string {
  const inner = description.trim();
  const hash = hashContent(inner);
  const yamlBlock = recordYaml ? `\n\`\`\`yaml\n${recordYaml}\n\`\`\`\n` : "";
  return `${START_MARKER} hash=${hash} -->${yamlBlock}${inner ? `\n\n${inner}` : ""}\n${END_MARKER}`;
}

export function replaceOrInsertMarkerBlock(
  body: string,
  newBlock: string
): string {
  const startIdx = body.indexOf(START_MARKER);
  if (startIdx === -1) {
    return `${body.trim()}\n\n${newBlock}`;
  }
  const endIdx = body.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) {
    return `${body.slice(0, startIdx)}${newBlock}`;
  }
  return `${body.slice(0, startIdx)}${newBlock}${body.slice(endIdx + END_MARKER.length)}`;
}

export function appendRegenerateCheckbox(body: string): string {
  const checkbox = "- [ ] Regenerate description";
  if (hasRegenerateCheckbox(body)) {
    return body;
  }
  const startIdx = body.indexOf(START_MARKER);
  if (startIdx === -1) {
    return `${body.trim()}\n\n${checkbox}`;
  }
  const endIdx = body.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) {
    return `${body.trim()}\n\n${checkbox}`;
  }
  return `${body.slice(0, endIdx)}\n\n${checkbox}\n${body.slice(endIdx)}`;
}
