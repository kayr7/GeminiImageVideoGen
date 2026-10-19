# Veo Video Parameters

Reference for how `backend/routers/video.py` calls the Veo API (Python SDK, `google-genai`).
The SDK uses snake_case config names (`negative_prompt`, `last_frame`, `reference_images`);
the REST API of this project uses camelCase request fields (`negativePrompt`, `firstFrame`, ...).

| Input | SDK location | Notes |
|---|---|---|
| First frame | `image=` argument of `generate_videos` | Starting frame |
| Last frame | `config.last_frame` | Ending frame; combine with a first frame to interpolate |
| Reference images | `config.reference_images` (`reference_type="asset"`) | Style/content guidance, not used as frames |
| Negative prompt | `config.negative_prompt` | Things to avoid |

## Valid combinations

- first frame + last frame (interpolation)
- first frame + reference images
- reference images only
- text only

**Invalid:** last frame together with reference images (Veo returns `400 INVALID_ARGUMENT`;
the backend rejects it with a clear error and the video UI disables the conflicting inputs).

## Per-model capabilities

The source of truth is `_MODEL_REGISTRY` in `backend/utils/config.py` (exposed at
`GET /api/config`); the UI and backend validation both follow it. Currently:

| Model | Reference/frame inputs |
|---|---|
| `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001` | enabled (start and end frame) |
| `veo-3.0-fast-generate-001` | disabled |

All listed models offer durations 4/6/8 s, 720p/1080p, and 16:9 / 9:16.
Admins can enable or disable models in the admin UI or via `ENABLED_VIDEO_MODELS` / `DISABLED_VIDEO_MODELS`.

## Troubleshooting `400 INVALID_ARGUMENT`

1. `last_frame` and `reference_images` used together.
2. camelCase names passed to the SDK instead of snake_case.
3. Frame/reference inputs on a model whose capabilities disable them.

Official docs: https://ai.google.dev/gemini-api/docs/video
