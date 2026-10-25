# Gemini Image, Video, Speech & Text Platform

A teaching platform that gives students access to Google's Gemini generative models through a
managed web app: per-user accounts, quotas, a gallery of generated media, and an admin panel.

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Python FastAPI, `google-genai` SDK, SQLite
- **Deployment:** Docker Compose, served under the subpath `/HdMImageVideo`

## Features

- **Image:** Nano Banana models (2.1, 2, 2 Lite, Pro), aspect ratios, editing with reference images
- **Video:** Gemini Omni Flash with audio, 3-10 s, 360p-4K, text-to-video, image-to-video, first/last frame, reference images ([details](docs/VIDEO.md))
- **Speech:** Gemini 3.8 Flash TTS / Flash-Lite TTS
- **Text:** Gemini 3.8 Flash (default), 3.6 Flash, 3.5 Flash-Lite and 2.5 Flash text generation with history, chat sessions, system prompts and `{{variable}}` prompt templates
- **Gallery:** all generated media with thumbnails, stored on disk
- **Accounts and quotas:** admin-created users (bulk create, tags), per-user quotas for image/video/text/speech (total usage, not time-based), rate limits, admin control of which models are enabled

Available models, prices and capabilities are defined in `backend/utils/config.py` and served at `GET /api/config`.

## Prerequisites

- Docker and Docker Compose (or Python 3.11+ and Node 18+ for local development)
- A [Gemini API key](https://ai.google.dev/) with access to the models you want to offer (image and video models require a paid tier)

## Quick start

```bash
cp backend/.env.example backend/.env
# edit backend/.env: set GEMINI_API_KEY, APP_USERNAME, APP_PASSWORD

docker-compose up --build        # or ./start-docker.sh
```

- App: http://localhost:3000/HdMImageVideo (log in with `APP_USERNAME` / `APP_PASSWORD`)
- API docs: http://localhost:8000/HdMImageVideo/docs

For local development without Docker, `./start-dev.sh` starts both services.
Production setup (nginx, HTTPS, persistence, troubleshooting): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Configuration

All backend settings live in `backend/.env` (see [`backend/.env.example`](backend/.env.example)):
API key, bootstrap admin credentials, `ROOT_PATH`, `CORS_ORIGINS`, model allow/deny lists,
feature flags. Frontend `NEXT_PUBLIC_BASE_PATH` / `NEXT_PUBLIC_API_URL` are build-time values
(defaults match `docker-compose.yml`).

## API overview

All routes are under `/HdMImageVideo`. Everything except login requires `Authorization: Bearer <token>`.
Interactive docs are at `/HdMImageVideo/docs`.

| Area | Routes |
|---|---|
| Auth | `/api/auth/login`, `/logout`, `/me`, `/change-password`, `/set-password` |
| Config / usage | `/api/config`, `/api/usage/status`, `/api/admin/quotas/me/status` |
| Image | `/api/image/generate`, `/api/image/edit` |
| Video | `/api/video/generate`, `/animate`, `/status`, `/jobs` |
| Speech | `/api/speech/generate` |
| Text | `/api/text/generate`, `/history`, `/chat/sessions`, `/templates`, `/system-prompts` |
| Media | `/api/media/list`, `/stats`, `/{id}`, `/{id}/thumbnail` |
| Admin | `/api/admin/models`, `/api/admin/users`, `/api/admin/quotas/{user_id}` |

## Project layout

```
app/          Next.js pages (image, video, speech, text, gallery, admin, login, profile)
components/   React components (generators, gallery, shared, ui)
lib/          Frontend helpers (API client, auth context, text and template helpers)
types/        Shared TypeScript types
backend/      FastAPI app: main.py, models.py, routers/, utils/
docs/         Deployment, architecture, video (Omni) reference, nginx example, PRD
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Testing

```bash
npm test          # frontend (Jest)
```

## Troubleshooting

- **"GEMINI_API_KEY not found"** - create `backend/.env` and restart the backend.
- **Cannot log in as admin** - run `cd backend && python fix_admin.py` to create or reset the admin user from `.env`.
- **Video job fails with "No video was returned"** - usually a safety-policy block (e.g. real people); rephrase or use other images. See [docs/VIDEO.md](docs/VIDEO.md#troubleshooting).
- **Image request returns 422** - the model answered without an image (safety filter or a text reply to a question/greeting); the message explains why. Describe the picture you want.
- More: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#5-troubleshooting).

## Further reading

[Gemini API](https://ai.google.dev/gemini-api/docs) | [Image generation](https://ai.google.dev/gemini-api/docs/image-generation) | [Gemini Omni (video)](https://ai.google.dev/gemini-api/docs/omni) | [Changelog](Changelog.md)
