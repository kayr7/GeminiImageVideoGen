# Architecture Documentation
# Gemini Image & Video Generation Platform

**Version:** 1.0.0  
**Last Updated:** November 8, 2025

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Technology Stack](#technology-stack)
4. [Application Structure](#application-structure)
5. [Data Flow](#data-flow)
6. [API Integration](#api-integration)
7. [Rate Limiting System](#rate-limiting-system)
8. [Security Architecture](#security-architecture)
9. [Deployment Architecture](#deployment-architecture)
10. [Testing Strategy](#testing-strategy)

---

## 1. System Overview

The Gemini Creative Playground is a Next.js-based web application that provides a user-friendly interface for Google's Gemini generative AI APIs. The system follows a client-server architecture with the Next.js application serving both frontend UI and backend API routes.

### Key Design Principles

1. **Security First**: API keys never exposed to client
2. **Cost Control**: Strict rate limiting at multiple levels
3. **User Experience**: Responsive, intuitive interface with clear feedback
4. **Testability**: Comprehensive testing with mocked external dependencies
5. **Deployability**: Containerized for easy deployment

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Browser                          │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Image      │  │    Video     │  │    Music     │          │
│  │  Generator   │  │  Generator   │  │  Generator   │          │
│  │  Component   │  │  Component   │  │  Component   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTPS
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                    Next.js Application                           │
│                            │                                     │
│  ┌─────────────────────────▼──────────────────────────────────┐ │
│  │                   API Routes Layer                          │ │
│  │                                                              │ │
│  │  /api/image/generate    /api/video/generate                │ │
│  │  /api/image/edit        /api/video/animate                 │ │
│  │  /api/music/generate    /api/usage/status                  │ │
│  └──────────────┬──────────────────┬──────────────────────────┘ │
│                 │                  │                             │
│  ┌──────────────▼──────────┐  ┌───▼──────────────────┐         │
│  │  Rate Limiter Service   │  │  Gemini API Client   │         │
│  │                         │  │                       │         │
│  │  - Check limits         │  │  - Image API         │         │
│  │  - Update counters      │  │  - Video API         │         │
│  │  - Reset timers         │  │  - Music API         │         │
│  └─────────────────────────┘  └───┬──────────────────┘         │
│                                    │                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │ HTTPS
                                     │
                        ┌────────────▼────────────┐
                        │   Google Gemini API     │
                        │                         │
                        │  - Imagen 4.0           │
                        │  - Nano Banana          │
                        │  - Veo 3.1              │
                        │  - MusicFX              │
                        └─────────────────────────┘
```

---

## 3. Technology Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript 5.0+
- **Styling**: Tailwind CSS 3.x
- **UI Components**: React 18+
- **State Management**: React Hooks (useState, useContext)
- **HTTP Client**: Fetch API (native)

### Backend
- **Runtime**: Node.js 18+
- **API Framework**: Next.js API Routes
- **API Client**: @google/generative-ai
- **Rate Limiting**: Custom implementation with memory/Redis storage
- **File Processing**: Built-in Node.js modules

### Testing
- **Test Runner**: Jest
- **Component Testing**: React Testing Library
- **API Mocking**: Jest mocks
- **Coverage**: Istanbul (built into Jest)

### DevOps
- **Containerization**: Docker
- **Base Image**: node:18-alpine
- **Build Tool**: Next.js built-in
- **Package Manager**: npm

---

## 4. Application Structure

### Directory Layout

```
/Users/kayrottmann/Coding/GeminiImagVideoGen/
├── .next/                    # Next.js build output (generated)
├── node_modules/             # Dependencies (generated)
├── public/                   # Static assets
│   ├── icons/               # UI icons
│   └── examples/            # Example images for demos
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   ├── image/           # Image generation pages
│   │   ├── video/           # Video generation pages
│   │   ├── music/           # Music generation pages
│   │   └── api/             # API routes
│   │       ├── image/
│   │       │   ├── generate/route.ts
│   │       │   └── edit/route.ts
│   │       ├── video/
│   │       │   ├── generate/route.ts
│   │       │   └── animate/route.ts
│   │       ├── music/
│   │       │   └── generate/route.ts
│   │       └── usage/
│   │           └── status/route.ts
│   ├── components/          # React components
│   │   ├── generators/
│   │   │   ├── ImageGenerator.tsx
│   │   │   ├── VideoGenerator.tsx
│   │   │   └── MusicGenerator.tsx
│   │   ├── shared/
│   │   │   ├── Header.tsx
│   │   │   ├── UsageDisplay.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   └── ui/              # Reusable UI components
│   ├── lib/                 # Core libraries
│   │   ├── gemini/
│   │   │   ├── client.ts    # Gemini API client wrapper
│   │   │   ├── image.ts     # Image generation functions
│   │   │   ├── video.ts     # Video generation functions
│   │   │   └── music.ts     # Music generation functions
│   │   ├── rate-limit/
│   │   │   ├── limiter.ts   # Rate limiting logic
│   │   │   ├── storage.ts   # Storage abstraction
│   │   │   └── config.ts    # Rate limit configuration
│   │   └── utils/
│   │       ├── validation.ts # Input validation
│   │       ├── errors.ts     # Error handling
│   │       └── constants.ts  # Application constants
│   └── types/               # TypeScript type definitions
│       ├── gemini.ts
│       ├── api.ts
│       └── index.ts
├── tests/                   # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── components/         # Component tests
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md     # This file
│   └── FILEDOC.md          # File documentation
├── scripts/                 # Utility scripts
│   ├── prd.md              # Product requirements
│   └── prfaq.md            # PR/FAQ
├── .env.example            # Example environment variables
├── .env                    # Environment variables (git-ignored)
├── .dockerignore           # Docker ignore patterns
├── .gitignore              # Git ignore patterns
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
├── next.config.js          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── jest.config.js          # Jest configuration
├── package.json            # Dependencies and scripts
├── Changelog.md            # Change log
└── README.md               # Project overview
```

---

## 5. Data Flow

### Image Generation Flow

1. **User Input**: User enters prompt and optional reference image in UI
2. **Client Validation**: Basic validation in React component
3. **API Request**: POST to `/api/image/generate` with form data
4. **Rate Limit Check**: Server checks current usage against limits
5. **API Call**: If allowed, call Gemini Imagen API
6. **Response Processing**: Convert API response to client format
7. **Display**: Show generated image in UI with download option

### Detailed Flow Diagram

```
┌──────────┐
│  User    │
└────┬─────┘
     │ 1. Enter prompt + image
     ▼
┌──────────────────┐
│ React Component  │
└────┬─────────────┘
     │ 2. Validate input
     │ 3. POST /api/image/generate
     ▼
┌──────────────────┐
│  API Route       │
│  Handler         │
└────┬─────────────┘
     │ 4. Check rate limit
     ▼
┌──────────────────┐      No     ┌──────────────┐
│  Rate Limiter    │─────────────>│ Return 429   │
└────┬─────────────┘              └──────────────┘
     │ Yes
     │ 5. Process image
     ▼
┌──────────────────┐
│  Gemini Client   │
└────┬─────────────┘
     │ 6. Call Gemini API
     ▼
┌──────────────────┐
│  Gemini API      │
└────┬─────────────┘
     │ 7. Return generated image
     ▼
┌──────────────────┐
│  API Route       │
│  (response)      │
└────┬─────────────┘
     │ 8. Format response
     ▼
┌──────────────────┐
│ React Component  │
└────┬─────────────┘
     │ 9. Display image
     ▼
┌──────────┐
│  User    │
└──────────┘
```

---

## 6. API Integration

### Gemini API Client Architecture

The Gemini API integration is encapsulated in a modular client library:

```typescript
// src/lib/gemini/client.ts
class GeminiClient {
  private apiKey: string;
  private client: GoogleGenerativeAI;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
  }
  
  async generateImage(params: ImageGenerationParams): Promise<ImageResponse> {
    // Implementation
  }
  
  async generateVideo(params: VideoGenerationParams): Promise<VideoResponse> {
    // Implementation
  }
  
  async generateMusic(params: MusicGenerationParams): Promise<MusicResponse> {
    // Implementation
  }
}
```

### API Models

**Image Generation Models:**
- `imagen-4.0-generate-preview`: High quality, slower (primary)
- `nano-banana-generate-preview`: Fast, lower cost (optional)

**Video Generation Models:**
- `veo-3.1-generate-preview`: High quality video
- `veo-3.1-fast-generate-preview`: Faster generation

**Music Generation Models:**
- `music-generation-preview`: Text-to-music

### Error Handling Strategy

1. **API Errors**: Catch and translate Gemini API errors to user-friendly messages
2. **Network Errors**: Retry with exponential backoff (max 3 retries)
3. **Validation Errors**: Return 400 with specific validation messages
4. **Rate Limit Errors**: Return 429 with retry-after header
5. **Server Errors**: Log details, return generic 500 to user

---

## 7. Rate Limiting System

### Architecture

The rate limiting system is designed as a pluggable service with multiple storage backends:

```typescript
interface RateLimitStorage {
  get(key: string): Promise<number>;
  set(key: string, value: number, ttl: number): Promise<void>;
  increment(key: string): Promise<number>;
}

class MemoryStorage implements RateLimitStorage {
  // In-memory implementation for development
}

class RedisStorage implements RateLimitStorage {
  // Redis implementation for production
}

class RateLimiter {
  constructor(
    private storage: RateLimitStorage,
    private limits: RateLimitConfig
  ) {}
  
  async checkLimit(
    userId: string,
    resource: 'image' | 'video' | 'music'
  ): Promise<RateLimitResult> {
    // Check both hourly and daily limits
  }
}
```

### Rate Limit Keys

Rate limits are tracked with hierarchical keys:

- `global:{resource}:hour:{timestamp}` - Global hourly limit
- `global:{resource}:day:{date}` - Global daily limit
- `user:{userId}:{resource}:hour:{timestamp}` - Per-user hourly
- `user:{userId}:{resource}:day:{date}` - Per-user daily

### Reset Strategy

- **Hourly limits**: Reset at the start of each hour (UTC)
- **Daily limits**: Reset at midnight (UTC)
- **Sliding window**: Optional sliding window implementation for smoother limiting

---

## 8. Security Architecture

### API Key Protection

1. **Server-Side Only**: API key stored in environment variables, never sent to client
2. **No Client Exposure**: All Gemini API calls made from Next.js API routes
3. **Environment Validation**: Application validates API key presence on startup

### Input Validation

```typescript
// Multi-layer validation
1. Client-side: Basic format validation (immediate feedback)
2. Server-side: Comprehensive validation before API calls
3. Sanitization: Remove potentially harmful content
4. Size limits: Enforce maximum file sizes
```

### File Upload Security

1. **Size Limits**: Max 10MB per file
2. **Type Validation**: Whitelist of allowed MIME types
3. **Content Verification**: Verify file content matches extension
4. **Temporary Storage**: Files processed in memory or temp directories
5. **Automatic Cleanup**: Files deleted immediately after processing

### Content Safety

1. **Gemini Safety Filters**: Leverage built-in Gemini content filtering
2. **Error Handling**: Gracefully handle content policy violations
3. **User Feedback**: Clear messages when content is rejected

---

## 9. Deployment Architecture

### Docker Configuration

**Dockerfile Strategy:**
- Multi-stage builds for optimization
- Alpine base image for minimal size
- Layer caching for faster builds
- Environment variable injection at runtime

**Container Features:**
- Exposed port: 3000
- Volume mounts for config files (optional)
- Health check endpoint
- Graceful shutdown handling

### Subpath Configuration

The application runs under `/HdMImageVideo` subpath:

```javascript
// next.config.js
module.exports = {
  basePath: '/HdMImageVideo',
  assetPrefix: '/HdMImageVideo',
  // ...
}
```

**Reverse Proxy Configuration (nginx example):**
```nginx
location /HdMImageVideo/ {
  proxy_pass http://localhost:3000/HdMImageVideo/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Environment Configuration

**Required Variables:**
- `GEMINI_API_KEY`: Google Gemini API key

**Optional Variables:**
- `NEXT_PUBLIC_BASE_PATH`: Base path override
- `RATE_LIMIT_STORAGE`: Storage type (memory/redis)
- `REDIS_URL`: Redis connection string (if using Redis)
- `IMAGE_MAX_PER_HOUR`: Image rate limit override
- `VIDEO_MAX_PER_HOUR`: Video rate limit override
- `MUSIC_MAX_PER_HOUR`: Music rate limit override
- `NODE_ENV`: Environment (development/production)

---

## 10. Testing Strategy

### Test Pyramid

```
        ┌───────────────┐
        │   E2E Tests   │  <- Manual testing (UI flows)
        │   (Manual)    │
        └───────────────┘
              ▲
        ┌─────────────────┐
        │ Integration Tests│  <- API routes, rate limiting
        │     (Jest)       │
        └─────────────────┘
              ▲
        ┌───────────────────┐
        │    Unit Tests     │  <- Utils, helpers, components
        │  (Jest + RTL)     │
        └───────────────────┘
```

### Mocking Strategy

**Gemini API Mocking:**
```typescript
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'mocked response',
        },
      }),
    }),
  })),
}));
```

**File Upload Mocking:**
```typescript
const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
const formData = new FormData();
formData.append('image', mockFile);
```

### Test Coverage Requirements

- **Overall**: 80% minimum
- **Critical Paths**: 100% (rate limiting, API calls)
- **UI Components**: 70% minimum
- **Utilities**: 90% minimum

### Test Execution

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.ts

# Watch mode for development
npm test -- --watch
```

---

## 11. Performance Considerations

### Optimization Strategies

1. **Code Splitting**: Automatic Next.js code splitting per route
2. **Image Optimization**: Next.js Image component for optimal loading
3. **Lazy Loading**: Components loaded on-demand
4. **Caching**: Static assets cached with long expiry
5. **API Response Caching**: Cache generation metadata (not content)

### Scalability

**Current Architecture (v1.0):**
- Single container deployment
- In-memory rate limiting
- Suitable for <100 concurrent users

**Future Scalability (v2.0+):**
- Load-balanced multi-container deployment
- Redis-based rate limiting
- Horizontal scaling support
- CDN for static assets

---

## 12. Monitoring & Observability

### Logging Strategy

```typescript
// Structured logging
logger.info('image_generation_started', {
  userId,
  model: 'imagen-4.0',
  timestamp: Date.now()
});

logger.error('api_error', {
  error: error.message,
  stack: error.stack,
  context: { userId, resource }
});
```

### Metrics to Track

1. **API Usage**:
   - Requests per resource type
   - Success/failure rates
   - Response times

2. **Rate Limiting**:
   - Limit hits per resource
   - User limit hits
   - Reset frequencies

3. **Performance**:
   - API route response times
   - Gemini API latencies
   - Client-side rendering times

4. **Errors**:
   - Error rates by type
   - Failed generations
   - Validation failures

---

## 13. Key Architectural Decisions

### ADR-001: Next.js App Router
**Decision**: Use Next.js 14+ App Router instead of Pages Router  
**Rationale**: Better TypeScript support, improved performance, modern React patterns  
**Tradeoffs**: Newer API, less community examples

### ADR-002: Server-Side API Calls Only
**Decision**: All Gemini API calls from Next.js API routes, never from client  
**Rationale**: Protects API key, enables rate limiting, better error handling  
**Tradeoffs**: Additional network hop, slightly higher latency

### ADR-003: In-Memory Rate Limiting for v1.0
**Decision**: Use in-memory rate limiting rather than Redis initially  
**Rationale**: Simpler deployment, sufficient for educational use, fewer dependencies  
**Tradeoffs**: Not suitable for multi-instance deployments, data lost on restart

### ADR-004: TypeScript Throughout
**Decision**: Use TypeScript for entire codebase  
**Rationale**: Type safety, better IDE support, reduced runtime errors  
**Tradeoffs**: Slightly more verbose, learning curve for students

### ADR-005: Tailwind CSS for Styling
**Decision**: Use Tailwind CSS instead of CSS modules or styled-components  
**Rationale**: Rapid development, consistent design, smaller bundle size  
**Tradeoffs**: HTML verbosity, learning curve for traditional CSS users

---

## 14. Future Architecture Considerations

### Planned Enhancements

1. **User Authentication**: JWT-based auth for personal accounts
2. **Content Storage**: Optional database for saving generations
3. **WebSockets**: Real-time progress updates for long operations
4. **Queue System**: Job queue for video generation (Bull/BullMQ)
5. **CDN Integration**: Serve generated content via CDN
6. **Analytics**: Usage analytics and dashboards

### Scalability Roadmap

**Phase 1 (v1.0)**: Single container, in-memory storage  
**Phase 2 (v1.5)**: Redis integration, improved monitoring  
**Phase 3 (v2.0)**: Multi-container, load balancing, persistent storage  
**Phase 4 (v2.5)**: Microservices architecture, dedicated generation workers

---

*Document Version: 1.0.0*  
*Last Updated: November 8, 2025*  
*Next Review: December 8, 2025*

