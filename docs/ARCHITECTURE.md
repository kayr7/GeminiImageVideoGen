# Architecture

```
Browser ──> Next.js frontend (:3000, basePath /HdMImageVideo)
   │              pages + components, calls the API via lib/utils/apiClient.ts
   └──────> FastAPI backend (:8000, root path /HdMImageVideo)
                  │  routers/  -> HTTP endpoints, auth, quota checks
                  │  utils/    -> Gemini calls, SQLite, storage, quotas
                  └──> Google Gemini API (image, video, speech, text)
```

In production nginx sits in front and routes `/HdMImageVideo/api/` to the backend and
`/HdMImageVideo` to the frontend (see [DEPLOYMENT.md](DEPLOYMENT.md)). The Gemini API key exists
only in the backend; the browser never sees it.

## Frontend (`app/`, `components/`, `lib/`)

- Pages: `image`, `video`, `speech`, `text`, `gallery`, `admin`, `login`, `profile`.
- `components/generators/` hold the per-modality forms; `shared/` has the header, usage display and template selector; `ui/` has basic inputs.
- `lib/context/AuthContext.tsx` stores the bearer token and user; `lib/utils/apiClient.ts` resolves API URLs under the base path; `lib/text/` and `lib/templates/` wrap the text and template endpoints.
- Tests live in `__tests__/` (Jest + React Testing Library).

## Backend (`backend/`)

| Module | Purpose |
|---|---|
| `main.py` | App setup, CORS, router registration, `/health` |
| `models.py` | Pydantic request/response models |
| `routers/auth.py` | Login, logout, password change, current user |
| `routers/image.py`, `video.py`, `speech.py`, `text_generation.py` | Generation endpoints (quota + rate-limit checks, then Gemini call) |
| `routers/media.py` | Gallery list, file and thumbnail retrieval, stats, delete |
| `routers/users.py`, `quotas.py`, `admin.py` | Admin: users and tags, quotas, model enable/disable |
| `routers/templates.py`, `system_prompts.py` | Saved prompts and system prompts |
| `routers/config.py`, `usage.py` | Model/feature configuration and usage status for the UI |
| `utils/config.py` | Model registry (capabilities, prices), env and admin overrides, feature flags |
| `utils/admin_config.py` | Persists admin model overrides to `data/admin-config.json` |
| `utils/database.py` | SQLite schema and migrations (`.data/app.db`) |
| `utils/user_manager.py`, `session.py`, `auth.py` | Users, bearer-token sessions (24 h), auth dependencies |
| `utils/quota_manager.py` | Per-user quotas |
| `utils/rate_limiter.py` | In-memory rate limits |
| `utils/media_storage.py`, `video_queue.py`, `video_frame_extractor.py` | Files in `.media-storage/`, async video jobs in `.video-jobs/`, first/last frame extraction |
| `utils/text_generation_manager.py`, `chat_session_manager.py`, `template_manager.py`, `system_prompt_manager.py` | Text features |
| `utils/gemini.py` | Shared Gemini client helper |

`fix_admin.py` is a standalone repair script for the admin account.

## Quotas and rate limits

- **Quotas** are per user and per type (`image`, `video`, `text`, `speech`), counted as total usage (no time-based reset). Defaults for new users are in `QuotaManager.DEFAULT_QUOTAS` (`quota_manager.py`); a quota is `limited` (with a limit) or `unlimited`. Image editing counts as `image`. Admins edit or reset them via `/api/admin/quotas/{user_id}`.
- **Rate limits** (`rate_limiter.py`, per user, in memory, reset on restart): image 10/min, speech 10/min, video 5/hour.

## Prompt templates

Templates store prompt text with `{{variable}}` placeholders per media type (text, image, video). The UI detects variables (`lib/templates/utils.ts`), renders an input per variable and fills the prompt before sending. CRUD is at `/api/text/templates`.

## Prompt Lab

A public (no login) prompting playground for lectures, active only while an admin enables it (optionally with an expiry). Code: `routers/prompt_lab.py` (public `/api/prompt-lab/config`, `/generate`; admin `/api/admin/prompt-lab`) and `utils/prompt_lab.py` (model registry with thinking-budget rules, settings, limits, stats).

- **Settings** live in the `promptLab` section of the admin config JSON (`admin_config.get_admin_section/store_admin_section`), cached in memory with an mtime check. Expired means disabled.
- **Streaming**: `/generate` is an `async def` endpoint using the async SDK (`client.aio.models.generate_content_stream`) and answers with SSE (`thought`, `answer`, `usage`, `error`, `done` events, `: ping` heartbeats). Nothing blocks the event loop or uses the sync threadpool per request (only one small SQLite stats write at the end).
- **Limits** (in memory, single process): input <= `PROMPT_LAB_MAX_INPUT_TOKENS` (local estimate, `count_tokens` only when near the limit), sliding-window rate limits per client id / IP, and a global semaphore (`PROMPT_LAB_MAX_CONCURRENCY`) with 503 after 10 s of waiting.
- **Stats**: daily aggregates in `prompt_lab_usage` (no prompt text, no IPs).

## Security notes

- Passwords are hashed; sessions are random bearer tokens stored in SQLite.
- Admin-only routes check the `is_admin` flag.
- Media endpoints require authentication and check that the requesting user may access the item.
