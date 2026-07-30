import WebSocket from 'ws';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const apiKey = process.env.SPEECHMATICS_API_KEY;

async function testSpeechmatics() {
  console.log('Fetching token...');
  const res = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl: 3600 })
  });
  const { key_value: token } = await res.json();
  const endpoint = 'wss://global.rt.speechmatics.com/v2';

  console.log('Connecting to Speechmatics WS...');
  const ws = new WebSocket(`${endpoint}?jwt=${token}`);

  const startTime = Date.now();

  ws.on('open', () => {
    console.log('Connected. Sending StartRecognition...');
    ws.send(JSON.stringify({
      message: "StartRecognition",
      audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
      transcription_config: { language: "en", enable_partials: true, max_delay: 1 },
      translation_config: { target_languages: ["vi"], enable_partials: true }
    }));

    // Send dummy audio data (silence) for 3 seconds
    let count = 0;
    const interval = setInterval(() => {
      const buffer = Buffer.alloc(1024 * 4); // 1024 float32 samples = 4096 bytes
      // Fill with some noise so it detects speech
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.random() * 255;
      }
      ws.send(buffer);
      count++;
      if (count > 50) { // ~3 seconds of audio at 64ms intervals
        clearInterval(interval);
        ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: count }));
      }
    }, 64);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log(`[${Date.now() - startTime}ms] Received: ${msg.message}`);
    if (msg.message === 'AddPartialTranslation' || msg.message === 'AddTranslation' || msg.message === 'AddPartialTranscript') {
      console.log('  Content:', JSON.stringify(msg.results));
    }
  });

  ws.on('close', () => {
    console.log('Connection closed.');
  });
}

testSpeechmatics().catch(console.error);
