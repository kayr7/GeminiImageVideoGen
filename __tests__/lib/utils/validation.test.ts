import { validatePrompt, validateImage, validateDuration, validateAspectRatio, sanitizeInput } from '@/lib/utils/validation';
import { CONSTANTS } from '@/lib/utils/constants';

describe('Validation Utils', () => {
  describe('validatePrompt', () => {
    it('should validate valid prompts', () => {
      const result = validatePrompt('A beautiful sunset over mountains');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject empty prompts', () => {
      const result = validatePrompt('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt is required');
    });

    it('should reject prompts that are too short', () => {
      const result = validatePrompt('ab');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('at least'));
    });

    it('should reject prompts that are too long', () => {
      const longPrompt = 'a'.repeat(CONSTANTS.MAX_PROMPT_LENGTH + 1);
      const result = validatePrompt(longPrompt);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('must not exceed'));
    });

    it('should reject prompts with dangerous patterns', () => {
      const result = validatePrompt('<script>alert("xss")</script>');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('harmful'));
    });
  });

  describe('validateImage', () => {
    it('should validate valid images', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const result = validateImage(file);
      expect(result.valid).toBe(true);
    });

    it('should reject files that are too large', () => {
      const largeData = new Uint8Array(CONSTANTS.MAX_FILE_SIZE + 1);
      const file = new File([largeData], 'large.jpg', { type: 'image/jpeg' });
      const result = validateImage(file);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('size'));
    });

    it('should reject unsupported file types', () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = validateImage(file);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('type'));
    });
  });

  describe('validateDuration', () => {
    it('should validate valid video durations', () => {
      const result = validateDuration(30, 'video');
      expect(result.valid).toBe(true);
    });

    it('should validate valid music durations', () => {
      const result = validateDuration(120, 'music');
      expect(result.valid).toBe(true);
    });

    it('should reject durations that are too long', () => {
      const result = validateDuration(1000, 'video');
      expect(result.valid).toBe(false);
    });

    it('should reject negative durations', () => {
      const result = validateDuration(-5, 'video');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAspectRatio', () => {
    it('should validate valid aspect ratios', () => {
      const result = validateAspectRatio('16:9');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid aspect ratios', () => {
      const result = validateAspectRatio('invalid');
      expect(result.valid).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      const input = '<p>Hello</p>';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello');
    });

    it('should remove dangerous characters', () => {
      const input = 'Hello<>World';
      const result = sanitizeInput(input);
      expect(result).toBe('HelloWorld');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello World');
    });
  });
});

