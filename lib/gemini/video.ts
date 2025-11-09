import { VideoGenerationParams, VideoResponse } from '@/types';
import { getGeminiClient } from './client';
import { retryWithBackoff } from '../utils/errors';
import { getMediaStorage } from '../storage/media-storage';

/**
 * Generate a video from a text prompt using Gemini API
 * Documentation: https://ai.google.dev/gemini-api/docs/video
 */
export async function generateVideo(
  params: VideoGenerationParams
): Promise<VideoResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use the model ID directly from params
  const modelName = params.model || 'veo-3.1-fast-generate-preview';

  try {
    return await retryWithBackoff(async () => {
      // Start the video generation operation
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning`;
      
      // Based on the official documentation, Veo only accepts the prompt
      // Duration is fixed by the model (8s for Veo 3.1)
      const requestBody = {
        instances: [{
          prompt: params.prompt,
        }],
      };

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
          `Video generation failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      // Return operation info for polling
      if (data.name) {
        return {
          jobId: data.name,
          status: 'processing',
          progress: 0,
          generatedAt: new Date(),
        } as VideoResponse;
      }

      throw new Error('No operation ID in response');
    });
  } catch (error) {
    const client = getGeminiClient();
    return client.handleGeminiError(error);
  }
}

/**
 * Animate a still image into a video
 * Documentation: https://ai.google.dev/gemini-api/docs/video
 */
export async function animateImage(
  params: VideoGenerationParams
): Promise<VideoResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Use the model ID directly from params
  const modelName = params.model || 'veo-3.1-fast-generate-preview';

  try {
    return await retryWithBackoff(async () => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning`;
      
      // Based on the official documentation, Veo accepts prompt and image(s)
      // Duration is fixed by the model (8s for Veo 3.1)
      // Note: For multiple images, use the first one as primary (Veo may not support multi-image yet)
      const imagesToProcess = params.sourceImages || (params.sourceImage ? [params.sourceImage] : []);
      const primaryImage = imagesToProcess[0];
      
      if (!primaryImage) {
        throw new Error('At least one source image is required for video animation');
      }

      // Extract base64 data and MIME type (remove data URL prefix if present)
      let base64Data = primaryImage;
      let mimeType = 'image/png'; // Default MIME type
      
      if (primaryImage.includes(',')) {
        const parts = primaryImage.split(',');
        base64Data = parts[1];
        // Extract MIME type from data URL (e.g., "data:image/jpeg;base64" -> "image/jpeg")
        const dataUrlPrefix = parts[0];
        const mimeMatch = dataUrlPrefix.match(/data:([^;]+)/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
      }

      const requestBody = {
        instances: [{
          prompt: params.prompt || 'Animate this image with smooth motion',
          image: {
            bytesBase64Encoded: base64Data,
            mimeType: mimeType,
          },
        }],
      };

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
          `Video animation failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      if (data.name) {
        return {
          jobId: data.name,
          status: 'processing',
          progress: 0,
          generatedAt: new Date(),
        } as VideoResponse;
      }

      throw new Error('No operation ID in response');
    });
  } catch (error) {
    const client = getGeminiClient();
    return client.handleGeminiError(error);
  }
}

/**
 * Check the status of a video generation job and download when ready
 * Documentation: https://ai.google.dev/gemini-api/docs/video
 */
