import { CONSTANTS } from './constants';
import { ValidationResult } from '@/types';

export function validatePrompt(prompt: string): ValidationResult {
  const errors: string[] = [];

  if (!prompt || typeof prompt !== 'string') {
    errors.push('Prompt is required');
    return { valid: false, errors };
  }

  const trimmed = prompt.trim();

  if (trimmed.length < CONSTANTS.MIN_PROMPT_LENGTH) {
    errors.push(`Prompt must be at least ${CONSTANTS.MIN_PROMPT_LENGTH} characters`);
  }

  if (trimmed.length > CONSTANTS.MAX_PROMPT_LENGTH) {
    errors.push(`Prompt must not exceed ${CONSTANTS.MAX_PROMPT_LENGTH} characters`);
  }

  // Check for potentially harmful content patterns
  const dangerousPatterns = /<script|javascript:|onerror=|onclick=/i;
  if (dangerousPatterns.test(trimmed)) {
    errors.push('Prompt contains potentially harmful content');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function validateImage(file: File): ValidationResult {
  const errors: string[] = [];

  if (!file) {
    errors.push('Image file is required');
    return { valid: false, errors };
  }

  // Check file size
  if (file.size > CONSTANTS.MAX_FILE_SIZE) {
    errors.push(
      `File size must not exceed ${CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  // Check file type
  if (!(CONSTANTS.SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    errors.push(
      `File type must be one of: ${CONSTANTS.SUPPORTED_IMAGE_TYPES.join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function validateDuration(
  duration: number,
  type: 'video' | 'music'
): ValidationResult {
  const errors: string[] = [];

  if (!duration || typeof duration !== 'number') {
    errors.push('Duration must be a number');
    return { valid: false, errors };
  }

  if (duration <= 0) {
    errors.push('Duration must be greater than 0');
  }

  const maxDuration = type === 'video' ? 60 : 300; // 60 seconds for video, 300 for music
  if (duration > maxDuration) {
    errors.push(`Duration must not exceed ${maxDuration} seconds`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function validateAspectRatio(aspectRatio: string): ValidationResult {
  const errors: string[] = [];

  const validRatios = CONSTANTS.ASPECT_RATIOS.map((r) => r.value) as string[];
  if (!validRatios.includes(aspectRatio)) {
    errors.push(`Aspect ratio must be one of: ${validRatios.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[<>]/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 data (remove data URL prefix)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

