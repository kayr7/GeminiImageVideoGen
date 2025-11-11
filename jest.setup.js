// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock environment variables for tests
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.NEXT_PUBLIC_BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ?? '/HdMImageVideo';

// Mock fetch globally
global.fetch = jest.fn();

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

