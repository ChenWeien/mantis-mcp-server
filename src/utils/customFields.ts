import { z } from "zod";

export const customFieldInputSchema = z.object({
  fieldId: z.number().optional().describe("Custom field ID (e.g. 395 for MCP Tool)."),
  fieldName: z
    .string()
    .optional()
    .describe('Custom field display name (e.g. "MCP Tool", "PM Priority for CC & IC").'),
  value: z.string().describe("Value to write into the custom field."),
});

export type CustomFieldInput = z.infer<typeof customFieldInputSchema>;

export const customFieldsParamSchema = customFieldInputSchema
  .array()
  .optional()
  .describe(
    "Custom fields to set. Each item must include fieldId or fieldName (or both). " +
      'Example: [{ "fieldName": "MCP Tool", "value": "user-blender" }].'
  );

export function buildCustomFieldsPayload(
  fields: CustomFieldInput[]
): { custom_fields: Array<{ field: { id?: number; name?: string }; value: string }> } {
  if (!fields.length) {
    throw new Error("customFields must include at least one entry.");
  }

  const custom_fields = fields.map((entry, index) => {
    const fieldName = entry.fieldName?.trim();
    if (entry.fieldId === undefined && !fieldName) {
      throw new Error(`customFields[${index}] requires fieldId or fieldName.`);
    }

    const field: { id?: number; name?: string } = {};
    if (entry.fieldId !== undefined) {
      field.id = entry.fieldId;
    }
    if (fieldName) {
      field.name = fieldName;
    }

    return { field, value: entry.value };
  });

  return { custom_fields };
}

export function mergeCustomFieldsIntoPayload(
  payload: Record<string, unknown>,
  fields?: CustomFieldInput[]
): void {
  if (!fields?.length) {
    return;
  }
  Object.assign(payload, buildCustomFieldsPayload(fields));
}
