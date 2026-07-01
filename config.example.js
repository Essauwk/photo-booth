// config.example.js — Copy this to config.js and fill in your values.
// config.js is gitignored and must never be committed.

const CONFIG = {
  // Get your Gemini API key from https://aistudio.google.com/apikey
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",

  // Choose the Gemini model to use for image generation
  GEMINI_MODEL: "gemini-2.5-flash",

  // Input mode for ALL input interactions (job text + signature).
  // Options:
  //   "keyboard"  — standard keyboard text input (default, easiest setup)
  //   "touch"     — finger/stylus draw on canvas (touchscreen required)
  //   "airwrite"  — MediaPipe hand tracking via webcam (no touch needed)
  INPUT_MODE: "keyboard",

  // Countdown duration in seconds before photo is captured (Screen 3)
  COUNTDOWN_SECONDS: 5,
};
