# File Documentation
# Gemini Image & Video Generation Platform

**Version:** 1.0.0  
**Last Updated:** November 14, 2025

This document provides a comprehensive overview of every file in the project, including its purpose, dependencies, and exports.

---

## Documentation Files

### `/scripts/prd.md`
**Purpose**: Product Requirements Document outlining all features, requirements, and specifications  
**Dependencies**: None  
**Exports**: Documentation only  
**Key Sections**: Features, technical requirements, API integration, testing requirements

### `/scripts/prfaq.md`
**Purpose**: Press Release and Frequently Asked Questions document  
**Dependencies**: None  
**Exports**: Documentation only  
**Key Sections**: Press release, FAQs about features, deployment, costs, security

### `/docs/ARCHITECTURE.md`
**Purpose**: Technical architecture documentation with system design and architectural decisions  
**Dependencies**: None  
**Exports**: Documentation only  
**Key Sections**: System overview, data flow, security, deployment, testing strategy

### `/docs/FILEDOC.md`
**Purpose**: This file - comprehensive documentation of all project files  
**Dependencies**: None  
**Exports**: Documentation only

### `/Changelog.md`
**Purpose**: Track all changes, updates, and versions of the project  
**Dependencies**: None  
**Exports**: Documentation only

---

## Configuration Files

### `/package.json`
**Purpose**: NPM package configuration with dependencies and scripts  
**Dependencies**: None (root config)  
**Exports**: Package metadata  
**Key Scripts**:
- `dev`: Start development server
- `build`: Build production application
- `start`: Start production server
- `test`: Run test suite
- `lint`: Run ESLint

### `/tsconfig.json`
**Purpose**: TypeScript compiler configuration  
**Dependencies**: None  
**Exports**: TypeScript config  
**Key Settings**: Strict mode, path aliases, module resolution

### `/next.config.js`
**Purpose**: Next.js framework configuration  
**Dependencies**: None  
**Exports**: Next.js config object  
**Key Settings**: basePath (`/HdMImageVideo`), assetPrefix, environment variables

### `/tailwind.config.js`
**Purpose**: Tailwind CSS configuration  
**Dependencies**: None  
**Exports**: Tailwind config  
**Key Settings**: Content paths, theme extensions, plugins

### `/jest.config.js`
**Purpose**: Jest testing framework configuration  
**Dependencies**: None  
**Exports**: Jest config  
**Key Settings**: Test environment, coverage thresholds, module paths

### `/.env.example`
**Purpose**: Example environment variables template  
**Dependencies**: None  
**Exports**: None (template file)  
**Variables**: GEMINI_API_KEY, rate limit overrides

### `/.env`
**Purpose**: Actual environment variables (git-ignored)  
**Dependencies**: None  
**Exports**: Environment variables at runtime  
**Security**: Never committed to version control

### `/.gitignore`
**Purpose**: Specify files Git should ignore  
**Dependencies**: None  
**Exports**: None (Git config)  
**Ignores**: node_modules, .next, .env, coverage

### `/.dockerignore`
**Purpose**: Specify files Docker should ignore when building images  
**Dependencies**: None  
**Exports**: None (Docker config)  
**Ignores**: node_modules, .git, .next, coverage

### `/Dockerfile`
**Purpose**: Docker container configuration  
**Dependencies**: None  
**Exports**: Docker image definition  
**Base Image**: node:18-alpine  
**Exposed Port**: 3000

### `/docker-compose.yml`
**Purpose**: Docker Compose orchestration for local development  
**Dependencies**: Dockerfile  
**Exports**: Compose configuration  
**Services**: app, (optional: redis)

---

## Application Files

### `/src/app/layout.tsx`
**Purpose**: Root layout component for entire application  
**Dependencies**: React, Next.js, Tailwind CSS  
**Exports**: Default RootLayout component  
**Features**: HTML structure, global styles, metadata, providers

### `/src/app/page.tsx`
**Purpose**: Home page with navigation to generators  
**Dependencies**: React, Next.js, custom components  
**Exports**: Default Home page component  
**Features**: Welcome message, feature cards, usage information

### `/src/app/image/page.tsx`
**Purpose**: Image generation page  
**Dependencies**: React, ImageGenerator component  
**Exports**: Default ImagePage component  
**Features**: Image generation UI, options, results display

### `/src/app/video/page.tsx`
**Purpose**: Video generation page  
**Dependencies**: React, VideoGenerator component  
**Exports**: Default VideoPage component  
**Features**: Video generation UI, animation options, player

