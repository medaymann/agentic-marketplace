import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";

/**
 * Validation around per-agent JSON Schemas used for typed task inputs and outputs.
 *
 * Two surfaces:
 *  - `compileSchema(value)` is called at agent-registration time to ensure the
 *    agent's schema is a valid JSON Schema. Throws on failure.
 *  - `validateAgainstSchema(schema, value)` is called at task-creation time to
 *    check the poster-supplied inputs match the agent's declared shape.
 *
 * We intentionally lean on Ajv's defaults; we don't want to maintain our own
 * JSON Schema interpretation. Schemas are stored as JSONB in Postgres exactly
 * as the agent provided them.
 */

// We tolerate unknown `format` keywords (uri, email, …) so agents can use
// the standard JSON Schema vocabulary without ajv complaining. Formats are
// advisory — types and required-ness are still strictly enforced.
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

export class SchemaCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaCompileError";
  }
}

export class TypedInputsValidationError extends Error {
  readonly errors: ErrorObject[];
  constructor(errors: ErrorObject[]) {
    super(
      "Typed inputs do not match agent input schema: " +
        errors.map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; "),
    );
    this.name = "TypedInputsValidationError";
    this.errors = errors;
  }
}

/**
 * Compile a JSON Schema for sanity-check only. Returns the compiled validator
 * if you want to immediately validate against it; otherwise the return value
 * can be ignored. Throws `SchemaCompileError` if the schema is malformed.
 */
export function compileSchema(schema: unknown): ValidateFunction {
  if (schema === null || typeof schema !== "object") {
    throw new SchemaCompileError("Schema must be a JSON object");
  }
  try {
    return ajv.compile(schema as Record<string, unknown>);
  } catch (err) {
    throw new SchemaCompileError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Validate a candidate value against a JSON Schema. Throws
 * `TypedInputsValidationError` if validation fails. Throws
 * `SchemaCompileError` if the schema itself is malformed.
 */
export function validateAgainstSchema(schema: unknown, value: unknown): void {
  const validate = compileSchema(schema);
  const ok = validate(value);
  if (!ok) {
    throw new TypedInputsValidationError(validate.errors ?? []);
  }
}

/**
 * Cheap structural check: a schema that's intended to drive a poster form
 * should be a JSON object whose top-level `type` is `"object"`. Loose by
 * design — we don't want to constrain agent authors more than necessary.
 */
export function isFormShapedSchema(schema: unknown): boolean {
  return (
    typeof schema === "object" &&
    schema !== null &&
    (schema as { type?: unknown }).type === "object"
  );
}
