/**
 * api/upload.js — Vercel Serverless Function Placeholder
 *
 * PURPOSE:
 * This file is a placeholder for a serverless image upload function.
 * Implement this to enable cross-device QR code photo sharing.
 *
 * PROBLEM:
 * The current QR code implementation uses a Blob ObjectURL (created via
 * URL.createObjectURL). This URL only works within the same browser session
 * on the same device. When a phone camera scans the QR code, it opens a
 * different session and cannot access the blob.
 *
 * SOLUTION:
 * Upload the composited image to cloud storage and return a public URL.
 * Encode that public URL into the QR code instead of the blob URL.
 *
 * ─────────────────────────────────────────────────────────────────────
 * OPTION A: Vercel Blob (recommended for Vercel deployments)
 *
 * 1. Install: npm install @vercel/blob
 * 2. Set environment variable in Vercel dashboard: BLOB_READ_WRITE_TOKEN
 * 3. Implement:
 *
 * import { put } from '@vercel/blob';
 *
 * export default async function handler(req, res) {
 *   if (req.method !== 'POST') return res.status(405).end();
 *   const { imageBase64, mimeType } = JSON.parse(req.body);
 *   const buffer = Buffer.from(imageBase64, 'base64');
 *   const blob = await put(`photobooth-${Date.now()}.png`, buffer, {
 *     access: 'public',
 *     contentType: mimeType || 'image/png',
 *   });
 *   res.json({ url: blob.url });
 * }
 *
 * Docs: https://vercel.com/docs/storage/vercel-blob
 *
 * ─────────────────────────────────────────────────────────────────────
 * OPTION B: Cloudinary
 *
 * 1. Create a free account at https://cloudinary.com
 * 2. Set env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * 3. Implement:
 *
 * import cloudinary from 'cloudinary';
 *
 * cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, ... });
 *
 * export default async function handler(req, res) {
 *   const { imageBase64 } = JSON.parse(req.body);
 *   const result = await cloudinary.uploader.upload(
 *     `data:image/png;base64,${imageBase64}`,
 *     { folder: 'photobooth' }
 *   );
 *   res.json({ url: result.secure_url });
 * }
 *
 * ─────────────────────────────────────────────────────────────────────
 * FRONTEND INTEGRATION (qr-handler.js):
 *
 * After implementing this endpoint, replace the blob URL in qr-handler.js:
 *
 *   // Instead of: currentBlobUrl = URL.createObjectURL(blob);
 *   const response = await fetch('/api/upload', {
 *     method: 'POST',
 *     body: JSON.stringify({
 *       imageBase64: compositedDataURL.split(',')[1],
 *       mimeType: 'image/png'
 *     })
 *   });
 *   const { url } = await response.json();
 *   // Use `url` as the QR code content instead of blobUrl
 */

// This file intentionally exports nothing — it is a placeholder only.
export default function handler(req, res) {
  res.status(501).json({
    error: 'Upload endpoint not implemented.',
    message: 'See api/upload.js for instructions on implementing cross-device QR sharing.',
  });
}
