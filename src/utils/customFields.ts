import { z } from "zod";

/** MCP-friendly shape used by agents. */
export const customFieldMcpInputSchema = z.object({
  fieldId: z.number().optional().describe("Custom field ID (e.g. 395 for MCP Tool)."),
  fieldName: z
    .string()
    .optional()
    .describe('Custom field display name (e.g. "MCP Tool", "PM Priority for CC & IC").'),
  value: z.string().describe("Value to write into the custom field."),
});

/**
 * Mantis REST shape agents often paste by mistake:
 * { field: { id, name }, value }
 */
export const customFieldRestInputSchema = z.object({
  field: z.object({
    id: z.number().optional(),
    name: z.string().optional(),
  }),
  value: z.string().describe("Value to write into the custom field."),
});

export const customFieldInputSchema = z.union([
  customFieldMcpInputSchema,
  customFieldRestInputSchema,
]);

export type CustomFieldMcpInput = z.infer<typeof customFieldMcpInputSchema>;
export type CustomFieldInput = CustomFieldMcpInput;

const customFieldsArrayDescription =
  "Custom fields to set. Accepts MCP shape [{ fieldId|fieldName, value }] " +
  'or Mantis REST shape [{ field: { id|name }, value }]. ' +
  'Example: [{ "fieldName": "MCP Tool", "value": "user-blender" }].';

export const customFieldsParamSchema = z
  .array(customFieldInputSchema)
  .optional()
  .describe(customFieldsArrayDescription);

/** Alias of customFields — same array, snake_case key matching Mantis REST. */
export const customFieldsSnakeParamSchema = z
  .array(customFieldInputSchema)
  .optional()
  .describe(
    "Alias of customFields (same meaning). Prefer either key; both are accepted. " +
      customFieldsArrayDescription
  );

export function normalizeCustomFieldEntry(
  entry: z.infer<typeof customFieldInputSchema>,
  index: number
): CustomFieldMcpInput {
  if ("field" in entry) {
    const fieldId = entry.field.id;
    const fieldName = entry.field.name?.trim();
    if (fieldId === undefined && !fieldName) {
      throw new Error(
        `custom_fields[${index}] requires field.id or field.name (or use fieldId / fieldName).`
      );
    }
    return {
      fieldId,
      fieldName: fieldName || undefined,
      value: entry.value,
    };
  }

  const fieldName = entry.fieldName?.trim();
  if (entry.fieldId === undefined && !fieldName) {
    throw new Error(`customFields[${index}] requires fieldId or fieldName.`);
  }
  return {
    fieldId: entry.fieldId,
    fieldName: fieldName || undefined,
    value: entry.value,
  };
}

/**
 * Resolve custom field list from either customFields or custom_fields.
 * If both are present, they are concatenated (customFields first).
 */
export function resolveCustomFieldsParam(params: {
  customFields?: z.infer<typeof customFieldInputSchema>[];
  custom_fields?: z.infer<typeof customFieldInputSchema>[];
}): CustomFieldMcpInput[] | undefined {
  const combined = [...(params.customFields ?? []), ...(params.custom_fields ?? [])];
  if (!combined.length) {
    return undefined;
  }
  return combined.map((entry, index) => normalizeCustomFieldEntry(entry, index));
}

export function buildCustomFieldsPayload(
  fields: CustomFieldMcpInput[]
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
  fields?: CustomFieldMcpInput[]
): void {
  if (!fields?.length) {
    return;
  }
  Object.assign(payload, buildCustomFieldsPayload(fields));
}