### `/src/app/music/page.tsx`
**Purpose**: Music generation page  
**Dependencies**: React, MusicGenerator component  
**Exports**: Default MusicPage component  
**Features**: Music generation UI, audio player, download

### `/app/text/page.tsx`
**Purpose**: Text generation page with single-turn and multi-turn chat modes  
**Dependencies**: React, useAuth, text API utilities, UI components  
**Exports**: Default TextGenerationPage component  
**Features**:
- Mode selector (Single-turn / Multi-turn Chat)
- Template selector with save/update functionality
- System prompt selector with save/update functionality
- Real-time {{variable}} detection and dynamic input fields
- Single-turn text generation with response display
- Multi-turn chat UI with message bubbles and session management
- Save/update modals for templates and system prompts
- Copy to clipboard functionality
- Error handling and loading states
- Responsive layout with sidebar
- Dark mode support
**Size**: 950+ lines of comprehensive React/TypeScript code

---

## API Routes

### `/src/app/api/image/generate/route.ts`
**Purpose**: API endpoint for image generation  
**Dependencies**: Next.js, Gemini client, rate limiter  
**Exports**: POST handler  
**Request**: JSON with prompt, optional image, settings  
**Response**: Generated image URL or base64  
**Errors**: 400 (validation), 429 (rate limit), 500 (server error)

### `/src/app/api/image/edit/route.ts`
**Purpose**: API endpoint for image editing  
**Dependencies**: Next.js, Gemini client, rate limiter  
**Exports**: POST handler  
**Request**: Form data with image, prompt, optional mask  
**Response**: Edited image  
**Errors**: Similar to generate endpoint

### `/src/app/api/video/generate/route.ts`
**Purpose**: API endpoint for video generation  
**Dependencies**: Next.js, Gemini client, rate limiter  
**Exports**: POST handler  
**Request**: JSON with prompt, settings  
**Response**: Video URL or generation job ID  
**Errors**: 400, 429, 500

### `/src/app/api/video/animate/route.ts`
**Purpose**: API endpoint for image-to-video animation  
**Dependencies**: Next.js, Gemini client, rate limiter  
**Exports**: POST handler  
**Request**: Form data with image, optional prompt  
**Response**: Video URL  
**Errors**: 400, 429, 500

### `/src/app/api/music/generate/route.ts`
**Purpose**: API endpoint for music generation  
**Dependencies**: Next.js, Gemini client, rate limiter  
**Exports**: POST handler  
**Request**: JSON with description, duration  
**Response**: Audio file URL  
**Errors**: 400, 429, 500

### `/src/app/api/usage/status/route.ts`
**Purpose**: API endpoint to check current usage status  
**Dependencies**: Next.js, rate limiter  
**Exports**: GET handler  
**Request**: Optional userId query param  
**Response**: Current usage counts and limits  
**Errors**: 500

---

## React Components

### `/src/components/generators/ImageGenerator.tsx`
**Purpose**: Main UI component for image generation  
**Dependencies**: React, API utilities, UI components  
**Exports**: ImageGenerator component  
**Props**: None (self-contained)  
**State**: prompt, referenceImage, settings, generatedImage, loading  
**Features**: Prompt input, file upload, aspect ratio selector, results display

### `/src/components/generators/VideoGenerator.tsx`
**Purpose**: Main UI component for video generation  
**Dependencies**: React, API utilities, UI components  
**Exports**: VideoGenerator component  
**Props**: None  
**State**: prompt, sourceImage, settings, generatedVideo, loading, progress  
**Features**: Text-to-video, image-to-video, progress tracking, video player

### `/src/components/generators/MusicGenerator.tsx`
**Purpose**: Main UI component for music generation  
**Dependencies**: React, API utilities, UI components  
**Exports**: MusicGenerator component  
**Props**: None  
**State**: description, duration, generatedAudio, loading  
**Features**: Description input, duration slider, audio player, download

### `/src/components/shared/Header.tsx`
**Purpose**: Application header with navigation  
**Dependencies**: React, Next.js Link  
**Exports**: Header component  
**Props**: None  
**Features**: Logo, navigation menu, usage display

### `/src/components/shared/UsageDisplay.tsx`
**Purpose**: Display current API usage and limits  
**Dependencies**: React, usage API  
**Exports**: UsageDisplay component  
**Props**: Optional userId  
**State**: usageData, loading  
**Features**: Real-time usage counts, limit warnings, countdown timers

