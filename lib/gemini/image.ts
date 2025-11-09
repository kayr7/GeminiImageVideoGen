import { ImageGenerationParams, ImageResponse } from '@/types';
import { getGeminiClient } from './client';
import { CONSTANTS } from '../utils/constants';
import { retryWithBackoff } from '../utils/errors';
import { getMediaStorage } from '../storage/media-storage';

/**
 * Generate an image from a text prompt using Gemini API
 * Documentation: https://ai.google.dev/gemini-api/docs/image-generation
 */
export async function generateImage(
  params: ImageGenerationParams
): Promise<ImageResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Determine if it's Nano Banana (uses generateContent) or Imagen (uses predict)
  const isNanoBanana = params.model === CONSTANTS.MODELS.IMAGE.NANO_BANANA.id;
  const modelName = params.model || CONSTANTS.MODELS.IMAGE.IMAGEN_4.id;

  try {
    return await retryWithBackoff(async () => {
      if (isNanoBanana) {
        // Nano Banana uses the generateContent method
        // Documentation: https://ai.google.dev/gemini-api/docs/image-generation
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        
        // Build parts array with text prompt first
        const parts: any[] = [{
          text: params.prompt
        }];

        // Add reference images if provided (for multi-image composition/style transfer)
        const imagesToProcess = params.referenceImages || (params.referenceImage ? [params.referenceImage] : []);
        for (const imageData of imagesToProcess) {
          // Extract base64 data (remove data URL prefix if present)
          const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          });
        }
        
        const requestBody: any = {
          contents: [{
            parts
          }],
          generationConfig: {
            responseModalities: ['Image'] // Capital I is required
          }
        };

        // Add aspect ratio if specified
        if (params.aspectRatio) {
          requestBody.generationConfig.imageConfig = {
            aspectRatio: params.aspectRatio
          };
        }

        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || 
            `Image generation failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        
        // Extract image from Nano Banana response
        if (data.candidates && data.candidates[0]?.content?.parts) {
          const imagePart = data.candidates[0].content.parts.find((p: any) => p.inlineData);
          if (imagePart?.inlineData?.data) {
            const imageBase64 = imagePart.inlineData.data;
            
            // Save image to disk
            const storage = getMediaStorage();
            const mediaId = storage.saveMedia('image', imageBase64, {
              prompt: params.prompt,
              model: modelName,
              userId: 'anonymous',
              mimeType: 'image/png',
            });

            console.log(`Image saved with ID: ${mediaId}`);

            return {
              imageUrl: `data:image/png;base64,${imageBase64}`,
              imageData: imageBase64,
              prompt: params.prompt,
              model: modelName,
              generatedAt: new Date(),
              mediaId,
            };
          }
        }
      } else {
        // Imagen uses the predict method
        // Documentation: https://ai.google.dev/gemini-api/docs/imagen
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`;
        
        const requestBody: any = {
          instances: [{
            prompt: params.prompt,
          }],
          parameters: {
            sampleCount: params.numberOfImages || 1,
            aspectRatio: params.aspectRatio || '1:1',
          }
        };

        if (params.negativePrompt) {
          requestBody.instances[0].negativePrompt = params.negativePrompt;
        }

        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || 
            `Image generation failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        
        // Extract image from Imagen response
        if (data.predictions && data.predictions[0]) {
          const imageBase64 = data.predictions[0].bytesBase64Encoded || data.predictions[0].image;
          if (imageBase64) {
            // Save image to disk
            const storage = getMediaStorage();
            const mediaId = storage.saveMedia('image', imageBase64, {
              prompt: params.prompt,
              model: modelName,
              userId: 'anonymous',
              mimeType: 'image/png',
            });

            console.log(`Image saved with ID: ${mediaId}`);

            return {
              imageUrl: `data:image/png;base64,${imageBase64}`,
              imageData: imageBase64,
              prompt: params.prompt,
              model: modelName,
              generatedAt: new Date(),
              mediaId,
            };
          }
        }
      }

      throw new Error('No image data in response');
    });
  } catch (error) {
    const client = getGeminiClient();
    return client.handleGeminiError(error);
  }
}

/**
 * Edit an existing image with a text prompt
 * Documentation: https://ai.google.dev/gemini-api/docs/image-generation
 */
export async function editImage(
  params: ImageGenerationParams & { maskImage?: string }
): Promise<ImageResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use Nano Banana by default for editing (better for conversational editing)
  const isNanoBanana = params.model === CONSTANTS.MODELS.IMAGE.NANO_BANANA.id || !params.model;
  const modelName = params.model || CONSTANTS.MODELS.IMAGE.NANO_BANANA.id;

  try {
    return await retryWithBackoff(async () => {
      if (isNanoBanana) {
        // Nano Banana image editing with text + image(s)
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        
        // Build parts array with text prompt first
        const parts: any[] = [{
          text: params.prompt
        }];

        // Add reference images (supports multiple for composition/style transfer)
        const imagesToProcess = params.referenceImages || (params.referenceImage ? [params.referenceImage] : []);
        for (const imageData of imagesToProcess) {
          // Extract base64 data (remove data URL prefix if present)
          const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          });
        }

        const requestBody: any = {
          contents: [{
            parts
          }],
          generationConfig: {
            responseModalities: ['Image']
          }
        };

        // Add aspect ratio if specified
        if (params.aspectRatio) {
          requestBody.generationConfig.imageConfig = {
            aspectRatio: params.aspectRatio
          };
        }

        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || 
            `Image editing failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        
        // Extract image from response
        if (data.candidates && data.candidates[0]?.content?.parts) {
          const imagePart = data.candidates[0].content.parts.find((p: any) => p.inlineData);
          if (imagePart?.inlineData?.data) {
            const imageBase64 = imagePart.inlineData.data;
            
            // Save image to disk
            const storage = getMediaStorage();
            const mediaId = storage.saveMedia('image', imageBase64, {
              prompt: params.prompt,
              model: modelName,
              userId: 'anonymous',
              mimeType: 'image/png',
            });

            console.log(`Edited image saved with ID: ${mediaId}`);

            return {
              imageUrl: `data:image/png;base64,${imageBase64}`,
              imageData: imageBase64,
              prompt: params.prompt,
              model: modelName,
              generatedAt: new Date(),
              mediaId,
            };
          }
        }
      } else {
        // Imagen editing (for Imagen models)
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict`;
        
        const requestBody: any = {
          instances: [{
            prompt: params.prompt,
            image: {
              bytesBase64Encoded: params.referenceImage?.includes(',')
                ? params.referenceImage.split(',')[1]
                : params.referenceImage,
            },
          }],
          parameters: {
            sampleCount: 1,
            mode: 'edit',
          }
        };

        if (params.maskImage) {
          requestBody.instances[0].mask = {
            bytesBase64Encoded: params.maskImage
          };
        }

        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message || 
            `Image editing failed: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        
        if (data.predictions && data.predictions[0]) {
          const imageBase64 = data.predictions[0].bytesBase64Encoded || data.predictions[0].image;
          if (imageBase64) {
            // Save image to disk
            const storage = getMediaStorage();
            const mediaId = storage.saveMedia('image', imageBase64, {
              prompt: params.prompt,
              model: modelName,
              userId: 'anonymous',
              mimeType: 'image/png',
            });

            console.log(`Edited image saved with ID: ${mediaId}`);

            return {
              imageUrl: `data:image/png;base64,${imageBase64}`,
              imageData: imageBase64,
              prompt: params.prompt,
              model: modelName,
              generatedAt: new Date(),
              mediaId,
            };
          }
        }
      }

      throw new Error('No image data in response');
    });
  } catch (error) {
    const client = getGeminiClient();
    return client.handleGeminiError(error);
  }
}

/**
 * Transform an image based on a reference image style
 */
export async function imageToImage(
  params: ImageGenerationParams
): Promise<ImageResponse> {
  // Image-to-image is essentially generation with a reference
  return generateImage({
    ...params,
    referenceImage: params.referenceImage,
  });
}

/**
 * Extract image data from Gemini API response
 * Note: This is a simplified implementation
 * The actual response format may vary
 * Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractImageFromResponse(response: any): { url?: string; base64?: string } {
  // Try to extract from various possible response formats
  
  // Format 1: Direct image URL
  if (response.imageUrl) {
    return { url: response.imageUrl };
  }

  // Format 2: Base64 encoded image
  if (response.imageData) {
    return { base64: response.imageData };
  }

  // Format 3: Nested in result
  if (response.candidates && response.candidates[0]) {
    const candidate = response.candidates[0];
    
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return { base64: part.inlineData.data };
        }
      }
    }
  }

  // Format 4: Text response containing image reference
  // This might happen with some Gemini models
  const text = response.text?.() || '';
  if (text) {
    // Try to extract URL or base64 from text
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return { url: urlMatch[0] };
    }
  }

  // If we can't extract image data, return empty
  // The calling code should handle this appropriately
  return {};
}

