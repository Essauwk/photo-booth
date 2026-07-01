/**
 * qr-handler.js
 * QR code generation and modal management.
 *
 * Strategy:
 * 1. Convert composited image to a self-contained HTML blob
 * 2. Create an ObjectURL from the blob
 * 3. Encode that URL into a QR code via qrcodejs
 *
 * IMPORTANT: ObjectURLs only work on the same device/session.
 * For cross-device sharing (phone scanning QR), integrate the
 * /api/upload serverless function (see api/upload.js) which
 * returns a public URL. Replace blobUrl below with that public URL.
 */

const QRHandler = (() => {
  let currentBlobUrl = null;
  let qrInstance = null;

  const modalEl = () => document.getElementById('qr-modal');
  const modalCloseEl = () => document.getElementById('qr-modal-close');
  const qrWrapEl = () => document.getElementById('qr-canvas-wrap');

  /**
   * Show QR modal for the composited image.
   * @param {string} compositedDataURL — the full data URL of the composited image
   */
  async function showQRModal(compositedDataURL) {
    // Show modal immediately so user knows something is happening
    const modal = modalEl();
    const wrap = qrWrapEl();
    
    // Add loading text while uploading
    wrap.innerHTML = '<div style="color:var(--gold-primary);font-family:var(--font-ui);display:flex;align-items:center;justify-content:center;height:100%;"><div class="gold-spinner" style="width:40px;height:40px;margin-bottom:15px;"></div><p>Generating QR Code...</p></div>';
    
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    // Build a self-contained HTML page wrapping the image
    const htmlPage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Photo Booth Portrait</title>
  <style>
    body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    img { max-width: 100%; max-height: 100vh; display: block; object-fit: contain; }
  </style>
</head>
<body>
  <img src="${compositedDataURL}" alt="Your photo booth portrait" />
</body>
</html>`;

    try {
      // Send to our local server endpoint
      const response = await fetch('/api/upload-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlPage })
      });
      const data = await response.json();
      currentBlobUrl = data.url; // This is now a real network URL (e.g. http://192.168.x.x:3000/uploads/...)
      
      // Clear previous QR and generate new one
      wrap.innerHTML = '';
      qrInstance = new QRCode(wrap, {
        text: currentBlobUrl,
        width: 340,
        height: 340,
        colorDark: '#FFFFFF',
        colorLight: '#0A0A0A',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (err) {
      console.error('QR Upload Error:', err);
      wrap.innerHTML = '<p style="color:red;font-family:var(--font-ui);padding:20px;text-align:center;">Failed to generate network QR. Are you running server.js?</p>';
    }

    // Trigger animation on next frame
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    // Wire close button
    const closeBtn = modalCloseEl();
    closeBtn.onclick = hideQRModal;

    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) hideQRModal();
    };
  }

  /**
   * Hide QR modal and clean up.
   */
  function hideQRModal() {
    const modal = modalEl();
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.classList.add('hidden');
      // Clean up blob URL
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
      qrInstance = null;
    }, 300);
  }

  return { showQRModal, hideQRModal };
})();
