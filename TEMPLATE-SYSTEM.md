# Template System for Image & Video Generation

**Version:** 3.8.0  
**Date:** November 15, 2025  
**Status:** ✅ Complete

---

## Overview

Comprehensive template system for creating, managing, and reusing prompts across all generation types (text, image, and video). Templates support variable substitution using `{{variable}}` syntax, allowing for dynamic, reusable prompt patterns.

## Features

### Universal Template Support
- **Text Generation**: Full template support (existing)
- **Image Generation**: NEW - Template selector with variable inputs
- **Video Generation**: NEW - Template selector with variable inputs
- **Unified API**: Single backend API for all media types
- **Shared Components**: Reusable TemplateSelector component

### Variable System
- **Syntax**: `{{variableName}}` (double curly braces)
- **Dynamic Detection**: Automatically detect variables in templates
- **Auto-generated Inputs**: Input fields created for each variable
- **Real-time Filling**: Templates filled as variables are entered
- **Type-safe**: Full TypeScript support

### Template Management
- **Create**: Save current prompts as templates
- **Update**: Update existing templates with new content
- **List**: View all templates filtered by media type
- **Delete**: Remove templates (via API)
- **Select**: Choose from dropdown of saved templates

---

## Usage

### Image Generation with Templates

#### Example 1: Style Template
```
Template Name: "Vintage Portrait"
Template Text: "A {{mood}} portrait of {{subject}} in {{era}} style, 
                photographed with {{camera}}, {{lighting}} lighting"

Variables:
- mood: warm
- subject: elderly craftsman
- era: 1920s
- camera: large format camera
- lighting: soft natural

Result: "A warm portrait of elderly craftsman in 1920s style, 
         photographed with large format camera, soft natural lighting"
```

#### Example 2: Composition Template
```
Template Name: "Product Shot"
Template Text: "Professional product photography of {{product}}, 
                {{angle}} angle, {{background}} background, 
                studio lighting, 8k resolution"

Variables:
- product: vintage watch
- angle: 45-degree
- background: pure white

Result: "Professional product photography of vintage watch, 
         45-degree angle, pure white background, 
         studio lighting, 8k resolution"
```

### Video Generation with Templates

#### Example 1: Camera Movement Template
```
Template Name: "Cinematic Reveal"
Template Text: "Cinematic {{speed}} {{movement}} shot of {{subject}}, 
                starting from {{startPosition}} moving to {{endPosition}}, 
                {{timeOfDay}} lighting, {{mood}} atmosphere"

Variables:
- speed: slow
- movement: tracking
- subject: ancient temple
- startPosition: wide aerial view
- endPosition: close-up of entrance
- timeOfDay: golden hour
- mood: mysterious

Result: "Cinematic slow tracking shot of ancient temple, 
         starting from wide aerial view moving to close-up of entrance, 
         golden hour lighting, mysterious atmosphere"
```

#### Example 2: Action Template
```
Template Name: "Dynamic Action"
Template Text: "Fast-paced {{action}} sequence of {{character}}, 
                {{cameraStyle}} camera work, {{colorGrading}} color grade, 
                {{musicMood}} soundtrack feel"

Variables:
- action: parkour
- character: athletic figure
- cameraStyle: handheld
- colorGrading: high contrast
- musicMood: intense

Result: "Fast-paced parkour sequence of athletic figure, 
         handheld camera work, high contrast color grade, 
         intense soundtrack feel"
```

---

## Implementation

### Architecture

```
┌─────────────────────────────────────────────┐
│           User Interface Layer              │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ ImageGen     │  │ VideoGen     │        │
│  │ Component    │  │ Component    │        │
│  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                 │
│         └────────┬─────────┘                 │
│                  │                           │
│         ┌────────▼─────────┐                │
│         │ TemplateSelector │                │
│         │   Component      │                │
│         └────────┬─────────┘                │
└──────────────────┼──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│        Shared Template Library              │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ Template API │  │ Template     │        │
│  │ (api.ts)     │  │ Utils (utils.ts)     │
│  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼────────────────┘
          │                  │
┌─────────▼──────────────────▼────────────────┐
│          Backend API Layer                  │
│  ┌──────────────────────────────────┐      │
│  │  /api/text/templates             │      │
│  │  - GET    (list by media type)   │      │
│  │  - POST   (create)                │      │
│  │  - PUT    (update)                │      │
│  │  - DELETE (delete)                │      │
│  └──────────────────────────────────┘      │
└─────────────────────────────────────────────┘
```

