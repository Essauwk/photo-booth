# Photo Booth Experience

A premium, cinematic event photo booth kiosk — single-page web app powered by **MediaPipe Hands** and **Google Gemini 2.0 Flash** image generation.

Designed for **1080×1920px portrait** display (kiosk / portrait monitor), running in Chrome.

---

## Project Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd photobooth
```

### 2. Configure the App

Copy the example config and add your credentials:

```bash
cp config.example.js config.js
```

Then open `config.js` and fill in your values:

```js
const CONFIG = {
  GEMINI_API_KEY: "your-actual-key-here",  // ← required
  INPUT_MODE: "keyboard",                  // keyboard | touch | airwrite
  COUNTDOWN_SECONDS: 5,
};
```

> `config.js` is listed in `.gitignore` and will never be committed.

### 3. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Paste it into `config.js`

---

## Input Mode

Set `CONFIG.INPUT_MODE` in `config.js` to one of:

| Mode | Description | Hardware needed |
|------|-------------|-----------------|
| `"keyboard"` | Standard keyboard text input | Any keyboard |
| `"touch"` | Finger/stylus draw on canvas | Touchscreen |
| `"airwrite"` | MediaPipe hand tracking via webcam | Webcam |

This setting applies to **both** the job text input and signature screens. It is set once by the developer and is **not user-selectable**.

---

## Logo

Replace `logo.png` with your own logo file. Keep the filename exactly as `logo.png`.

- Recommended: PNG with transparency
- Will appear on every screen and in the composited final image

---

## Vercel Deployment

No build step required. All files are static.

```bash
npm install -g vercel
vercel deploy
```

Vercel will auto-detect the static project. The `vercel.json` file configures required CORS headers for MediaPipe.

---

## Kiosk Mode (Portrait Display)

For a dedicated kiosk PC connected to a portrait monitor (1080×1920):

```bash
# Windows — open Chrome in kiosk mode
chrome --kiosk --app=https://your-vercel-url.vercel.app

# Or for local server:
chrome --kiosk --app=http://localhost:8080
```

Alternatively, use `npx serve .` to serve the files locally:

```bash
npx serve . -p 8080
```

---

## QR Code Cross-Device Sharing

The current QR implementation uses a **Blob ObjectURL** — this only works when the phone and kiosk are on the same device (same browser session). Scanning from a phone will not work out of the box.

**To enable real cross-device QR sharing**, implement the `/api/upload` serverless function:
- See [`api/upload.js`](./api/upload.js) for step-by-step instructions
- Supports: [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) or [Cloudinary](https://cloudinary.com)
- After implementing, update `qr-handler.js` to use the returned public URL instead of the blob URL

---

## Print

Click **"Print Photo"** on the result screen. The browser's native print dialog opens.

- The composited 1080×1920 image fills the entire page (full bleed)
- No printer drivers needed beyond standard OS print setup
- Works with any connected printer
- Use Chrome's built-in PDF export to save as PDF

---

## Staff Controls

| Action | Shortcut |
|--------|----------|
| Force-restart the experience | `Ctrl + Shift + R` |

Right-click is disabled. The mouse cursor is hidden and replaced with a subtle gold dot so staff can still see the pointer during setup.

---

## File Structure

```
photobooth/
├── index.html              Main HTML — all 5 screens
├── style.css               All styles, CSS variables, animations
├── app.js                  State machine, screen navigation
├── mediapipe-handler.js    MediaPipe Hands air-write logic
├── gemini.js               Gemini API image generation
├── compositor.js           1080×1920 canvas compositing
├── qr-handler.js           QR code generation and modal
├── print-handler.js        Print trigger
├── config.js               API key + settings (gitignored)
├── config.example.js       Template for config.js
├── vercel.json             Vercel static hosting config
├── api/upload.js           Upload placeholder (see file)
├── .gitignore              Excludes config.js
├── logo.png                Replace with your logo
└── README.md               This file
```

---

## Tech Stack

- **Vanilla JS + HTML5 Canvas** — no frameworks
- **Google Fonts**: Cormorant Garamond, Inter, Dancing Script
- **MediaPipe Hands** (CDN) — hand tracking for air-write mode
- **Gemini 2.0 Flash** — AI portrait generation
- **qrcodejs** (CDN) — QR code rendering
- **Vercel** — static hosting

---

## License

Internal use only — event branding property of ARTECH.