### `/src/components/shared/LoadingSpinner.tsx`
**Purpose**: Reusable loading indicator  
**Dependencies**: React  
**Exports**: LoadingSpinner component  
**Props**: size (sm, md, lg), message (optional)  
**Features**: Animated spinner, customizable size and message

### `/src/components/ui/Button.tsx`
**Purpose**: Reusable button component  
**Dependencies**: React  
**Exports**: Button component  
**Props**: variant, size, disabled, onClick, children  
**Features**: Multiple variants (primary, secondary, danger), size options

### `/src/components/ui/Input.tsx`
**Purpose**: Reusable input field component  
**Dependencies**: React  
**Exports**: Input component  
**Props**: type, value, onChange, placeholder, error, etc.  
**Features**: Validation states, error messages, accessibility

### `/src/components/ui/FileUpload.tsx`
**Purpose**: File upload component with preview  
**Dependencies**: React  
**Exports**: FileUpload component  
**Props**: accept, maxSize, onFileSelect, preview  
**Features**: Drag-and-drop, preview, size validation, type checking

### `/src/components/ui/Select.tsx`
**Purpose**: Reusable select/dropdown component  
**Dependencies**: React  
**Exports**: Select component  
**Props**: options, value, onChange, placeholder  
**Features**: Searchable, keyboard navigation, custom rendering

---

## Core Libraries

### `/src/lib/gemini/client.ts`
**Purpose**: Main Gemini API client wrapper  
**Dependencies**: @google/generative-ai, error utilities  
**Exports**: GeminiClient class, createClient function  
**Key Methods**:
- `constructor(apiKey: string)`
- `getModel(modelName: string)`
- `validateApiKey(): Promise<boolean>`

### `/src/lib/gemini/image.ts`
**Purpose**: Image generation specific functions  
**Dependencies**: GeminiClient, types  
**Exports**: 
- `generateImage(params: ImageGenerationParams): Promise<ImageResponse>`
- `editImage(params: ImageEditParams): Promise<ImageResponse>`
- `imageToImage(params: Image2ImageParams): Promise<ImageResponse>`

**Key Functions**:
```typescript
generateImage({
  prompt: string,
  model?: 'imagen' | 'nano-banana',
  aspectRatio?: string,
  negativePrompt?: string,
  referenceImage?: string,
  safetySettings?: object
}): Promise<{
  imageUrl: string,
  prompt: string,
  model: string
}>
```

### `/src/lib/gemini/video.ts`
**Purpose**: Video generation specific functions  
**Dependencies**: GeminiClient, types  
**Exports**:
- `generateVideo(params: VideoGenerationParams): Promise<VideoResponse>`
- `animateImage(params: AnimateImageParams): Promise<VideoResponse>`
- `checkVideoStatus(jobId: string): Promise<VideoStatus>`

**Key Functions**:
```typescript
generateVideo({
  prompt: string,
  model?: 'veo' | 'veo-fast',
  duration?: number,
  aspectRatio?: string
}): Promise<{
  videoUrl: string,
  jobId?: string,
  status: 'completed' | 'processing'
}>
```

### `/src/lib/gemini/music.ts`
**Purpose**: Music generation specific functions  
**Dependencies**: GeminiClient, types  
**Exports**:
- `generateMusic(params: MusicGenerationParams): Promise<MusicResponse>`

**Key Functions**:
```typescript
generateMusic({
  description: string,
  duration?: number,
  style?: string
}): Promise<{
  audioUrl: string,
  duration: number
}>
```

### `/lib/text/api.ts`
**Purpose**: Text generation API client utilities  
**Dependencies**: apiClient (apiFetch), text-generation types  
**Exports**:
- `templateAPI` - Template CRUD operations
- `systemPromptAPI` - System prompt CRUD operations
- `textGenerationAPI` - Single-turn generation
- `chatAPI` - Multi-turn chat operations

**Key Functions**:
```typescript
templateAPI: {
  list(mediaType): Promise<PromptTemplate[]>,
  get(id): Promise<PromptTemplate>,
  create(data): Promise<PromptTemplate>,
  update(id, data): Promise<PromptTemplate>,
  delete(id): Promise<void>
}

systemPromptAPI: {
  list(mediaType): Promise<SystemPrompt[]>,
  get(id): Promise<SystemPrompt>,
  create(data): Promise<SystemPrompt>,
  update(id, data): Promise<SystemPrompt>,
  delete(id): Promise<void>
}

textGenerationAPI: {
  generate(request): Promise<TextGeneration>
}

chatAPI: {
  listSessions(): Promise<ChatSession[]>,
  getSession(id): Promise<ChatSession>,
  createSession(data): Promise<ChatSession>,
  updateSession(id, data): Promise<ChatSession>,
  deleteSession(id): Promise<void>,
  getMessages(sessionId): Promise<ChatMessage[]>,
  sendMessage(sessionId, data): Promise<ChatMessage>
}
```

