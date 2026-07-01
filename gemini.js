/**
 * gemini.js
 * Handles all Gemini API communication for AI image generation.
 *
 * Supported models for image generation (responseModalities: IMAGE):
 *   - gemini-2.0-flash-preview-image-generation  (preview, may deprecate)
 *   - gemini-2.0-flash-exp-image-generation       (experimental)
 *
 * Set GEMINI_MODEL in config.js to switch models.
 */

const GeminiAPI = (() => {
  // Image generation requires a dedicated image-generation model
  // NOT the regular chat models (gemini-2.5-flash, gemini-2.0-flash, etc.)
  const getEndpoint = () => {
    const model = CONFIG.GEMINI_MODEL || 'gemini-2.0-flash-preview-image-generation';
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  };

  const TIMEOUT_MS = 60000; // 60s — image gen can be slow

  /**
   * Build the prompt text for the Gemini image generation request.
   * @param {string} jobText — the user's dream job
   */
  function buildPrompt(jobText) {
    return (
      `Create a cinematic, photorealistic portrait of this exact person working as a ${jobText}. ` +
      `Keep their face, skin tone, and features identical to the photo. ` +
      `Place them in an atmospheric, professionally lit environment that fits the career. ` +
      `Style: editorial photography, warm cinematic lighting, shallow depth of field. ` +
      `Not cartoon, not illustration, not painting. ` +
      `Do not add any text, watermarks, or overlays. Portrait orientation.`
    );
  }

  /**
   * Generate an AI portrait image using Gemini.
   * @param {string} photoBase64      — base64 JPEG of the captured webcam photo (no data: prefix)
   * @param {string|null} jobText     — the user's dream job text (keyboard mode)
   * @param {string|null} jobCanvasBase64 — base64 PNG of handwritten job canvas (touch/airwrite mode)
   * @returns {Promise<{base64: string, mimeType: string}>}
   */
  async function generateImage(photoBase64, jobText, jobCanvasBase64 = null) {
    if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === 'YOUR_KEY_HERE') {
      throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in config.js.');
    }

    // Build the parts array — always start with the person's photo
    const parts = [
      {
        inline_data: {
          mime_type: 'image/jpeg',
          data: photoBase64,
        },
      },
    ];

    // If handwritten job canvas is provided, attach it and tell Gemini to read it
    if (jobCanvasBase64) {
      parts.push({
        inline_data: {
          mime_type: 'image/png',
          data: jobCanvasBase64,
        },
      });
      parts.push({
        text:
          'The second image contains handwritten text showing the person\'s dream job. ' +
          'Read that handwritten text carefully to understand the career. ' +
          'Then create a cinematic, photorealistic portrait of the person from the FIRST image in that career. ' +
          'Keep their face, skin tone, and features identical to the first photo. ' +
          'Place them in an atmospheric, professionally lit environment that fits the career. ' +
          'Style: editorial photography, warm cinematic lighting, shallow depth of field. ' +
          'Not cartoon, not illustration, not painting. ' +
          'Do not add any text, watermarks, or overlays. Portrait orientation.',
      });
    } else {
      // Keyboard mode — use text prompt directly
      parts.push({ text: buildPrompt(jobText || 'professional') });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };

    // Wrap fetch in a timeout race
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      const url = `${getEndpoint()}?key=${CONFIG.GEMINI_API_KEY}`;
      console.log('[Gemini] Calling:', url.replace(CONFIG.GEMINI_API_KEY, '***'));

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      // Log full error so we can debug it
      console.error('[Gemini] API error', response.status, errorText);
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Gemini] Response received. Parsing...');

    // Parse response — find the image part
    const responseParts = data?.candidates?.[0]?.content?.parts;
    if (!responseParts || !Array.isArray(responseParts)) {
      console.error('[Gemini] Unexpected response structure:', JSON.stringify(data));
      throw new Error('Unexpected Gemini response structure — no content parts found.');
    }

    const imagePart = responseParts.find(
      (p) => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('image/')
    );

    if (!imagePart) {
      console.error('[Gemini] No image in response. Parts received:', JSON.stringify(responseParts));
      throw new Error('Gemini response contained no image data. The model may not support image output, check your model name in config.js.');
    }

    console.log('[Gemini] Image received! MIME:', imagePart.inlineData.mimeType);
    return {
      base64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    };
  }

  return { generateImage };
})();
