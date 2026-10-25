# File Guide

Where things live. For how they interact see [ARCHITECTURE.md](ARCHITECTURE.md).

## Root

| File | Purpose |
|---|---|
| `README.md`, `Changelog.md` | Overview and release history |
| `package.json`, `package-lock.json` | Frontend dependencies and scripts (`dev`, `build`, `test`, `lint`) |
| `next.config.js` | `basePath` from `NEXT_PUBLIC_BASE_PATH` (default `/HdMImageVideo`), `output: 'standalone'` |
| `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `.eslintrc.json` | Styling, TypeScript and lint config |
| `jest.config.js`, `jest.setup.js` | Frontend test setup |
| `Dockerfile`, `.dockerignore` | Frontend image (multi-stage, Next.js standalone output) |
| `docker-compose.yml` | Backend + frontend services and persistent volumes |
| `start-dev.sh`, `start-docker.sh` | Convenience launchers for local dev and Docker |

## `docs/`

| File | Purpose |
|---|---|
| `DEPLOYMENT.md` | Setup, Docker, nginx/HTTPS, troubleshooting |
| `nginx.conf.example` | Working nginx config for the subpath deployment |
| `ARCHITECTURE.md` | System overview |
| `VIDEO.md` | Video generation with Gemini Omni Flash (job flow, parameters, pricing) |
| `prd.md`, `prfaq.md` | Product requirements and PR/FAQ |

## Frontend

| Path | Purpose |
|---|---|
| `app/` | Pages: `image`, `video`, `speech`, `text`, `gallery`, `admin`, `login`, `profile`; `layout.tsx`, `providers.tsx` |
| `components/generators/` | `ImageGenerator`, `VideoGenerator`, `SpeechGenerator`, `QuotaDisplay` |
| `components/gallery/` | `MediaGallery` |
| `components/shared/` | `Header`, `LoadingSpinner`, `TemplateSelector`, `UsageDisplay` |
| `components/ui/` | `Button`, `Input`, `Textarea`, `Select`, `FileUpload`, `MultiFileUpload` |
| `lib/context/` | `AuthContext` |
| `lib/utils/` | API client and shared helpers |
| `lib/text/`, `lib/templates/` | Text-generation and template API wrappers and helpers |
| `types/` | Shared TypeScript types |
| `__tests__/` | Jest tests |

## Backend (`backend/`)

| Path | Purpose |
|---|---|
| `main.py`, `models.py` | App entry point and Pydantic models |
| `routers/` | `auth`, `admin`, `users`, `quotas`, `config`, `usage`, `image`, `video`, `speech`, `text_generation`, `templates`, `system_prompts`, `media` |
| `utils/` | Config/model registry, database, auth/session, quotas, rate limiting, media and video storage, text managers, Gemini helper |
| `fix_admin.py` | One-off script to create/reset the admin user from `.env` |
| `.env.example` | Environment variable template |
| `Dockerfile`, `.dockerignore`, `requirements.txt` | Backend image and dependencies |

## Runtime data (git-ignored)

`backend/.data/` (SQLite), `backend/.media-storage/` (media), `backend/.video-jobs/` (job queue),
`backend/data/admin-config.json` (admin model overrides).
