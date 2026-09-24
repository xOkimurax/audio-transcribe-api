import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY environment variable is required');
  console.error('   Get your key at: https://console.groq.com/keys');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, uniqueName + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// Groq API transcription endpoint (file upload)
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    const fileStream = fs.createReadStream(audioPath);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: (() => {
        const formData = new FormData();
        formData.append('file', fileStream, {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'es');
        return formData;
      })()
    });

    // Clean up uploaded file
    fs.unlinkSync(audioPath);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Groq API error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: 'Transcription service error',
        details: errorData 
      });
    }

    const data = await response.json();
    res.json({ 
      text: data.text || '',
      success: true 
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

// Also accept base64 audio for simpler client-side usage
app.post('/api/transcribe-base64', async (req, res) => {
  try {
    const { audio, mimeType = 'audio/webm' } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    
    // Create temp file
    const tempPath = join(__dirname, 'uploads', `temp-${Date.now()}.webm`);
    fs.writeFileSync(tempPath, audioBuffer);

    const fileStream = fs.createReadStream(tempPath);

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: (() => {
        const formData = new FormData();
        formData.append('file', fileStream, {
          filename: 'audio.webm',
          contentType: mimeType
        });
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'es');
        return formData;
      })()
    });

    // Clean up temp file
    fs.unlinkSync(tempPath);

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({ 
        error: 'Transcription service error',
        details: errorData 
      });
    }

    const data = await response.json();
    res.json({ 
      text: data.text || '',
      success: true 
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎙️ Audio Transcription API running on http://localhost:${PORT}`);
});