### `/lib/text/utils.ts`
**Purpose**: Template variable extraction and processing utilities  
**Dependencies**: None (pure functions)  
**Exports**:
- `extractVariables(template: string): string[]` - Extract {{variable}} names
- `fillTemplate(template: string, values: Record<string, string>): string` - Replace variables with values
- `isTemplateFilled(template: string, values: Record<string, string>): boolean` - Check if all variables are filled
- `getUnfilledVariables(template: string, values: Record<string, string>): string[]` - Get list of unfilled variables

**Key Functions**:
```typescript
// Extract variables from template using regex: /\{\{(\w+)\}\}/g
extractVariables("Hello {{name}}, welcome to {{place}}!")
// Returns: ["name", "place"]

// Fill template with values
fillTemplate("Hello {{name}}!", { name: "World" })
// Returns: "Hello World!"

// Validate all variables are filled
isTemplateFilled("{{a}} {{b}}", { a: "1", b: "2" })
// Returns: true
```

### `/src/lib/rate-limit/limiter.ts`
**Purpose**: Rate limiting logic and enforcement  
**Dependencies**: storage, config, types  
**Exports**: RateLimiter class  
**Key Methods**:
- `checkLimit(userId: string, resource: string): Promise<RateLimitResult>`
- `incrementUsage(userId: string, resource: string): Promise<void>`
- `getRemainingQuota(userId: string, resource: string): Promise<number>`
- `resetLimits(): Promise<void>`

**RateLimitResult Interface**:
```typescript
{
  allowed: boolean,
  remaining: number,
  resetAt: Date,
  retryAfter?: number
}
```

### `/src/lib/rate-limit/storage.ts`
**Purpose**: Storage abstraction for rate limit data  
**Dependencies**: Node.js (for memory storage), optional Redis  
**Exports**: 
- `RateLimitStorage` interface
- `MemoryStorage` class
- `RedisStorage` class (if Redis available)

**Interface**:
```typescript
interface RateLimitStorage {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttl: number): Promise<void>;
  increment(key: string): Promise<number>;
  delete(key: string): Promise<void>;
}
```

### `/src/lib/rate-limit/config.ts`
**Purpose**: Rate limit configuration and defaults  
**Dependencies**: Environment variables  
**Exports**: 
- `rateLimitConfig` object
- `getRateLimitConfig(): RateLimitConfig`

**Configuration Structure**:
```typescript
{
  image: {
    hourly: 50,
    daily: 200
  },
  video: {
    hourly: 3,
    daily: 10
  },
  music: {
    hourly: 10,
    daily: 50
  },
  storage: 'memory' | 'redis',
  redisUrl?: string
}
```

### `/src/lib/utils/validation.ts`
**Purpose**: Input validation functions  
**Dependencies**: None  
**Exports**:
- `validatePrompt(prompt: string): ValidationResult`
- `validateImage(file: File): ValidationResult`
- `validateDuration(duration: number): ValidationResult`
- `sanitizeInput(input: string): string`

**Validation Rules**:
- Prompt: 1-10000 characters, no HTML tags
- Images: Max 10MB, types: jpg, png, webp
- Duration: 1-60 seconds for video, 10-300 seconds for music

### `/src/lib/utils/errors.ts`
**Purpose**: Custom error classes and error handling utilities  
**Dependencies**: None  
**Exports**:
- `ApiError` class
- `ValidationError` class
- `RateLimitError` class
- `handleApiError(error: unknown): ErrorResponse`

**Error Classes**:
```typescript
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  )
}

class RateLimitError extends ApiError {
  constructor(
    message: string,
    public retryAfter: number
  )
}
```

### `/src/lib/utils/constants.ts`
**Purpose**: Application-wide constants  
**Dependencies**: None  
**Exports**: Constants object  
**Constants**:
```typescript
export const CONSTANTS = {
  MAX_PROMPT_LENGTH: 10000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ASPECT_RATIOS: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  VIDEO_DURATIONS: [5, 10, 15, 30],
  MUSIC_DURATIONS: [10, 30, 60, 120, 300],
  API_TIMEOUT: 60000, // 60 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};
```

