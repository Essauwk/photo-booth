/**
 * mediapipe-handler.js
 * Handles all MediaPipe Hands tracking for air-write mode.
 * Provides: startAirWrite(), stopAirWrite()
 *
 * Dependencies: @mediapipe/hands, @mediapipe/camera_utils (loaded via CDN in index.html)
 */

const MediaPipeHandler = (() => {
  // ── Internal state ─────────────────────────────────────────────────
  let handsInstance = null;
  let activeVideoEl = null;
  let activeCanvas = null;
  let activeCtx = null;
  let onConfirmCallback = null;
  let isRunning = false;
  let animationFrameId = null;

  // State Machine logic
  let currentAirTool = 'pen'; // 'pen' | 'eraser'
  let wasClicking = false;
  let wristHistory = [];
  let confirmStartTime = null;
  const CONFIRM_HOLD_MS = 1000;

  // Pinch progress UI (reused for confirm)
  let pinchSvgEl = null;
  let pinchProgressEl = null;

  // Erase flash UI (no longer used for flash, but kept if needed)
  let eraseFlashEl = null;
  let eraseFlashTimeout = null;

  // Canvas gold flash on confirm
  let confirmFlashTimeout = null;

  // ── Landmark indices ───────────────────────────────────────────────
  const LM = {
    WRIST: 0,
    THUMB_TIP: 4,
    INDEX_TIP: 8, INDEX_PIP: 6, INDEX_MCP: 5,
    MIDDLE_TIP: 12, MIDDLE_PIP: 10, MIDDLE_MCP: 9,
    RING_TIP: 16, RING_PIP: 14, RING_MCP: 13,
    PINKY_TIP: 20, PINKY_PIP: 18, PINKY_MCP: 17,
  };

  // ── Normalized distance between two landmarks ─────────────────────
  function getNormalizedDistance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  // ── Clamp a value within [min, max] ───────────────────────────────
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // ── Calculate Hand Size (Wrist to Middle MCP) ─────────────────────
  function getHandSize(landmarks) {
    const dist = getNormalizedDistance(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP]);
    return dist || 0.1; // fallback
  }

  // ── Get Finger States ───────────────────────────────────────────────
  function getFingerStates(landmarks) {
    const iUp = landmarks[LM.INDEX_TIP].y < landmarks[LM.INDEX_PIP].y;
    const mUp = landmarks[LM.MIDDLE_TIP].y < landmarks[LM.MIDDLE_PIP].y;
    const rUp = landmarks[LM.RING_TIP].y < landmarks[LM.RING_PIP].y;
    const pUp = landmarks[LM.PINKY_TIP].y < landmarks[LM.PINKY_PIP].y;

    const mDown = landmarks[LM.MIDDLE_TIP].y > landmarks[LM.MIDDLE_PIP].y;
    const rDown = landmarks[LM.RING_TIP].y > landmarks[LM.RING_PIP].y;
    const pDown = landmarks[LM.PINKY_TIP].y > landmarks[LM.PINKY_PIP].y;
    
    return { iUp, mUp, rUp, pUp, mDown, rDown, pDown };
  }

  // ── DOM Cursor ─────────────────────────────────────────────────────
  let airCursor = null;

  function renderDOMCursor(screenX, screenY, color = 'rgba(201, 168, 76, 0.9)', sizePx = 16) {
    if (!airCursor) {
      airCursor = document.createElement('div');
      airCursor.id = 'airwrite-cursor';
      airCursor.style.position = 'fixed';
      airCursor.style.pointerEvents = 'none';
      airCursor.style.zIndex = '10000';
      airCursor.style.borderRadius = '50%';
      airCursor.style.transform = 'translate(-50%, -50%)';
      airCursor.style.transition = 'width 0.1s, height 0.1s, background 0.1s';
      document.body.appendChild(airCursor);
    }
    airCursor.style.left = screenX + 'px';
    airCursor.style.top = screenY + 'px';
    airCursor.style.width = sizePx + 'px';
    airCursor.style.height = sizePx + 'px';
    airCursor.style.background = color;
    airCursor.style.display = 'block';
  }

  function hideDOMCursor() {
    if (airCursor) airCursor.style.display = 'none';
  }

  // ── Update pinch SVG ring progress ────────────────────────────────
  function updatePinchProgress(ratio) {
    if (!pinchProgressEl) return;
    const circumference = 100.5; // 2π × r=16
    const offset = circumference * (1 - ratio);
    pinchProgressEl.style.strokeDashoffset = offset;

    if (pinchSvgEl) {
      pinchSvgEl.classList.remove('hidden');
    }
  }

  function hidePinchProgress() {
    if (pinchProgressEl) {
      pinchProgressEl.style.strokeDashoffset = 100.5;
    }
    if (pinchSvgEl) {
      pinchSvgEl.classList.add('hidden');
    }
  }

  // ── Trigger erase flash overlay ────────────────────────────────────
  function triggerEraseFlash() {
    if (!eraseFlashEl) return;
    eraseFlashEl.classList.remove('hidden');
    eraseFlashEl.classList.add('flash-active');
    clearTimeout(eraseFlashTimeout);
    eraseFlashTimeout = setTimeout(() => {
      eraseFlashEl.classList.remove('flash-active');
      setTimeout(() => eraseFlashEl.classList.add('hidden'), 400);
    }, 80);
  }

  // ── Trigger canvas gold border flash on confirm ────────────────────
  function triggerConfirmFlash() {
    if (!activeCanvas) return;
    activeCanvas.classList.add('canvas-confirm-flash');
    clearTimeout(confirmFlashTimeout);
    confirmFlashTimeout = setTimeout(() => {
      activeCanvas.classList.remove('canvas-confirm-flash');
    }, 500);
  }

  // ── Per-frame results handler ──────────────────────────────────────
  function onResults(results) {
    if (!isRunning || !activeCtx || !activeCanvas) return;

    // Clear only the cursor layer by redrawing. Drawing trail is persistent.
    // We composite: persistent trail + cursor dot on top.
    // Actually we store trail in a separate offscreen, but simplest approach:
    // redraw cursor at new position without clearing trail.
    // We use a trick: save/restore so only the cursor dot is drawn fresh each frame.

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      lastPoint = null;
      confirmStartTime = null;
      wristHistory = [];
      hidePinchProgress();
      hideDOMCursor();
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[LM.INDEX_TIP];
    const thumbTip = landmarks[LM.THUMB_TIP];

    const rawPx = (1 - indexTip.x) * activeCanvas.width;
    const rawPy = indexTip.y * activeCanvas.height;
    const px = clamp(rawPx, 0, activeCanvas.width);
    const py = clamp(rawPy, 0, activeCanvas.height);

    // Get screen coordinates for the DOM cursor
    const rect = activeCanvas.getBoundingClientRect();
    const screenX = rect.left + (1 - indexTip.x) * rect.width;
    const screenY = rect.top + indexTip.y * rect.height;

    const now = performance.now();
    wristHistory.push({ time: now, x: landmarks[LM.WRIST].x });
    wristHistory = wristHistory.filter(h => now - h.time <= 500);
    
    let wristXDelta = 0;
    if (wristHistory.length > 0) {
      const xs = wristHistory.map(h => h.x);
      wristXDelta = Math.max(...xs) - Math.min(...xs);
    }

    const { iUp, mUp, rUp, pUp, mDown, rDown, pDown } = getFingerStates(landmarks);
    
    // ── Evaluate State Machine ─────────────────────────────────────
    let state = 'IDLE';

    if (!iUp && mDown && rDown && pDown) {
      state = 'CLICK'; // Fist
    } else if (iUp && mUp && rUp && pUp) {
      state = 'TRACKING'; // Open hand
    } else if (iUp && mUp && rDown && pDown) {
      state = 'CONFIRM'; // Victory
    } else if (iUp && mDown && rDown && pDown) {
      state = 'ACTION'; // Index only
    }

    // ── Execute State Logic ────────────────────────────────────────
    if (state === 'CLICK') {
      if (!wasClicking) {
        wasClicking = true;
        const el = document.elementFromPoint(screenX, screenY);
        if (el) {
          const btn = el.closest('.tool-btn');
          if (btn) {
            currentAirTool = btn.getAttribute('data-tool');
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.tool-btn[data-tool="${currentAirTool}"]`).forEach(b => b.classList.add('active'));
          }
        }
      }
      renderDOMCursor(screenX, screenY, 'rgba(255, 255, 255, 0.9)', 16);
      lastPoint = null;
      lastErasePoint = null;
      confirmStartTime = null;
      hidePinchProgress();
      return;
    } else {
      wasClicking = false;
    }

    if (state === 'CONFIRM') {
      lastPoint = null;
      if (!confirmStartTime) confirmStartTime = now;
      const elapsed = now - confirmStartTime;
      updatePinchProgress(Math.min(elapsed / CONFIRM_HOLD_MS, 1)); 

      if (elapsed >= CONFIRM_HOLD_MS) {
        confirmStartTime = null;
        hidePinchProgress();
        triggerConfirmFlash();
        if (onConfirmCallback) {
          const cb = onConfirmCallback;
          onConfirmCallback = null;
          setTimeout(() => cb(), 300);
        }
      }
      renderDOMCursor(screenX, screenY, 'rgba(46, 204, 113, 0.9)', 24); // Green
      return;
    } else {
      confirmStartTime = null;
      hidePinchProgress();
    }

    if (state === 'ACTION') {
      if (currentAirTool === 'pen') {
        activeCtx.save();
        activeCtx.strokeStyle = '#C9A84C';
        activeCtx.lineWidth = 6;
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.globalCompositeOperation = 'source-over';

        if (lastPoint) {
          activeCtx.beginPath();
          activeCtx.moveTo(lastPoint.x, lastPoint.y);
          activeCtx.lineTo(px, py);
          activeCtx.stroke();
        }
        activeCtx.restore();
        lastPoint = { x: px, y: py };
        lastErasePoint = null;
        
        renderDOMCursor(screenX, screenY, 'rgba(201, 168, 76, 1)', 16);
      } else if (currentAirTool === 'eraser') {
        activeCtx.save();
        activeCtx.lineWidth = 40; 
        activeCtx.lineCap = 'round';
        activeCtx.lineJoin = 'round';
        activeCtx.globalCompositeOperation = 'destination-out';
        activeCtx.strokeStyle = 'rgba(0,0,0,1)';

        if (lastErasePoint) {
          activeCtx.beginPath();
          activeCtx.moveTo(lastErasePoint.x, lastErasePoint.y);
          activeCtx.lineTo(px, py);
          activeCtx.stroke();
        } else {
          activeCtx.beginPath();
          activeCtx.arc(px, py, 20, 0, Math.PI * 2);
          activeCtx.fill();
        }
        activeCtx.restore();
        lastErasePoint = { x: px, y: py };
        lastPoint = null;

        renderDOMCursor(screenX, screenY, 'rgba(231, 76, 60, 0.5)', 40);
      }
      return;
    } else {
      lastPoint = null;
      lastErasePoint = null;
    }

    if (state === 'TRACKING') {
      renderDOMCursor(screenX, screenY, 'rgba(255, 255, 255, 0.6)', 16);
      return;
    }

    // IDLE state (None of the above)
    renderDOMCursor(screenX, screenY, 'rgba(255, 255, 255, 0.2)', 8);
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Start air-write mode.
   * @param {HTMLVideoElement} videoEl — webcam preview video element
   * @param {HTMLCanvasElement} drawingCanvas — canvas to draw trail on
   * @param {Function} onConfirm — called when pinch-confirm gesture triggers
   * @param {SVGElement} pinchSvg — SVG overlay for pinch ring
   * @param {SVGCircleElement} pinchProgress — circle element for ring animation
   * @param {HTMLElement} eraseFlash — div for red flash overlay
   */
  async function startAirWrite(videoEl, drawingCanvas, onConfirm, pinchSvg, pinchProgress, eraseFlash) {
    if (isRunning) stopAirWrite();

    activeVideoEl = videoEl;
    activeCanvas = drawingCanvas;
    activeCtx = drawingCanvas.getContext('2d');
    onConfirmCallback = onConfirm;
    pinchSvgEl = pinchSvg || null;
    pinchProgressEl = pinchProgress || null;
    eraseFlashEl = eraseFlash || null;
    lastPoint = null;
    wristHistory = [];
    confirmStartTime = null;
    isRunning = true;

    // Init MediaPipe Hands
    handsInstance = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    handsInstance.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.75,
      minTrackingConfidence: 0.75,
    });

    handsInstance.onResults(onResults);

    // Instead of using @mediapipe/camera_utils which requests a new camera stream,
    // we just feed the existing video element to handsInstance on every animation frame.
    async function processVideo() {
      if (!isRunning || !handsInstance || !activeVideoEl) return;
      if (activeVideoEl.readyState >= 2) {
        await handsInstance.send({ image: activeVideoEl });
      }
      animationFrameId = requestAnimationFrame(processVideo);
    }
    
    // Start the processing loop
    processVideo();
  }

  /**
   * Stop air-write mode — cleanup MediaPipe, and state.
   */
  function stopAirWrite() {
    isRunning = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (handsInstance) {
      handsInstance.close();
      handsInstance = null;
    }

    // Reset state
    lastPoint = null;
    wristHistory = [];
    confirmStartTime = null;
    activeVideoEl = null;
    activeCanvas = null;
    activeCtx = null;
    onConfirmCallback = null;
    hidePinchProgress();
    hideDOMCursor();

    clearTimeout(eraseFlashTimeout);
    clearTimeout(confirmFlashTimeout);
  }

  /**
   * Set a new confirm callback (e.g. when navigating to signature screen).
   */
  function setConfirmCallback(fn) {
    onConfirmCallback = fn;
  }

  return { startAirWrite, stopAirWrite, setConfirmCallback };
})();
