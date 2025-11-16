# Veo 3.1 API Parameters Guide

## Overview

This document explains the correct usage of image parameters in the Google Veo 3.1 video generation API, including important limitations and valid parameter combinations.

## Key Parameters

### 1. First Frame (`image` parameter)
- **Purpose**: Specifies the starting frame of the video
- **Location**: Top-level parameter in `generate_videos()` call
- **Usage**: `client.models.generate_videos(model="veo-3.1-generate-preview", prompt="...", image=first_frame)`
- **Best used with**: `last_frame` for frame interpolation

### 2. Last Frame (`config.last_frame`)
- **Purpose**: Specifies the ending frame of the video
- **Location**: Inside `GenerateVideosConfig`
- **Usage**: `config=types.GenerateVideosConfig(last_frame=last_frame_image)`
- **Best used with**: `image` (first frame) for smooth interpolation

### 3. Reference Images (`config.reference_images`)
- **Purpose**: Guides the visual style and content (not used as actual frames)
- **Location**: Inside `GenerateVideosConfig`
- **Usage**: 
  ```python
  config=types.GenerateVideosConfig(
      reference_images=[
          types.VideoGenerationReferenceImage(
              image=img1,
              reference_type="asset"
          ),
          # ... up to 3 images total
      ]
  )
  ```
- **Maximum**: 3 reference images
- **Reference Type**: Use `"asset"` for style/content guidance

### 4. Negative Prompt (`config.negative_prompt`)
- **Purpose**: Specifies elements to avoid in the generated video
- **Location**: Inside `GenerateVideosConfig`
- **Usage**: `config=types.GenerateVideosConfig(negative_prompt="watermark, logo, text")`

## Critical Limitation: Mutual Exclusivity

**⚠️ You CANNOT combine `last_frame` with `reference_images`**

The Veo API will return `400 INVALID_ARGUMENT` if you try to use both together.

However, you **CAN** combine `image` (first frame) with `reference_images`.

### Valid Combinations

#### Pattern 1: Frame Interpolation
```python
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="A beautiful sunset...",
    image=first_frame,  # Starting frame
    config=types.GenerateVideosConfig(
        last_frame=last_frame,  # Ending frame
        negative_prompt="watermark, text"
    )
)
```

#### Pattern 2: Style-Guided Video from Starting Frame
```python
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="A beautiful sunset...",
    image=first_frame,  # Starting frame ✅ Can use with reference_images
    config=types.GenerateVideosConfig(
        reference_images=[
            types.VideoGenerationReferenceImage(
                image=style_img1,
                reference_type="asset"
            ),
            types.VideoGenerationReferenceImage(
                image=style_img2,
                reference_type="asset"
            ),
        ],
        negative_prompt="watermark, text"
    )
)
```

#### Pattern 3: Style Guidance Only
```python
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="A beautiful sunset...",
    # No image parameter
    config=types.GenerateVideosConfig(
        reference_images=[
            types.VideoGenerationReferenceImage(
                image=style_img1,
                reference_type="asset"
            ),
        ],
        negative_prompt="watermark, text"
    )
)
```

### Invalid Combination ❌
```python
# THIS WILL FAIL WITH 400 INVALID_ARGUMENT
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="A beautiful sunset...",
    image=first_frame,  # ✅ OK
    config=types.GenerateVideosConfig(
        last_frame=last_frame,  # ❌ Cannot use with reference_images
        reference_images=[...],  # ❌ Cannot use with last_frame
    )
)
```

## Model Compatibility

### Standard Models (Full Features)
- `veo-3.1-generate-preview`
- `veo-3.0-generate-001`

**Supports**:
- ✅ First frame (`image`)
- ✅ Last frame (`last_frame`)
- ✅ Reference images (`reference_images`)
- ✅ Negative prompt (`negative_prompt`)

### Fast Models (Limited Features)
- `veo-3.1-fast-generate-preview`
- `veo-3.0-fast-generate-001`

**Supports**:
- ✅ Negative prompt (`negative_prompt`)
- ❌ First frame
- ❌ Last frame
- ❌ Reference images

## Parameter Naming Convention

**Important**: The Python SDK uses **snake_case** for all parameters:
- ✅ `negative_prompt` (correct)
- ❌ `negativePrompt` (incorrect - will cause INVALID_ARGUMENT)
- ✅ `last_frame` (correct)
- ❌ `lastFrame` (incorrect - will cause INVALID_ARGUMENT)
- ✅ `reference_images` (correct)
- ❌ `referenceImages` (incorrect - will cause INVALID_ARGUMENT)

## Implementation in This Project

### Backend (`backend/routers/video.py`)
- Validates parameter combinations before API call
- Returns clear 400 error if incompatible parameters are used
- Uses correct snake_case naming for all config parameters
- Sets `reference_type="asset"` for reference images

### Frontend (`components/generators/VideoGenerator.tsx`)
- Disables first frame input when reference images are selected
- Disables reference images input when first frame is selected
- Shows visual warning if both are selected
- Provides clear helper text explaining the limitation

## References

- [Official Veo 3.1 Documentation](https://ai.google.dev/gemini-api/docs/video)
- [Frame-specific generation example](https://ai.google.dev/gemini-api/docs/video?example=dialogue#frame-specific_generation)
- [Image-based direction example](https://ai.google.dev/gemini-api/docs/video?example=dialogue#image-based_direction)

## Troubleshooting

### Error: `400 INVALID_ARGUMENT`
**Possible causes**:
1. Using `last_frame` and `reference_images` together → Remove one (you can keep `image` + `reference_images`)
2. Using camelCase instead of snake_case → Use `negative_prompt`, not `negativePrompt`
3. Using advanced features on fast model → Switch to standard model
4. Invalid `reference_type` → Use `"asset"` for reference images

### Error: Feature not working
**Check**:
1. Are you using a standard model (not fast)?
2. Are parameter names in snake_case?
3. Are you combining incompatible parameters?

## Version History

- **v3.8.1** (2025-11-16): Fixed API parameter naming and added reference images support with proper validation
- **v3.7.0** (2025-11-15): Initial implementation of first/last frame extraction