---

## Type Definitions

### `/src/types/gemini.ts`
**Purpose**: TypeScript types for Gemini API interactions  
**Dependencies**: None  
**Exports**: 
```typescript
export interface ImageGenerationParams {
  prompt: string;
  model?: 'imagen' | 'nano-banana';
  aspectRatio?: string;
  negativePrompt?: string;
  referenceImage?: string;
  safetySettings?: SafetySettings;
}

export interface ImageResponse {
  imageUrl: string;
  prompt: string;
  model: string;
  generatedAt: Date;
}

export interface VideoGenerationParams {
  prompt: string;
  model?: 'veo' | 'veo-fast';
  duration?: number;
  aspectRatio?: string;
  sourceImage?: string;
}

export interface VideoResponse {
  videoUrl?: string;
  jobId?: string;
  status: 'completed' | 'processing' | 'failed';
  progress?: number;
  estimatedCompletion?: Date;
}

export interface MusicGenerationParams {
  description: string;
  duration?: number;
  style?: string;
}

export interface MusicResponse {
  audioUrl: string;
  duration: number;
  generatedAt: Date;
}
```

### `/types/text-generation.ts`
**Purpose**: TypeScript types for text generation, templates, system prompts, and chat  
**Dependencies**: None  
**Exports**: 
```typescript
// Template Management
export interface PromptTemplate {
  id: string;
  userId: string;
  name: string;
  mediaType: 'text' | 'image' | 'video';
  templateText: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  name: string;
  mediaType: 'text' | 'image' | 'video';
  templateText: string;
  variables?: string[];
}

export interface UpdateTemplateRequest {
  name?: string;
  templateText?: string;
  variables?: string[];
}

// System Prompts
export interface SystemPrompt {
  id: string;
  userId: string;
  name: string;
  mediaType: 'text' | 'image' | 'video';
  promptText: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSystemPromptRequest {
  name: string;
  mediaType: 'text' | 'image' | 'video';
  promptText: string;
}

export interface UpdateSystemPromptRequest {
  name?: string;
  promptText?: string;
}

// Text Generation
export interface TextGeneration {
  id: string;
  userId: string;
  userMessage: string;
  systemPrompt?: string;
  systemPromptId?: string;
  templateId?: string;
  variableValues?: Record<string, string>;
  modelResponse: string;
  model: string;
  createdAt: string;
}

export interface GenerateTextRequest {
  userMessage: string;
  systemPrompt?: string;
  systemPromptId?: string;
  templateId?: string;
  variableValues?: Record<string, string>;
  model?: string;
}

// Chat Sessions
export interface ChatSession {
  id: string;
  userId: string;
  name?: string;
  systemPrompt?: string;
  systemPromptId?: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
}

export interface CreateChatSessionRequest {
  name?: string;
  systemPrompt?: string;
  systemPromptId?: string;
  model?: string;
}

export interface UpdateChatSessionRequest {
  name?: string;
}

export interface SendChatMessageRequest {
  message: string;
  model?: string;
}
```

### `/src/types/api.ts`
**Purpose**: TypeScript types for API requests and responses  
**Dependencies**: None  
**Exports**:
```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

export interface ErrorResponse {
  message: string;
  code: string;
  statusCode: number;
  details?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}
```

### `/src/types/index.ts`
**Purpose**: Barrel export for all types  
**Dependencies**: All type files  
**Exports**: Re-exports all types from other type files

---

## Test Files

### `/tests/unit/lib/gemini/client.test.ts`
**Purpose**: Unit tests for Gemini client  
**Dependencies**: Jest, GeminiClient  
**Tests**:
- Client initialization
- API key validation
- Error handling
- Model selection

### `/tests/unit/lib/rate-limit/limiter.test.ts`
**Purpose**: Unit tests for rate limiter  
**Dependencies**: Jest, RateLimiter, mock storage  
**Tests**:
- Limit checking
- Usage incrementing
- Quota calculation
- Reset logic
- Hourly vs daily limits

### `/tests/unit/lib/utils/validation.test.ts`
**Purpose**: Unit tests for validation functions  
**Dependencies**: Jest, validation utilities  
**Tests**:
- Prompt validation (length, content)
- Image validation (size, type)
- Duration validation
- Input sanitization

