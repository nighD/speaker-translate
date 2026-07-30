"use client";

import { useEffect, useState, useRef } from 'react';

export default function FEOnlyPage() {
  const [apiKey, setApiKey] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [partialCaption, setPartialCaption] = useState('');
  const [finalCaptions, setFinalCaptions] = useState<{ source: string, translated: string }[]>([]);
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('vi');
  const [status, setStatus] = useState('Disconnected');

  const speechmaticsWs = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const currentSourceText = useRef<string>('');

  useEffect(() => {
    // Check if key exists in env
    const envKey = process.env.NEXT_PUBLIC_SPEECHMATICS_API_KEY;
    if (envKey) {
      setApiKey(envKey);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTranslating) {
        stopTranslation();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTranslating]);


  const startTranslation = async () => {
    if (!apiKey) {
      alert('Please enter your Speechmatics API Key or add NEXT_PUBLIC_SPEECHMATICS_API_KEY to .env');
      return;
    }

    try {
      setStatus('Fetching Token...');
      // 1. Fetch JWT directly from frontend
      const tokenRes = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: 3600 })
      });

      if (!tokenRes.ok) {
        throw new Error('Failed to fetch temporary token. Check your API key. (CORS errors might also apply)');
      }

      const { key_value: jwt } = await tokenRes.json();

      setStatus('Accessing Microphone...');
      // 2. Setup Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;

      setStatus('Connecting to Speechmatics...');
      // 3. Connect to WebSocket
      speechmaticsWs.current = new WebSocket(`wss://global.rt.speechmatics.com/v2?jwt=${jwt}`);

      speechmaticsWs.current.onopen = () => {
        setStatus('Connected & Recording');
        setIsTranslating(true);

        const config = {
          message: "StartRecognition",
          audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
          transcription_config: { language: sourceLang, enable_partials: true, max_delay: 1 },
          translation_config: { target_languages: [targetLang], enable_partials: true }
        };
        
        speechmaticsWs.current?.send(JSON.stringify(config));

        // Setup audio processing
        audioContext.current = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.current.createMediaStreamSource(stream);
        const processor = audioContext.current.createScriptProcessor(1024, 1, 1);
        
        processor.onaudioprocess = (e) => {
          if (speechmaticsWs.current?.readyState === WebSocket.OPEN) {
            const audioData = e.inputBuffer.getChannelData(0);
            speechmaticsWs.current.send(audioData);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.current.destination);
      };

      speechmaticsWs.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // console.log('Speechmatics WS:', msg.message, msg); // Uncomment for debugging
        
        if (msg.message === 'AddPartialTranscript') {
          currentSourceText.current = msg.metadata?.transcript || '';
        } else if (msg.message === 'AddTranscript') {
          currentSourceText.current = msg.metadata?.transcript || '';
        } else if (msg.message === 'AddPartialTranslation') {
          const text = msg.results?.[0]?.content || '';
          setPartialCaption(text);
        } else if (msg.message === 'AddTranslation') {
          const text = msg.results?.[0]?.content;
          if (text) {
            setPartialCaption('');
            setFinalCaptions(prev => [...prev, { source: currentSourceText.current, translated: text }]);
            currentSourceText.current = '';
          }
        } else if (msg.message === 'Warning' || msg.message === 'Error') {
          console.error('Speechmatics WS Message:', msg);
          if (msg.message === 'Error') {
             alert(`Speechmatics Error: ${msg.reason} - ${msg.type}`);
          }
        }
      };

      speechmaticsWs.current.onclose = () => {
        stopTranslation();
        setStatus('Disconnected');
      };

      speechmaticsWs.current.onerror = (e) => {
        console.error('WebSocket Error', e);
        setStatus('Error connecting to Speechmatics');
        stopTranslation();
      };

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to start translation';
      alert(errorMessage);
      setStatus('Disconnected');
    }
  };

  const stopTranslation = () => {
    speechmaticsWs.current?.close();
    mediaStream.current?.getTracks().forEach(t => t.stop());
    audioContext.current?.close();
    setIsTranslating(false);
    setStatus('Disconnected');
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'black', 
      color: 'white', 
      fontFamily: 'sans-serif', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      padding: '2rem 1rem' 
    }}>
      <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: '2rem', flex: 1 }}>
        {!isTranslating && status !== 'Connected & Recording' ? (
          <div style={{ background: '#111', padding: '2rem', borderRadius: '12px', border: '1px solid #333', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <h1 style={{ marginTop: 0 }}>Frontend-Only Mode Setup</h1>
            <p style={{ color: '#aaa', marginBottom: '1.5rem' }}>Direct microphone to Speechmatics translation. No backend required.</p>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#ccc' }}>API Key</label>
              <input 
                type="password" 
                placeholder="Enter Speechmatics API Key"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ padding: '0.75rem', width: '100%', border: '1px solid #444', borderRadius: '4px', background: '#222', color: 'white', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#ccc' }}>Source Language</label>
                <select 
                  value={sourceLang} 
                  onChange={e => setSourceLang(e.target.value)}
                  style={{ padding: '0.75rem', width: '100%', border: '1px solid #444', borderRadius: '4px', background: '#222', color: 'white' }}
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="vi">Vietnamese</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: '#ccc' }}>Target Language</label>
                <select 
                  value={targetLang} 
                  onChange={e => setTargetLang(e.target.value)}
                  style={{ padding: '0.75rem', width: '100%', border: '1px solid #444', borderRadius: '4px', background: '#222', color: 'white' }}
                >
                  <option value="vi">Vietnamese</option>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>

            <button 
              onClick={startTranslation}
              style={{ 
                padding: '1rem 2rem', 
                background: '#2563eb', 
                color: 'white', 
                fontWeight: 'bold', 
                fontSize: '1.1rem',
                borderRadius: '8px', 
                border: 'none',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Start Translation
            </button>
            {status !== 'Disconnected' && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: '#aaa' }}>{status}</p>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: '1rem', color: '#ef4444', fontWeight: 'bold' }}>LIVE</span>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>Press ESC to stop</span>
            </div>
            
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              gap: '2.5rem', 
              padding: '2rem 0'
            }}>
              {finalCaptions.length === 0 && !partialCaption && (
                <div style={{ textAlign: 'center', color: '#444', fontSize: '1.5rem' }}>Waiting for speech...</div>
              )}
              
              {/* Keep only the last 4 final captions to leave room for the partial caption (max 5 items) */}
              {finalCaptions.slice(-4).map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center', animation: 'fadeIn 0.3s ease-in' }}>
                  <div style={{ color: '#9ca3af', fontSize: '1.5rem', fontWeight: 500, opacity: 0.8 }}>{c.source}</div>
                  <div style={{ color: 'white', fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '-0.02em' }}>{c.translated}</div>
                </div>
              ))}
              
              {partialCaption && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center', animation: 'fadeIn 0.1s ease-in' }}>
                  <div style={{ color: '#9ca3af', fontSize: '1.5rem', fontWeight: 500, opacity: 0.8 }}>{currentSourceText.current}</div>
                  <div style={{ color: '#60a5fa', fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '-0.02em' }}>{partialCaption}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        body {
          margin: 0;
          padding: 0;
          background: black;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
