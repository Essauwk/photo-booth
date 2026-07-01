/**
 * app.js
 * Main state machine and screen orchestration for the Photo Booth Experience.
 *
 * Screens:
 *   1. screen-job-input     — Dream Job Input
 *   2. screen-signature     — Signature Input
 *   3. screen-countdown     — Countdown + Camera Capture
 *   4. screen-processing    — Gemini API + Loading
 *   5. screen-result        — Final Composited Output
 *
 * Input modes (set in config.js):
 *   "keyboard" | "touch" | "airwrite"
 */

// ── Screen IDs ─────────────────────────────────────────────────────────
const SCREENS = {
  JOB_INPUT:  'screen-job-input',
  SIGNATURE:  'screen-signature',
  COUNTDOWN:  'screen-countdown',
  PROCESSING: 'screen-processing',
  RESULT:     'screen-result',
};

// ── App State ──────────────────────────────────────────────────────────
let state = {
  currentScreen: SCREENS.JOB_INPUT,
  inputMode: CONFIG.INPUT_MODE,
  jobText: '',
  signatureDataURL: null,
  capturedPhotoDataURL: null,
  generatedImageBase64: null,
  generatedImageMimeType: null,
  compositedImageDataURL: null,
};

// ── Camera ────────────────────────────────────────────────────────────
let countdownTimer = null;
let bgCameraStream = null;   // persistent camera stream: screens 1 → 3
let retryCount = 0;

// ── Particle State ─────────────────────────────────────────────────────
const PARTICLE_COUNT = 55;
let particles = [];
let particleRafId = null;
let bgCanvas, bgCtx;

// ══════════════════════════════════════════════════════════════════════
// SCREEN TRANSITIONS
// ══════════════════════════════════════════════════════════════════════

/**
 * Transition to a new screen with fade + translate animation.
 * @param {string} screenId
 */
function goTo(screenId) {
  const current = document.getElementById(state.currentScreen);
  const next = document.getElementById(screenId);
  if (!next) { console.error('Screen not found:', screenId); return; }

  // Fade out current
  if (current && current !== next) {
    current.classList.add('fade-out');
    current.classList.remove('active');
  }

  setTimeout(() => {
    if (current) current.classList.remove('fade-out');
    state.currentScreen = screenId;
    next.classList.add('active');
    onScreenEnter(screenId);
  }, 300);
}

/**
 * Called after a screen becomes active — runs screen-specific setup.
 */
function onScreenEnter(screenId) {
  switch (screenId) {
    case SCREENS.JOB_INPUT:   setupJobInput();   break;
    case SCREENS.SIGNATURE:   setupSignature();  break;
    case SCREENS.COUNTDOWN:   setupCountdown();  break;
    case SCREENS.PROCESSING:
      hideBgCamera();      // camera already captured; hide feed behind loading screen
      setupProcessing();
      break;
    case SCREENS.RESULT:
      hideBgCamera();      // result screen doesn't need camera
      setupResult();
      break;
  }
}

// ══════════════════════════════════════════════════════════════════════
// RESET
// ══════════════════════════════════════════════════════════════════════

async function startApp() {
  document.getElementById('screen-start').classList.add('hidden');

  // Clear all canvases
  ['job-touch-canvas', 'job-airwrite-canvas', 'sig-touch-canvas', 'sig-airwrite-canvas', 'sig-keyboard-canvas'].forEach(id => {
    const c = document.getElementById(id);
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });

  // Clear keyboard inputs
  const jobKb = document.getElementById('job-keyboard-input');
  const sigKb = document.getElementById('sig-keyboard-input');
  if (jobKb) jobKb.value = '';
  if (sigKb) sigKb.value = '';

  // Clear result display canvas
  const resultCanvas = document.getElementById('result-display-canvas');
  if (resultCanvas) {
    const ctx = resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  }

  // Reset processing UI
  showProcessingLoading();

  // Reset error state
  const errEl = document.getElementById('processing-error');
  const loadEl = document.getElementById('processing-loading');
  if (errEl) errEl.classList.add('hidden');
  if (loadEl) loadEl.classList.remove('hidden');

  // Wait for background camera to initialize so streams are ready
  await initBackgroundCamera();

  document.getElementById('screen-job-input').classList.remove('hidden');
  goTo(SCREENS.JOB_INPUT);
}

