/**
 * Utility functions for text generation. The implementation is shared with the
 * image and video generators and lives in `lib/templates/utils.ts`.
 */

export {
  extractVariables,
  fillTemplate,
  resolvePrompt,
  isTemplateFilled,
  getUnfilledVariables,
  pickVariableValues,
  preparePrompt,
  PLACEHOLDER_NAME_PATTERN,
} from '@/lib/templates/utils';
