import { createHash } from "node:crypto";
import {
  END_MARKER,
  MARKER_HASH_PATTERN,
  MARKER_HEADER_PATTERN,
  MARKER_JSON_BLOCK,
  MARKER_JSON_PATTERN,
  REGENERATE_CHECKBOX,
  REGENERATE_CHECKED,
  REGENERATE_UNCHECKED,
  START_MARKER,
} from "./constants";
import type { MarkerBlock } from "./types";

/** Find the block the tool wrote into a PR body, or null when there is none. */
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

  const hash = MARKER_HASH_PATTERN.exec(inner)?.[1] ?? "";
  const recordJson = MARKER_JSON_PATTERN.exec(inner)?.[1].trim() ?? "";

  // Drop the start marker's "hash=… -->" tail and the JSON record block.
  const description = inner
    .replace(MARKER_HEADER_PATTERN, "")
    .replace(MARKER_JSON_BLOCK, "")
    .trim();

  return { description, hash, raw, recordJson };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * True when the block's description no longer matches the hash stored with it.
 * `storedHash` is the hash the block was written with.
 */
export function isEdited(body: string, storedHash: string): boolean {
  const block = extractMarkerBlock(body);
  if (!(block && storedHash)) {
    return false;
  }
  return hashContent(block.description) !== storedHash;
}

export function hasRegenerateCheckbox(body: string): boolean {
  return REGENERATE_UNCHECKED.test(body);
}

export function isTickmarked(body: string): boolean {
  return REGENERATE_CHECKED.test(body);
}

export function renderMarkerBlock(
  description: string,
  recordJson: string
): string {
  const inner = description.trim();
  const hash = hashContent(inner);
  const jsonBlock = recordJson ? `\n\`\`\`json\n${recordJson}\n\`\`\`\n` : "";
  return `${START_MARKER} hash=${hash} -->${jsonBlock}${inner ? `\n\n${inner}` : ""}\n${END_MARKER}`;
}

/** Replace the existing block, or add the new one at the end of the body. */
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

/** Add the regenerate checkbox inside the block, once. */
export function appendRegenerateCheckbox(body: string): string {
  if (hasRegenerateCheckbox(body)) {
    return body;
  }
  const startIdx = body.indexOf(START_MARKER);
  const endIdx = startIdx === -1 ? -1 : body.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) {
    return `${body.trim()}\n\n${REGENERATE_CHECKBOX}`;
  }
  return `${body.slice(0, endIdx)}\n\n${REGENERATE_CHECKBOX}\n${body.slice(endIdx)}`;
}