async function resetApp() {
  // We no longer stop the camera, we keep it alive persistently.
  showBgCamera();

  // Stop air write
  if (state.inputMode === 'airwrite') {
    MediaPipeHandler.stopAirWrite();
  }

  // Clear countdown timer
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  // Reset state
  state.jobText = '';
  state.jobCanvasDataURL = null;
  state.signatureDataURL = null;
  state.capturedPhotoDataURL = null;
  state.generatedImageBase64 = null;
  state.generatedImageMimeType = null;
  state.compositedImageDataURL = null;
  retryCount = 0;

  // Clear all canvases
  ['job-touch-canvas', 'job-airwrite-canvas', 'sig-touch-canvas', 'sig-airwrite-canvas', 'sig-keyboard-canvas'].forEach(id => {
    const c = document.getElementById(id);
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });

  // Clear keyboard inputs
  const jobKb = document.getElementById('job-keyboard-input');
  const sigKb = document.getElementById('sig-keyboard-input');
  if (jobKb) jobKb.value = '';
  if (sigKb) sigKb.value = '';

  // Clear result display canvas
  const resultCanvas = document.getElementById('result-display-canvas');
  if (resultCanvas) {
    const ctx = resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  }

  // Reset processing UI
  showProcessingLoading();

  // Reset error state
  const errEl = document.getElementById('processing-error');
  const loadEl = document.getElementById('processing-loading');
  if (errEl) errEl.classList.add('hidden');
  if (loadEl) loadEl.classList.remove('hidden');

  // Wait for background camera to initialize so streams are ready
  await initBackgroundCamera();

  goTo(SCREENS.JOB_INPUT);
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 1 — JOB INPUT
// ══════════════════════════════════════════════════════════════════════

function setupJobInput() {
  const mode = state.inputMode;
  const sublabel = document.getElementById('job-sublabel');

  // Show correct input mode
  const kbWrap = document.getElementById('job-keyboard-wrap');
  const touchWrap = document.getElementById('job-touch-wrap');
  const airWrap = document.getElementById('job-airwrite-wrap');

  kbWrap.classList.add('hidden');
  touchWrap.classList.add('hidden');
  airWrap.classList.add('hidden');

  const nextBtn = document.getElementById('job-next-btn');
  nextBtn.classList.remove('hidden');

  if (mode === 'keyboard') {
    sublabel.textContent = 'Type your answer below';
    kbWrap.classList.remove('hidden');
    const textarea = document.getElementById('job-keyboard-input');
    // Allow text selection in textarea
    textarea.addEventListener('mousedown', e => e.stopPropagation());
    setTimeout(() => textarea.focus(), 350);

    nextBtn.onclick = () => {
      const val = textarea.value.trim();
      if (!val) { shakeElement(textarea); return; }
      state.jobText = val;
      goTo(SCREENS.SIGNATURE);
    };

  } else if (mode === 'touch') {
    sublabel.textContent = 'Write with your finger on the screen';
    touchWrap.classList.remove('hidden');
    setupTouchCanvas('job-touch-canvas', 'job-touch-clear');

    nextBtn.onclick = () => {
      const canvas = document.getElementById('job-touch-canvas');
      if (isCanvasBlank(canvas)) { shakeElement(canvas); return; }
      // Save canvas as image to send to Gemini (handwriting stays as image)
      state.jobText = null;
      state.jobCanvasDataURL = canvas.toDataURL('image/png');
      goTo(SCREENS.SIGNATURE);
    };

  } else if (mode === 'airwrite') {
    sublabel.textContent = 'Write in the air with your index finger';
    airWrap.classList.remove('hidden');
    nextBtn.classList.add('hidden'); // air write uses pinch to confirm

    const videoEl = document.getElementById('job-airwrite-video');
    const drawCanvas = document.getElementById('job-airwrite-canvas');
    const pinchSvg = document.getElementById('job-pinch-svg');
    const pinchProgress = document.getElementById('job-pinch-progress');
    const eraseFlash = document.getElementById('job-erase-flash');

    // Use the persistent background camera stream for airwrite preview
    if (bgCameraStream) {
      videoEl.srcObject = bgCameraStream;
      videoEl.play().catch(e => console.error('Airwrite video play error:', e));
    }

    MediaPipeHandler.startAirWrite(videoEl, drawCanvas, () => {
      if (isCanvasBlank(drawCanvas)) { return; }
      // Save canvas as image to send to Gemini (handwriting stays as image)
      state.jobText = null;
      state.jobCanvasDataURL = drawCanvas.toDataURL('image/png');
      MediaPipeHandler.stopAirWrite();
      goTo(SCREENS.SIGNATURE);
    }, pinchSvg, pinchProgress, eraseFlash);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 2 — SIGNATURE
// ══════════════════════════════════════════════════════════════════════

function setupSignature() {
  const mode = state.inputMode;

  const kbWrap = document.getElementById('sig-keyboard-wrap');
  const touchWrap = document.getElementById('sig-touch-wrap');
  const airWrap = document.getElementById('sig-airwrite-wrap');

  kbWrap.classList.add('hidden');
  touchWrap.classList.add('hidden');
  airWrap.classList.add('hidden');

  const nextBtn = document.getElementById('sig-next-btn');
  nextBtn.classList.remove('hidden');

  if (mode === 'keyboard') {
    kbWrap.classList.remove('hidden');
    const input = document.getElementById('sig-keyboard-input');
    const previewCanvas = document.getElementById('sig-keyboard-canvas');
    const previewCtx = previewCanvas.getContext('2d');

    input.addEventListener('mousedown', e => e.stopPropagation());

    const renderSigText = () => {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      if (!input.value) return;
      previewCtx.font = '48px "Dancing Script", cursive';
      previewCtx.fillStyle = '#E8D5A3';
      previewCtx.textAlign = 'center';
      previewCtx.textBaseline = 'middle';
      previewCtx.fillText(input.value, previewCanvas.width / 2, previewCanvas.height / 2);
    };

    input.addEventListener('input', renderSigText);
    renderSigText();

    setTimeout(() => input.focus(), 350);

    nextBtn.onclick = () => {
      const val = input.value.trim();
      if (!val) { shakeElement(input); return; }
      renderSigText();
      state.signatureDataURL = previewCanvas.toDataURL('image/png');
      goTo(SCREENS.COUNTDOWN);
    };

  } else if (mode === 'touch') {
    touchWrap.classList.remove('hidden');
    setupTouchCanvas('sig-touch-canvas', 'sig-touch-clear');

    nextBtn.onclick = () => {
      const canvas = document.getElementById('sig-touch-canvas');
      if (isCanvasBlank(canvas)) { shakeElement(canvas); return; }
      state.signatureDataURL = canvas.toDataURL('image/png');
      goTo(SCREENS.COUNTDOWN);
    };

  } else if (mode === 'airwrite') {
    airWrap.classList.remove('hidden');
    nextBtn.classList.add('hidden');

    const videoEl = document.getElementById('sig-airwrite-video');
    const drawCanvas = document.getElementById('sig-airwrite-canvas');
    const pinchSvg = document.getElementById('sig-pinch-svg');
    const pinchProgress = document.getElementById('sig-pinch-progress');
    const eraseFlash = document.getElementById('sig-erase-flash');

    if (bgCameraStream) {
      videoEl.srcObject = bgCameraStream;
      videoEl.play().catch(e => console.error('Airwrite video play error:', e));
    }

    MediaPipeHandler.startAirWrite(videoEl, drawCanvas, () => {
      if (isCanvasBlank(drawCanvas)) { return; }
      state.signatureDataURL = drawCanvas.toDataURL('image/png');
      MediaPipeHandler.stopAirWrite();
      goTo(SCREENS.COUNTDOWN);
    }, pinchSvg, pinchProgress, eraseFlash);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 3 — COUNTDOWN + CAPTURE
// ══════════════════════════════════════════════════════════════════════

function setupCountdown() {
  const deniedMsg = document.getElementById('camera-denied-msg');

  // bg-camera is ALREADY playing — just keep it visible and start the countdown
  // No stream reassignment, no second video element = no freezing
  if (bgCameraStream) {
    // Ensure bg-camera is visible on the countdown screen
    showBgCamera();
    startCountdown();
  } else {
    // Fallback: camera wasn't started yet — request it now
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })
      .then(stream => {
        bgCameraStream = stream;
        const bgVideo = document.getElementById('bg-camera');
        bgVideo.srcObject = stream;
        bgVideo.play();
        showBgCamera();
        startCountdown();
      })
      .catch(err => {
        console.error('Camera access denied:', err);
        deniedMsg.classList.remove('hidden');
      });
  }
}

function startCountdown() {
  const total = CONFIG.COUNTDOWN_SECONDS;
  let remaining = total;

  const numberEl = document.getElementById('countdown-number');
  const ringEl = document.getElementById('cd-ring');
  const progressBar = document.getElementById('countdown-progress-bar');

  // Ring circumference for r=180 → C = 2πr ≈ 1130.97
  const circumference = 1130.97;

  const updateUI = (secs) => {
    numberEl.textContent = secs;
    const ratio = secs / total;
    ringEl.style.strokeDashoffset = circumference * (1 - ratio);
    progressBar.style.transform = `scaleX(${ratio})`;
  };

  updateUI(remaining);

  countdownTimer = setInterval(() => {
    remaining--;
    updateUI(remaining);
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      capturePhoto();
    }
  }, 1000);
}

function capturePhoto() {
  // Capture directly from bg-camera video element (the one that's been live all along)
  const bgVideo = document.getElementById('bg-camera');
  const flashEl = document.getElementById('capture-flash');

  // Flash effect
  flashEl.style.transition = 'opacity 80ms ease';
  flashEl.style.opacity = '0.7';
  setTimeout(() => {
    flashEl.style.opacity = '0';
    flashEl.style.transition = 'opacity 100ms ease';
  }, 80);

  // Draw video frame onto capture canvas (1080×1920 portrait)
  const captureCanvas = document.getElementById('capture-canvas');
  const ctx = captureCanvas.getContext('2d');

  const vw = bgVideo.videoWidth  || 1280;
  const vh = bgVideo.videoHeight || 720;
  const cw = captureCanvas.width;    // 1080
  const ch = captureCanvas.height;   // 1920

  ctx.save();
  // bg-camera CSS already mirrors (scaleX(-1)), but the pixel data is NOT mirrored
  // so we mirror the canvas draw to match what the user sees on screen
  ctx.translate(cw, 0);
  ctx.scale(-1, 1);

  // Cover-fit: fill portrait canvas with landscape video
  const videoAspect  = vw / vh;
  const canvasAspect = cw / ch;
  let sx, sy, sw, sh;
  if (videoAspect > canvasAspect) {
    sh = vh;
    sw = vh * canvasAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(bgVideo, sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.restore();

  state.capturedPhotoDataURL = captureCanvas.toDataURL('image/jpeg', 0.92);

  // Hide camera UI during processing, but keep the stream alive
  hideBgCamera();

  // Move to processing screen
  setTimeout(() => goTo(SCREENS.PROCESSING), 200);
}

// ── Background Camera Management ──────────────────────────────────────

/**
 * Start the persistent background camera feed.
 * Opens camera once on app load — stream is reused for countdown.
 */
async function initBackgroundCamera() {
  const bgVideo = document.getElementById('bg-camera');
  const bgOverlay = document.getElementById('bg-camera-overlay');
  if (!bgVideo) return;

  if (bgCameraStream && bgCameraStream.active) {
    // Stream is already running, just make sure it's visible
    bgVideo.classList.add('camera-live');
    bgOverlay.classList.add('camera-live');
    return;
  }

  try {
    const savedCamera = localStorage.getItem('selectedCameraId');
    const constraints = {
      video: savedCamera ? { deviceId: { exact: savedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } } 
                         : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    bgCameraStream = stream;
    bgVideo.srcObject = stream;
    await bgVideo.play();

    // Fade in the camera and overlay
    bgVideo.classList.add('camera-live');
    bgOverlay.classList.add('camera-live');
  } catch (err) {
    // Camera permission denied or not available — app still works, just no bg feed
    console.warn('Background camera unavailable:', err.message);
  }
}

/**
 * Show the background camera feed (used when navigating away from countdown).
 */
function showBgCamera() {
  document.getElementById('bg-camera')?.classList.add('camera-live');
  document.getElementById('bg-camera-overlay')?.classList.add('camera-live');
}

/**
 * Hide the background camera elements (Screen 3 takes over full screen).
 */
function hideBgCamera() {
  document.getElementById('bg-camera')?.classList.remove('camera-live');
  document.getElementById('bg-camera-overlay')?.classList.remove('camera-live');
}

/**
 * Stop camera tracks forcefully (used when switching cameras)
 */
function forceStopCamera() {
  if (bgCameraStream) {
    bgCameraStream.getTracks().forEach(t => t.stop());
    bgCameraStream = null;
  }
  const bgVideo = document.getElementById('bg-camera');
  if (bgVideo) bgVideo.srcObject = null;
}

/**
 * Populate the camera selector dropdown.
 */
async function populateCameraSelector() {
  const selector = document.getElementById('camera-selector');
  if (!selector) return;

  try {
    // Request permission first to get labels
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    selector.innerHTML = '';
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      selector.appendChild(option);
    });

    const savedCamera = localStorage.getItem('selectedCameraId');
    if (savedCamera && videoDevices.find(d => d.deviceId === savedCamera)) {
      selector.value = savedCamera;
    } else if (videoDevices.length > 0) {
      selector.value = videoDevices[0].deviceId;
    }

    selector.addEventListener('change', async () => {
      localStorage.setItem('selectedCameraId', selector.value);
      forceStopCamera();
      await initBackgroundCamera();
    });

  } catch (err) {
    console.warn('Could not enumerate cameras:', err);
  }
}

/**
 * Stop all camera tracks completely and hide the background feed.
 * Called after photo capture or on full reset.
 */
function stopBackgroundCamera() {
  hideBgCamera();
  if (bgCameraStream) {
    bgCameraStream.getTracks().forEach(t => t.stop());
    bgCameraStream = null;
  }
  const bgVideo = document.getElementById('bg-camera');
  if (bgVideo) bgVideo.srcObject = null;
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 4 — PROCESSING (GEMINI)
// ══════════════════════════════════════════════════════════════════════

function showProcessingLoading() {
  const loadEl = document.getElementById('processing-loading');
  const errEl  = document.getElementById('processing-error');
  if (loadEl) loadEl.classList.remove('hidden');
  if (errEl)  errEl.classList.add('hidden');
}

function showProcessingError(isRetry) {
  const loadEl = document.getElementById('processing-loading');
  const errEl  = document.getElementById('processing-error');
  if (loadEl) loadEl.classList.add('hidden');
  if (errEl)  errEl.classList.remove('hidden');

  const retryBtn = document.getElementById('processing-retry-btn');
  const startOverBtn = document.getElementById('processing-startover-btn');

  if (isRetry) {
    // Already retried once — show start over only
    retryBtn.classList.add('hidden');
  } else {
    retryBtn.classList.remove('hidden');
    retryBtn.onclick = () => {
      showProcessingLoading();
      runGeminiGeneration(true);
    };
  }

  startOverBtn.onclick = resetApp;
}

async function setupProcessing() {
  showProcessingLoading();
  retryCount = 0;
  await runGeminiGeneration(false);
}

async function runGeminiGeneration(isRetry) {
  try {
    // Extract base64 from captured photo
    const photoBase64 = state.capturedPhotoDataURL.split(',')[1];

    // For touch/airwrite, the job was drawn — pass the canvas as a second image
    // For keyboard, pass the text string
    const jobCanvasBase64 = state.jobCanvasDataURL
      ? state.jobCanvasDataURL.split(',')[1]
      : null;

    const result = await GeminiAPI.generateImage(photoBase64, state.jobText, jobCanvasBase64);
    state.generatedImageBase64 = result.base64;
    state.generatedImageMimeType = result.mimeType;

    // Composite the final frame (no job text shown in output)
    const composited = await Compositor.composite(
      state.generatedImageBase64,
      state.generatedImageMimeType,
      state.signatureDataURL,
      'logo.png'
    );
    state.compositedImageDataURL = composited;

    goTo(SCREENS.RESULT);
  } catch (err) {
    console.error('Generation failed:', err);
    showProcessingError(isRetry);
  }
}

// ══════════════════════════════════════════════════════════════════════
// SCREEN 5 — RESULT
// ══════════════════════════════════════════════════════════════════════

function setupResult() {
  // Display composited image — fill as much of the screen as possible
  const resultCanvas = document.getElementById('result-display-canvas');
  const img = new Image();
  img.onload = () => {
    const screenH = window.innerHeight;
    const screenW = window.innerWidth;
    const imgAspect = img.naturalWidth / img.naturalHeight; // portrait ~= 0.5625

    // Leave just the heading (~80px) and buttons (~90px) — rest is image
    const availH = screenH - 170;
    const availW = screenW;

    let displayW, displayH;
    // Fit by height first (portrait image)
    displayH = availH;
    displayW = displayH * imgAspect;
    if (displayW > availW) {
      displayW = availW;
      displayH = displayW / imgAspect;
    }

    resultCanvas.width  = Math.round(displayW);
    resultCanvas.height = Math.round(displayH);
    const ctx = resultCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, resultCanvas.width, resultCanvas.height);
  };
  img.src = state.compositedImageDataURL;

  // Trigger heading animation
  const heading = document.getElementById('result-heading');
  heading.style.animation = 'none';
  void heading.offsetWidth; // reflow
  heading.style.animation = 'scaleIn 400ms ease forwards';

  // Wire buttons
  document.getElementById('btn-qr').onclick = () => {
    QRHandler.showQRModal(state.compositedImageDataURL);
  };

  document.getElementById('btn-print').onclick = () => {
    PrintHandler.triggerPrint(state.compositedImageDataURL);
  };

  document.getElementById('btn-startover').onclick = resetApp;
}

// ══════════════════════════════════════════════════════════════════════
// TOUCH CANVAS UTILITY
// ══════════════════════════════════════════════════════════════════════

/**
 * Wire up mouse + touch drawing on a canvas element.
 * @param {string} canvasId
 * @param {string} clearBtnId
 */
function setupTouchCanvas(canvasId, clearBtnId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastPos = null;

  ctx.strokeStyle = '#C9A84C';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('mousedown', e => { drawing = true; lastPos = getPos(e); e.preventDefault(); });
  canvas.addEventListener('mousemove', e => {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos = pos;
  });
  canvas.addEventListener('mouseup', () => { drawing = false; lastPos = null; });
  canvas.addEventListener('mouseleave', () => { drawing = false; lastPos = null; });

  canvas.addEventListener('touchstart', e => { drawing = true; lastPos = getPos(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.x, lastPos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos = pos;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { drawing = false; lastPos = null; });

  const clearBtn = document.getElementById(clearBtnId);
  if (clearBtn) {
    clearBtn.onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

/** Check if a canvas has any non-transparent pixels drawn on it. */
function isCanvasBlank(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return !imageData.data.some(channel => channel !== 0);
}

/** Placeholder — air-write canvas text extraction (OCR out of scope). */
function extractCanvasText(canvas) {
  return null;
}

/** Shake element to indicate validation error. */
function shakeElement(el) {
  el.style.transition = 'transform 80ms ease';
  el.style.transform = 'translateX(-8px)';
  setTimeout(() => { el.style.transform = 'translateX(8px)'; }, 80);
  setTimeout(() => { el.style.transform = 'translateX(-5px)'; }, 160);
  setTimeout(() => { el.style.transform = 'translateX(0)'; }, 240);
}

// ══════════════════════════════════════════════════════════════════════
// AMBIENT PARTICLE BACKGROUND
// ══════════════════════════════════════════════════════════════════════

function initParticles() {
  bgCanvas = document.getElementById('bg-particles');
  bgCtx = bgCanvas.getContext('2d');

  function resize() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.5 + Math.random() * 1.5,
      speed: 0.08 + Math.random() * 0.27,
      opacity: 0.04 + Math.random() * 0.14,
    });
  }

  function animate() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    particles.forEach(p => {
      p.y -= p.speed;
      if (p.y < -p.r * 2) {
        p.y = bgCanvas.height + p.r * 2;
        p.x = Math.random() * bgCanvas.width;
      }
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(201, 168, 76, ${p.opacity})`;
      bgCtx.fill();
    });
    particleRafId = requestAnimationFrame(animate);
  }
  animate();
}

// ══════════════════════════════════════════════════════════════════════
// CUSTOM GOLD CURSOR
// ══════════════════════════════════════════════════════════════════════

function initCustomCursor() {
  const cursor = document.getElementById('custom-cursor');
  if (!cursor) return;
  let rafPending = false;
  let cx = -20, cy = -20;
  document.addEventListener('mousemove', e => {
    cx = e.clientX;
    cy = e.clientY;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        cursor.style.left = cx + 'px';
        cursor.style.top = cy + 'px';
        rafPending = false;
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// GLOBAL EVENT LISTENERS
// ══════════════════════════════════════════════════════════════════════

// Right-click disabled
document.addEventListener('contextmenu', e => e.preventDefault());

// Staff shortcut: Ctrl+Shift+R → full reset
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    resetApp();
  }
});

// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  initParticles();
  initCustomCursor();

  // Populate camera selector then open camera
  await populateCameraSelector();
  await initBackgroundCamera();

  // Activate first screen
  document.getElementById(SCREENS.JOB_INPUT).classList.add('active');
  state.currentScreen = SCREENS.JOB_INPUT;
  onScreenEnter(SCREENS.JOB_INPUT);
});