### `/tests/integration/api/image/generate.test.ts`
**Purpose**: Integration tests for image generation API  
**Dependencies**: Jest, Next.js test utilities, mocked Gemini  
**Tests**:
- Successful generation
- Rate limit enforcement
- Error handling
- Input validation
- Response format

### `/tests/integration/api/video/generate.test.ts`
**Purpose**: Integration tests for video generation API  
**Dependencies**: Jest, Next.js test utilities, mocked Gemini  
**Tests**: Similar to image tests, plus async job handling

### `/tests/integration/api/music/generate.test.ts`
**Purpose**: Integration tests for music generation API  
**Dependencies**: Jest, Next.js test utilities, mocked Gemini  
**Tests**: Similar to image tests with music-specific parameters

### `/tests/components/ImageGenerator.test.tsx`
**Purpose**: Component tests for ImageGenerator  
**Dependencies**: Jest, React Testing Library, mocked API  
**Tests**:
- Component rendering
- User interactions (input, upload, submit)
- Loading states
- Error display
- Result display

### `/tests/components/VideoGenerator.test.tsx`
**Purpose**: Component tests for VideoGenerator  
**Dependencies**: Jest, React Testing Library, mocked API  
**Tests**: Similar to ImageGenerator plus video-specific features

### `/tests/components/MusicGenerator.test.tsx`
**Purpose**: Component tests for MusicGenerator  
**Dependencies**: Jest, React Testing Library, mocked API  
**Tests**: Similar to ImageGenerator plus audio-specific features

---

## Static Assets

### `/public/icons/`
**Purpose**: Directory containing UI icons  
**Contents**: SVG icons for various UI elements  
**Usage**: Imported in components

### `/public/examples/`
**Purpose**: Example images for demonstrations  
**Contents**: Sample images showing capabilities  
**Usage**: Displayed in documentation and demos

---

## Build Output (Generated)

### `/.next/`
**Purpose**: Next.js build output directory  
**Generated**: By `npm run build`  
**Contents**: Compiled pages, API routes, static assets  
**Note**: Git-ignored, regenerated on each build

### `/node_modules/`
**Purpose**: NPM dependencies  
**Generated**: By `npm install`  
**Contents**: All package dependencies  
**Note**: Git-ignored, reinstalled from package.json

### `/coverage/`
**Purpose**: Test coverage reports  
**Generated**: By `npm test -- --coverage`  
**Contents**: HTML and LCOV coverage reports  
**Note**: Git-ignored, regenerated on each test run

---

## Additional Files

### `/README.md`
**Purpose**: Project overview and quick start guide  
**Dependencies**: None  
**Contents**: 
- Project description
- Installation instructions
- Usage guide
- Deployment instructions
- Contributing guidelines

### `/LICENSE`
**Purpose**: Software license  
**Dependencies**: None  
**Contents**: License terms for the project

### `/.eslintrc.json`
**Purpose**: ESLint configuration for code quality  
**Dependencies**: None  
**Exports**: ESLint rules and settings

### `/.prettierrc`
**Purpose**: Prettier configuration for code formatting  
**Dependencies**: None  
**Exports**: Formatting rules

### `/TaskMaster.md` (if created)
**Purpose**: Task management and implementation tracking  
**Dependencies**: None  
**Contents**: Current tasks, status, and progress

---

## File Dependency Graph

```
Configuration Files
└── Loaded by Next.js/TypeScript/Jest at runtime

Documentation Files
└── Referenced by developers (no runtime dependencies)

Type Files (/src/types/)
├── Imported by: All TypeScript files
└── No dependencies

Utility Files (/src/lib/utils/)
├── Imported by: All application files
└── Depends on: Types

Core Libraries (/src/lib/gemini/, /src/lib/rate-limit/)
├── Imported by: API routes, components
└── Depends on: Types, utilities

UI Components (/src/components/ui/)
├── Imported by: Generator components, shared components
└── Depends on: React, types

Shared Components (/src/components/shared/)
├── Imported by: Layout, pages
└── Depends on: UI components, utilities

Generator Components (/src/components/generators/)
├── Imported by: Pages
└── Depends on: All component layers, API utilities

API Routes (/src/app/api/)
├── Called by: Frontend via fetch
└── Depends on: Core libraries, utilities

Pages (/src/app/)
├── Rendered by: Next.js
└── Depends on: Components, layout

Test Files (/tests/)
├── Run by: Jest
└── Depends on: Source files being tested
```

---

*Document Version: 1.0.0*  
*Last Updated: November 8, 2025*  
*Note: This document will be updated as files are created during development*