export async function checkVideoStatus(jobId: string): Promise<VideoResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  try {
    return await retryWithBackoff(async () => {
      // Poll the operation status
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/${jobId}`;
      
      const response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || 
          `Status check failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      // Check if operation is complete
      if (data.done === true) {
        // Log response structure for debugging
        console.log('Video operation completed. Response structure:', JSON.stringify(data, null, 2));
        
        // Try multiple possible response paths for video URI
        let videoUri = null;
        
        // Path 1: generateVideoResponse format
        videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        
        // Path 2: Direct predictions format (similar to image generation)
        if (!videoUri && data.response?.predictions) {
          videoUri = data.response.predictions[0]?.uri || 
                     data.response.predictions[0]?.video?.uri ||
                     data.response.predictions[0]?.videoUri;
        }
        
        // Path 3: Direct response format
        if (!videoUri && data.response) {
          videoUri = data.response.uri || 
                     data.response.video?.uri ||
                     data.response.videoUri ||
                     data.response.generatedVideo?.uri;
        }
        
        // Path 4: Check if video data is embedded directly
        if (!videoUri && data.response?.predictions?.[0]?.bytesBase64Encoded) {
          const videoBase64 = data.response.predictions[0].bytesBase64Encoded;
          
          // Save video to disk
          const storage = getMediaStorage();
          const mediaId = storage.saveMedia('video', videoBase64, {
            prompt: 'Video generation',
            model: 'veo',
            userId: 'anonymous',
            mimeType: 'video/mp4',
          });

          console.log(`Video saved with ID: ${mediaId}`);

          return {
            videoUrl: `data:video/mp4;base64,${videoBase64}`,
            videoData: videoBase64,
            jobId,
            status: 'completed',
            progress: 100,
            generatedAt: new Date(),
            mediaId,
          } as VideoResponse;
        }
        
        if (videoUri) {
          // Download the video content
          const videoResponse = await fetch(videoUri, {
            headers: {
              'x-goog-api-key': apiKey,
            },
          });

          if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.status}`);
          }

          // Convert to base64
          const videoBuffer = await videoResponse.arrayBuffer();
          const videoBase64 = Buffer.from(videoBuffer).toString('base64');

          // Save video to disk
          const storage = getMediaStorage();
          const mediaId = storage.saveMedia('video', videoBase64, {
            prompt: 'Video generation', // We don't have the prompt here, could be passed via job metadata
            model: 'veo',
            userId: 'anonymous',
            mimeType: 'video/mp4',
          });

          console.log(`Video saved with ID: ${mediaId}`);

          return {
            videoUrl: `data:video/mp4;base64,${videoBase64}`,
            videoData: videoBase64,
            jobId,
            status: 'completed',
            progress: 100,
            generatedAt: new Date(),
            mediaId, // Include media ID for later retrieval
          } as VideoResponse;
        }
        
        // Check for safety filter / content moderation issues
        const generateVideoResponse = data.response?.generateVideoResponse;
        if (generateVideoResponse) {
          // Check for RAI (Responsible AI) filtered content
          if (generateVideoResponse.raiMediaFilteredCount > 0 && generateVideoResponse.raiMediaFilteredReasons) {
            const reasons = generateVideoResponse.raiMediaFilteredReasons.join('\n\n');
            throw new Error(`Video generation was filtered by safety policies:\n\n${reasons}`);
          }
          
          // Check for other generation errors
          if (generateVideoResponse.error) {
            throw new Error(`Video generation error: ${generateVideoResponse.error.message || 'Unknown error'}`);
          }
        }
        
        // Check for general API error
        if (data.error) {
          throw new Error(data.error.message || 'Video generation failed');
        }
        
        // If we get here, the operation completed but no video was generated
        // Log full response for debugging
        console.error('Unable to find video URI in completed response:', JSON.stringify(data, null, 2));
        throw new Error('No video was generated. The operation completed but no video URI was found in the response. This may indicate an API issue or unsupported operation. Check server logs for full response details.');
      }
      
      // Still processing
      return {
        jobId,
        status: 'processing',
        progress: 50, // We don't get actual progress from the API
        generatedAt: new Date(),
      } as VideoResponse;
    });
  } catch (error) {
    const client = getGeminiClient();
    return client.handleGeminiError(error);
  }
}

/**
 * Extract video data from Gemini API response
 * Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractVideoFromResponse(response: any): { 
  url?: string; 
  base64?: string; 
  jobId?: string 
} {
  // Format 1: Direct video URL
  if (response.videoUrl) {
    return { url: response.videoUrl };
  }

  // Format 2: Job ID for async processing
  if (response.jobId || response.operationId) {
    return { jobId: response.jobId || response.operationId };
  }

  // Format 3: Base64 encoded video
  if (response.videoData) {
    return { base64: response.videoData };
  }

  // Format 4: Nested in result
  if (response.candidates && response.candidates[0]) {
    const candidate = response.candidates[0];
    
    if (candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.videoUrl) {
          return { url: part.videoUrl };
        }
        if (part.inlineData && part.inlineData.data) {
          return { base64: part.inlineData.data };
        }
      }
    }
  }

  // Format 5: Text response containing video reference
  const text = response.text?.() || '';
  if (text) {
    const urlMatch = text.match(/https?:\/\/[^\s]+\.(mp4|webm|mov)/i);
    if (urlMatch) {
      return { url: urlMatch[0] };
    }
  }

  return {};
}

