import { type ChangeRecord, ChangeRecordFieldsSchema } from "./types";

/**
 * The change record as pretty JSON, without the internal `schema` field.
 * This is what goes into the PR body and into .changes/<pr>.json.
 */
export function recordToJson(record: ChangeRecord): string {
  const { schema: _version, ...fields } = record;
  return JSON.stringify(ChangeRecordFieldsSchema.parse(fields), null, 2);
}
