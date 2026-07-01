export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the API key from environment variables or the request body (for local testing)
  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey;
  const model = req.body.model || 'gemini-2.5-flash';

  if (!apiKey) {
    return res.status(500).json({ error: 'API key is missing' });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const googleRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Pass the exact body from the frontend to Google, stripping our extra keys
      body: JSON.stringify({
        contents: req.body.contents,
        generationConfig: req.body.generationConfig,
      }),
    });

    const data = await googleRes.json();

    if (!googleRes.ok) {
      return res.status(googleRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Gemini Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