### Files Created

#### Frontend
```
lib/templates/api.ts           - Template API client (70 lines)
lib/templates/utils.ts         - Variable extraction utilities (65 lines)
components/shared/TemplateSelector.tsx  - Reusable selector component (360 lines)
```

#### Integrations
```
components/generators/ImageGenerator.tsx  - Added template selector
components/generators/VideoGenerator.tsx  - Added template selector
```

---

## API Reference

### Template API Client

```typescript
import { templateAPI } from '@/lib/templates/api';

// List templates (filtered by media type)
const imageTemplates = await templateAPI.list('image');
const videoTemplates = await templateAPI.list('video');
const allTemplates = await templateAPI.list(); // No filter

// Get specific template
const template = await templateAPI.get(templateId);

// Create new template
const newTemplate = await templateAPI.create({
  name: 'My Template',
  mediaType: 'image',
  templateText: 'A {{style}} image of {{subject}}',
  variables: ['style', 'subject'],
});

// Update existing template
const updated = await templateAPI.update(templateId, {
  templateText: 'Updated: {{variable}}',
  variables: ['variable'],
});

// Delete template
await templateAPI.delete(templateId);
```

### Template Utilities

```typescript
import {
  extractVariables,
  fillTemplate,
  isTemplateFilled,
  getUnfilledVariables,
} from '@/lib/templates/utils';

// Extract variables from template text
const variables = extractVariables('Hello {{name}}, welcome to {{place}}');
// Returns: ['name', 'place']

// Fill template with values
const filled = fillTemplate('Hello {{name}}', { name: 'World' });
// Returns: 'Hello World'

// Check if all variables are filled
const isFilled = isTemplateFilled('{{a}} {{b}}', { a: '1', b: '2' });
// Returns: true

// Get list of unfilled variables
const unfilled = getUnfilledVariables('{{a}} {{b}}', { a: '1' });
// Returns: ['b']
```

---

## Component Usage

### TemplateSelector Component

```typescript
import TemplateSelector from '@/components/shared/TemplateSelector';

<TemplateSelector
  mediaType="image"              // 'text' | 'image' | 'video'
  value={prompt}                 // Current prompt text
  onChange={setPrompt}           // Callback when filled template changes
  disabled={loading}             // Disable during loading
  label="Prompt Template"        // Custom label (optional)
/>
```

**Props:**
- `mediaType`: Filter templates by type ('text', 'image', 'video')
- `value`: Current prompt text (controlled component)
- `onChange`: Called with filled template text
- `disabled`: Disable all interactions (default: false)
- `label`: Custom label for selector (default: 'Prompt Template')

**Features:**
- Automatic template loading
- Dynamic variable input generation
- Save/Update modal dialogs
- Template clearing
- Error handling
- Loading states

---

## User Workflow

### Creating a Template

1. **Write your prompt** in the prompt textarea
2. **Include variables** using `{{variableName}}` syntax
3. **Click "💾 Save as New Template"**
4. **Enter template name** in modal
5. **Click "Save"**
6. Template is now available in dropdown

### Using a Template

1. **Select template** from dropdown
2. **Fill in variable values** in auto-generated input fields
3. **Watch prompt auto-fill** in real-time
4. **Generate** image/video with filled prompt
5. **Adjust variables** as needed for variations

### Updating a Template

1. **Select existing template** from dropdown
2. **Modify the prompt** or variables
3. **Click "✏️ Update Current Template"**
4. **Confirm update** in modal
5. Template is updated for future use

---

## Examples

### Image Template Library

