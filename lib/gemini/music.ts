import { MusicGenerationParams, MusicResponse } from '@/types';

/**
 * Generate music from a text description using Gemini API
 * Documentation: https://ai.google.dev/gemini-api/docs/music-generation
 * 
 * NOTE: Music generation (MusicFX/MusicLM) is not currently available in the standard Gemini API.
 * It requires Vertex AI access. This function will return an error until the model is available.
 */
export async function generateMusic(
  _params: MusicGenerationParams
): Promise<MusicResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Note: MusicLM/MusicFX models are not yet available in the standard API
  throw new Error(
    'Music generation (MusicFX) is not available with the standard Gemini API key. ' +
    'This feature requires Vertex AI access. Please check the official documentation at ' +
    'https://ai.google.dev/gemini-api/docs/music-generation for the latest availability.'
  );
}

/**
 * Extract audio data from Gemini API response
 * Currently unused but kept for potential future use when MusicFX becomes available
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractAudioFromResponse(response: any): { url?: string; base64?: string } {
  // Format 1: Direct audio URL
  if (response.audioUrl) {
    return { url: response.audioUrl };
  }

  // Format 2: Base64 encoded audio
  if (response.audioData) {
    return { base64: response.audioData };
  }

  // Format 3: Nested in result
  if (response.candidates && response.candidates[0]) {
    const candidate = response.candidates[0];
    
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.audioUrl) {
          return { url: part.audioUrl };
        }
        if (part.inlineData && part.inlineData.data) {
          return { base64: part.inlineData.data };
        }
      }
    }
  }

  // Format 4: Text response containing audio reference
  const text = response.text?.() || '';
  if (text) {
    const urlMatch = text.match(/https?:\/\/[^\s]+\.(mp3|wav|ogg|m4a)/i);
    if (urlMatch) {
      return { url: urlMatch[0] };
    }
  }

  return {};
}

