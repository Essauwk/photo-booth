/**
 * compositor.js
 * Builds the final 1080×1920 composited photo booth frame.
 *
 * Layout:
 *   - #0A0A0A background + radial gradient overlay
 *   - Logo: centered, ~200px wide, 80px from top
 *   - AI image: ~1000×1200px, centered horizontally, starting ~200px from top
 *   - Gold divider: 20px below image
 *   - Job text: Cormorant Garamond 42px gold, centered
 *   - Signature: right-aligned, ~220px wide, opacity 0.9
 *   - Copyright: bottom-left, Inter 18px, white-dim
 *
 * Returns: data URL (PNG) of the completed 1080×1920 frame
 */

const Compositor = (() => {
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;

  /**
   * Load an image from a base64 data URL or data URI string.
   * @param {string} src — full data URI or URL
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
      img.src = src;
    });
  }

  /**
   * Composite all elements onto a 1080×1920 canvas.
   *
   * @param {string} aiImageBase64    — raw base64 of AI-generated image
   * @param {string} aiMimeType       — mime type e.g. "image/png"
   * @param {string} signatureDataURL — data URL of the signature canvas
   * @param {string} logoSrc          — URL/path to logo image
   * @returns {Promise<string>}       — data URL (PNG) of composited 1080×1920 image
   */
  async function composite(aiImageBase64, aiMimeType, signatureDataURL, logoSrc) {
    const canvas = document.getElementById('capture-canvas');
    const offscreen = document.createElement('canvas');
    offscreen.width = CANVAS_W;
    offscreen.height = CANVAS_H;
    const ctx = offscreen.getContext('2d');

    // Helper: Draw rounded rect
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // ── 1. Background (The Frame) ─────────────────────────────────
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle texture/gradient for the frame
    const grad = ctx.createRadialGradient(
      CANVAS_W / 2, CANVAS_H / 2, 0,
      CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.8
    );
    grad.addColorStop(0, '#151515');
    grad.addColorStop(1, '#050505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Outer Gold Border for the whole print
    ctx.strokeStyle = '#C9A84C';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, CANVAS_W - 40, CANVAS_H - 40);

    // ── 2. Logo (Top Center) ──────────────────────────────────────
    try {
      const logoImg = await loadImage(logoSrc);
      const logoW = 240;
      const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW;
      const logoX = (CANVAS_W - logoW) / 2;
      const logoY = 80;
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
    } catch (e) {
      ctx.fillStyle = '#C9A84C';
      ctx.font = '500 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ARTECH', CANVAS_W / 2, 130);
    }

    // ── 3. AI Image (Inside the Frame) ────────────────────────────
    const aiImgSrc = `data:${aiMimeType};base64,${aiImageBase64}`;
    const aiImg = await loadImage(aiImgSrc);

    // Make the AI image fill much more of the frame
    const aiTargetW = 960;
    const aiTargetH = 1480;
    const aiX = (CANVAS_W - aiTargetW) / 2; // 60
    const aiY = 170;

    // Draw image cover-fit inside aiTargetW x aiTargetH
    const srcAspect = aiImg.naturalWidth / aiImg.naturalHeight;
    const dstAspect = aiTargetW / aiTargetH;

    let sx, sy, sw, sh;
    if (srcAspect > dstAspect) {
      sh = aiImg.naturalHeight;
      sw = sh * dstAspect;
      sx = (aiImg.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = aiImg.naturalWidth;
      sh = sw / dstAspect;
      sx = 0;
      sy = (aiImg.naturalHeight - sh) / 2;
    }

    ctx.drawImage(aiImg, sx, sy, sw, sh, aiX, aiY, aiTargetW, aiTargetH);

    // Inner gold border around the AI image
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(aiX, aiY, aiTargetW, aiTargetH);

    // ── 4. Frame Decorations ──────────────────────────────────────
    // Draw decorative corner brackets around the AI image
    const cornerSize = 40;
    const cornerOffset = 10;
    ctx.strokeStyle = '#C9A84C';
    ctx.lineWidth = 4;
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(aiX - cornerOffset, aiY - cornerOffset + cornerSize);
    ctx.lineTo(aiX - cornerOffset, aiY - cornerOffset);
    ctx.lineTo(aiX - cornerOffset + cornerSize, aiY - cornerOffset);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(aiX + aiTargetW + cornerOffset - cornerSize, aiY - cornerOffset);
    ctx.lineTo(aiX + aiTargetW + cornerOffset, aiY - cornerOffset);
    ctx.lineTo(aiX + aiTargetW + cornerOffset, aiY - cornerOffset + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(aiX - cornerOffset, aiY + aiTargetH + cornerOffset - cornerSize);
    ctx.lineTo(aiX - cornerOffset, aiY + aiTargetH + cornerOffset);
    ctx.lineTo(aiX - cornerOffset + cornerSize, aiY + aiTargetH + cornerOffset);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(aiX + aiTargetW + cornerOffset - cornerSize, aiY + aiTargetH + cornerOffset);
    ctx.lineTo(aiX + aiTargetW + cornerOffset, aiY + aiTargetH + cornerOffset);
    ctx.lineTo(aiX + aiTargetW + cornerOffset, aiY + aiTargetH + cornerOffset - cornerSize);
    ctx.stroke();

    // ── 5. Signature (Bottom Right) ───────────────────────────────
    if (signatureDataURL) {
      try {
        const sigImg = await loadImage(signatureDataURL);
        // Place in the bottom right space below the image
        const sigMaxW = 400;
        const sigMaxH = 180;
        const sigAspect = sigImg.naturalWidth / sigImg.naturalHeight;
        
        let sigW = sigMaxW;
        let sigH = sigW / sigAspect;
        if (sigH > sigMaxH) {
          sigH = sigMaxH;
          sigW = sigH * sigAspect;
        }

        const sigMarginX = 60; // Align with the right edge of the photo
        const sigX = CANVAS_W - sigW - sigMarginX;
        // Vertically center in the space between the photo bottom and copyright
        const spaceTop = aiY + aiTargetH + 20; 
        const spaceBottom = CANVAS_H - 80;
        const sigY = spaceTop + ((spaceBottom - spaceTop) - sigH) / 2;

        ctx.globalAlpha = 0.95;
        ctx.drawImage(sigImg, sigX, sigY, sigW, sigH);
        ctx.globalAlpha = 1;
      } catch (e) {}
    }

    // ── 6. Copyright ──────────────────────────────────────────────
    ctx.fillStyle = '#666';
    ctx.font = '400 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('\u00A9 ARTECH  2025', CANVAS_W / 2, CANVAS_H - 45);

    return offscreen.toDataURL('image/png');
  }

  return { composite };
})();