```
1. Portrait Photography
   "Professional portrait of {{subject}}, {{style}} style, 
    {{lighting}} lighting, shot with {{lens}}"

2. Landscape Scene
   "Stunning {{timeOfDay}} landscape of {{location}}, 
    {{weather}} weather, {{season}} season, 
    captured with {{technique}}"

3. Abstract Art
   "Abstract {{style}} artwork featuring {{elements}}, 
    {{colorPalette}} color palette, {{mood}} mood"

4. Product Photography
   "Commercial product shot of {{product}}, 
    {{angle}} angle, {{background}}, 
    professional studio lighting"
```

### Video Template Library

```
1. Nature Documentary
   "{{speed}} documentary-style footage of {{subject}} 
    in {{habitat}}, {{movement}} camera movement, 
    {{narration}} narration style"

2. Action Sequence
   "Fast-paced {{action}} sequence, {{character}}, 
    {{cameraStyle}} cinematography, 
    {{intensity}} intensity level"

3. Time-lapse
   "{{duration}} time-lapse of {{subject}}, 
    from {{start}} to {{end}}, 
    {{frameRate}} frame rate"

4. Establishing Shot
   "Cinematic establishing shot of {{location}}, 
    {{time}} time of day, {{weather}}, 
    {{cameraMovement}} camera movement"
```

---

## Best Practices

### Template Design

1. **Use Descriptive Names**: Make templates easy to find
   - ✅ "Portrait - Natural Light"
   - ❌ "Template 1"

2. **Meaningful Variables**: Use clear variable names
   - ✅ `{{lightingStyle}}`
   - ❌ `{{var1}}`

3. **Provide Context**: Include context in template text
   - ✅ "A {{mood}} portrait of {{subject}}"
   - ❌ "{{mood}} {{subject}}"

4. **Keep It Flexible**: Balance specificity with reusability
   - ✅ "{{style}} architecture of {{building}}"
   - ❌ "Modern minimalist architecture of the Chrysler building"

### Variable Naming

- Use **camelCase** for consistency: `{{cameraAngle}}`
- Be **descriptive**: `{{backgroundType}}` not `{{bg}}`
- Avoid **special characters**: Use letters and numbers only
- Keep **reasonable length**: `{{var}}` not `{{thisIsAVeryLongVariableName}}`

### Template Organization

- **Group by purpose**: Product shots, portraits, landscapes
- **Version templates**: "Portrait V1", "Portrait V2"
- **Document variables**: Keep a list of common variables
- **Share with team**: Export and import template collections

---

## Troubleshooting

### Issue: Variables not detected
**Solution**: Ensure variables use double curly braces `{{variable}}`

### Issue: Template not filling
**Solution**: Check that all variable values are entered

### Issue: Template not saving
**Solution**: Check authentication and network connection

### Issue: Template list not loading
**Solution**: Refresh page, check API connection

---

## Performance

- **Template Loading**: <100ms (typical)
- **Variable Extraction**: <1ms (regex-based)
- **Template Filling**: <1ms (per variable)
- **UI Rendering**: Instant (React optimized)

---

## Security

- **User Isolation**: Templates are user-specific (userId)
- **Validation**: Server-side validation of all fields
- **Sanitization**: Inputs sanitized before storage
- **Authentication**: Requires valid auth token

---

## Future Enhancements

### Planned Features
1. **Template Sharing**: Share templates with other users
2. **Template Collections**: Organize templates into folders
3. **Import/Export**: Save templates to JSON files
4. **Variable Presets**: Common variable value presets
5. **Template Versioning**: Track template history
6. **Search & Filter**: Advanced template search
7. **Usage Analytics**: Track which templates are most used
8. **AI Suggestions**: Suggest variables based on prompt

---

## Changelog

### Version 3.8.0 (2025-11-15)
- ✅ Extended templates to image generation
- ✅ Extended templates to video generation
- ✅ Created shared TemplateSelector component
- ✅ Moved utilities to shared location
- ✅ Added save/update modals
- ✅ Full TypeScript support

### Version 3.5.0 (2025-11-14)
- Initial template system for text generation

---

**Status**: ✅ Feature Complete  
**Version**: 3.8.0  
**Last Updated**: November 15, 2025

