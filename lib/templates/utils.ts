/**
 * Shared utility functions for template management across all media types
 * Supports text, image, and video generation templates
 */

/**
 * Extract variables from a template text that uses {{variable}} syntax
 * @param text Template text with {{variable}} placeholders
 * @returns Array of unique variable names
 */
export function extractVariables(text: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

/**
 * Fill a template with variable values
 * @param template Template text with {{variable}} placeholders
 * @param values Object mapping variable names to their values
 * @returns Filled template text
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(values)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
}

/**
 * Check if a template has all required variables filled
 * @param template Template text
 * @param values Variable values
 * @returns true if all variables are filled, false otherwise
 */
export function isTemplateFilled(template: string, values: Record<string, string>): boolean {
  const variables = extractVariables(template);
  return variables.every(variable => {
    const value = values[variable];
    return value !== undefined && value !== null && value.trim() !== '';
  });
}

/**
 * Get unfilled variables from a template
 * @param template Template text
 * @param values Variable values
 * @returns Array of variable names that are not filled
 */
export function getUnfilledVariables(template: string, values: Record<string, string>): string[] {
  const variables = extractVariables(template);
  return variables.filter(variable => {
    const value = values[variable];
    return value === undefined || value === null || value.trim() === '';
  });
}

