/**
 * api/upload-html.js — Vercel Serverless Function
 *
 * This function acts as a proxy to upload the generated HTML viewer
 * to tmpfiles.org, a free temporary file hosting service (files kept for 60 minutes).
 * This completely bypasses the need for local storage, allowing
 * cross-device QR codes to work when the app is deployed on Vercel.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { html } = req.body;
    if (!html) {
      return res.status(400).json({ error: 'No html provided' });
    }

    // tmpfiles.org expects a multipart/form-data request with 'file'
    const boundary = '----WebKitFormBoundaryPhotoboothVercel';
    
    // Construct the multipart body manually since Vercel's Node 18 runtime
    // might have mixed support for FormData depending on polyfills.
    const body = 
`--${boundary}\r\n` +
`Content-Disposition: form-data; name="file"; filename="photo-${Date.now()}.html"\r\n` +
`Content-Type: text/html\r\n\r\n` +
`${html}\r\n` +
`--${boundary}--`;

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': 'Vercel-Photobooth'
      },
      body: body
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('tmpfiles.org error:', response.status, text);
      return res.status(500).json({ error: 'Upstream upload failed' });
    }

    const result = await response.json();
    
    // tmpfiles.org returns: { data: { url: 'https://tmpfiles.org/12345/photo.html' } }
    // The direct link inserts '/dl/' before the ID.
    if (result && result.data && result.data.url) {
      const fileUrl = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      return res.status(200).json({ url: fileUrl });
    } else {
      return res.status(500).json({ error: 'Invalid response from upstream' });
    }

  } catch (err) {
    console.error('Vercel Upload Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
