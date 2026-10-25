/**
 * Shared utility functions for templates and placeholders across all media types
 * (text, image, video). `lib/text/utils.ts` re-exports this module.
 *
 * Placeholders use the `{{NAME}}` syntax where NAME consists of letters, digits
 * and underscores.
 */

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/** Placeholder name rule shared with the backend (`^[A-Za-z0-9_]{1,64}$`). */
export const PLACEHOLDER_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

const hasValue = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Extract variables from a template text that uses {{variable}} syntax
 * @param text Template text with {{variable}} placeholders
 * @returns Array of unique variable names, in order of first appearance
 */
export function extractVariables(text: string): string[] {
  const variables = new Set<string>();
  for (const match of (text || '').matchAll(VARIABLE_PATTERN)) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

/**
 * Fill a template with variable values. Every `{{key}}` for each key in `values`
 * is replaced literally (no regex or `$` replacement-pattern semantics), even
 * when the value is empty.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{{${key}}}`).join(value ?? '');
  }
  return result;
}

/**
 * Resolve the placeholders that have a non-empty value; placeholders without a
 * value are left untouched (`{{NAME}}`) so callers can detect them.
 */
export function resolvePrompt(text: string, values: Record<string, string>): string {
  return (text || '').replace(VARIABLE_PATTERN, (match, name: string) =>
    hasValue(values[name]) ? values[name] : match,
  );
}

/**
 * Check if a template has all required variables filled
 */
export function isTemplateFilled(template: string, values: Record<string, string>): boolean {
  return getUnfilledVariables(template, values).length === 0;
}

/**
 * Get unfilled variables from a template (missing, empty or whitespace-only values)
 */
export function getUnfilledVariables(template: string, values: Record<string, string>): string[] {
  return extractVariables(template).filter((variable) => !hasValue(values[variable]));
}

/** Only keep the values for the variables that occur in `text`. */
export function pickVariableValues(
  text: string,
  values: Record<string, string>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of extractVariables(text)) {
    if (typeof values[name] === 'string') {
      picked[name] = values[name];
    }
  }
  return picked;
}

/**
 * Resolve a prompt for sending. Returns an error message when placeholders are
 * still empty or the resolved prompt exceeds `maxLength`.
 */
export function preparePrompt(
  text: string,
  values: Record<string, string>,
  maxLength?: number,
): { prompt: string; error: string | null } {
  const unfilled = getUnfilledVariables(text, values);
  if (unfilled.length > 0) {
    const list = unfilled.map((name) => `{{${name}}}`).join(', ');
    return { prompt: text, error: `Please fill in the placeholder${unfilled.length > 1 ? 's' : ''} ${list}` };
  }

  const prompt = resolvePrompt(text, values);
  if (maxLength !== undefined && prompt.length > maxLength) {
    return {
      prompt,
      error: `The prompt with placeholders filled in is ${prompt.length} characters long (maximum ${maxLength}). Please shorten it or the placeholder values.`,
    };
  }

  return { prompt, error: null };
}
