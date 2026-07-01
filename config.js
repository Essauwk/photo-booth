// config.js — Photo Booth Configuration
// DO NOT commit this file. Add your real API key below.
// See config.example.js for reference.

const CONFIG = {
  GEMINI_API_KEY: "AIzaSyDyR8SN6RlmJbg95bW-FNnu0ASBqYGi4RI",

  // Gemini model for image generation — confirmed available models:
  //   "gemini-2.5-flash-image"          ← recommended (latest stable)
  //   "gemini-3.1-flash-image-preview"  ← newest preview
  //   "gemini-3.1-flash-image"          ← newest stable
  GEMINI_MODEL: "gemini-2.5-flash-image",

  // Input mode for ALL input interactions (job text + signature).
  // Options: "keyboard" | "touch" | "airwrite"
  INPUT_MODE: "touch",

  // Countdown duration in seconds before photo is captured
  COUNTDOWN_SECONDS: 5,
};

