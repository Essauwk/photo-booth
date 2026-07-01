import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const PORT = 3000;

// Enable CORS and increase payload limit for large images
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(rootDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  let fallback = 'localhost';
  let bestIP = null;

  for (const name of Object.keys(interfaces)) {
    const isVirtual = name.toLowerCase().includes('vmware') || 
                      name.toLowerCase().includes('virtual') || 
                      name.toLowerCase().includes('wsl') || 
                      name.toLowerCase().includes('vethernet');
                      
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('169.254')) continue;
        
        fallback = iface.address;
        
        if (!isVirtual && name.toLowerCase().includes('wi-fi')) {
           return iface.address; // Found the active Wi-Fi connection
        } else if (!isVirtual && !bestIP) {
           bestIP = iface.address;
        }
      }
    }
  }
  return bestIP || fallback;
}

// Endpoint to upload the HTML viewer page
app.post('/api/upload-html', (req, res) => {
  try {
    const { html } = req.body;
    if (!html) return res.status(400).json({ error: 'No html provided' });

    const filename = `photo-${Date.now()}.html`;
    const filepath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(filepath, html, 'utf8');

    const ip = getLocalIP();
    const url = `http://${ip}:${PORT}/uploads/${filename}`;
    
    res.json({ url });
  } catch (err) {
    console.error('Error saving html:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Serve the generated uploads folder publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the rest of the application
app.use(express.static(rootDir));

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`=============================================`);
  console.log(`Photo Booth Server running!`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`Network Access (for QR Code): http://${ip}:${PORT}`);
  console.log(`=============================================`);
});
