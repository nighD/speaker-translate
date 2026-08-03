"use client";

import { useEffect, useState, useRef } from 'react';
import { CaptionEvent } from '../../../lib/caption-types';

export default function PresenterPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [translationMode, setTranslationMode] = useState<'speechmatics' | 'mymemory'>('speechmatics');
  const [myMemoryEmail, setMyMemoryEmail] = useState<string>('');
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [partialCaption, setPartialCaption] = useState('');
  const [finalCaptions, setFinalCaptions] = useState<string[]>([]);
  
  const speechmaticsWs = useRef<WebSocket | null>(null);
  const backendWs = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const lastMyMemoryCall = useRef<number>(0);

  // Re-enumerate devices once (to get labels after permission is granted)
  const refreshDevices = async () => {
    const devs = await navigator.mediaDevices.enumerateDevices();
    setDevices(devs.filter(d => d.kind === 'audioinput'));
  };

  useEffect(() => {
    // Initial enumeration — labels may be empty until mic permission is granted
    refreshDevices();
    
    // Connect to backend WS for broadcasting
    const wsBaseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL && !process.env.NEXT_PUBLIC_WEBSOCKET_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_WEBSOCKET_URL
      : `ws://${window.location.hostname}:4000`;
      
    const wsUrl = `${wsBaseUrl}/presenter?sessionId=${sessionId}`;
    backendWs.current = new WebSocket(wsUrl);
    
    return () => {
      backendWs.current?.close();
    };
  }, [sessionId]);

  const translateWithMyMemory = async (text: string, type: 'partial' | 'final') => {
    try {
      const emailParam = myMemoryEmail ? `&de=${encodeURIComponent(myMemoryEmail)}` : '';
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi${emailParam}`);
      const data = await res.json();
      const translated = data.responseData.translatedText;
      
      if (type === 'partial') {
        setPartialCaption(translated);
      } else {
        setPartialCaption('');
        setFinalCaptions(prev => [...prev, translated]);
      }

      if (backendWs.current?.readyState === WebSocket.OPEN && translated) {
        backendWs.current.send(JSON.stringify({
          sessionId,
          type,
          language: 'vi',
          text: translated,
          timestamp: Date.now()
        } as CaptionEvent));
      }
    } catch (e) {
      console.error('MyMemory translation error', e);
    }
  };

  const startTranslation = async () => {
    try {
      // 1. Get temporary Speechmatics Token from Backend
      const apiUrl = process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost') 
        ? process.env.NEXT_PUBLIC_API_URL 
        : `http://${window.location.hostname}:4000`;
        
      const res = await fetch(`${apiUrl}/api/speechmatics/token`, { method: 'POST' });
      const { token, endpoint } = await res.json();

      // 2. Setup Microphone — enable browser-level noise processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
          noiseSuppression: true,      // browser removes background noise
          echoCancellation: true,       // removes mic echo
          autoGainControl: true,        // normalises volume levels
          sampleRate: 16000,
          channelCount: 1,
        }
      });
      mediaStream.current = stream;
      // Re-enumerate now that mic permission is granted — so AirPods label appears
      await refreshDevices();

      // 3. Connect to Speechmatics
      speechmaticsWs.current = new WebSocket(`${endpoint}?jwt=${token}`);
      
      speechmaticsWs.current.onopen = () => {
        const config: Record<string, unknown> = {
          message: "StartRecognition",
          audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
          transcription_config: { language: "en", enable_partials: true, max_delay: 1 }
        };
        
        if (translationMode === 'speechmatics') {
          config.translation_config = { target_languages: ["vi"], enable_partials: true };
        }
        
        speechmaticsWs.current?.send(JSON.stringify(config));

        // Send audio chunks — with VAD energy gate to drop silent frames
        audioContext.current = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.current.createMediaStreamSource(stream);
        // Use 4096 buffer for a ~256ms window — smoother VAD detection
        const processor = audioContext.current.createScriptProcessor(4096, 1, 1);

        // RMS energy threshold — raised to 0.03 for AirPods which are more sensitive
        // and can pick up ambient voices at the lower 0.01 level.
        const SILENCE_THRESHOLD = 0.03;

        processor.onaudioprocess = (e) => {
          if (speechmaticsWs.current?.readyState !== WebSocket.OPEN) return;

          const audioData = e.inputBuffer.getChannelData(0);

          // Compute RMS energy of this frame
          let sum = 0;
          for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
          }
          const rms = Math.sqrt(sum / audioData.length);

          // Only send frames with meaningful audio energy
          const speaking = rms >= SILENCE_THRESHOLD;
          setIsSpeaking(speaking);
          if (speaking) {
            speechmaticsWs.current.send(audioData);
          }
        };

        source.connect(processor);
        // NOTE: Do NOT connect processor to destination — that would play mic audio
        // back through the speakers and create an echo/feedback loop.
        // processor.connect(audioContext.current.destination); // ← removed
        setIsTranslating(true);
      };

      speechmaticsWs.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.message === 'AddPartialTranslation' && translationMode === 'speechmatics') {
          const text = msg.results[0]?.content || '';
          setPartialCaption(text);
          if (backendWs.current?.readyState === WebSocket.OPEN && text) {
            backendWs.current.send(JSON.stringify({
              sessionId, type: 'partial', language: 'vi', text, timestamp: Date.now()
            } as CaptionEvent));
          }
        } else if (msg.message === 'AddTranslation' && translationMode === 'speechmatics') {
          const text = msg.results[0]?.content;
          if (text) {
            setPartialCaption('');
            setFinalCaptions(prev => [...prev, text]);
            if (backendWs.current?.readyState === WebSocket.OPEN) {
              backendWs.current.send(JSON.stringify({
                sessionId, type: 'final', language: 'vi', text, timestamp: Date.now()
              } as CaptionEvent));
            }
          }
        } else if (msg.message === 'AddPartialTranscript' && translationMode === 'mymemory') {
          const text = msg.metadata?.transcript;
          if (text) {
            const now = Date.now();
            if (now - lastMyMemoryCall.current > 500) {
              lastMyMemoryCall.current = now;
              translateWithMyMemory(text, 'partial');
            }
          }
        } else if (msg.message === 'AddTranscript' && translationMode === 'mymemory') {
          const text = msg.metadata?.transcript;
          if (text) {
            translateWithMyMemory(text, 'final');
          }
        }
      };

    } catch (e) {
      console.error(e);
      alert('Failed to start translation');
    }
  };

  const stopTranslation = () => {
    speechmaticsWs.current?.close();
    mediaStream.current?.getTracks().forEach(t => t.stop());
    audioContext.current?.close();
    setIsTranslating(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Presenter Dashboard</h1>
      
      <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Microphone:</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} style={{ padding: '0.5rem', flex: 1, maxWidth: '360px' }}>
              <option value="">Default Microphone</option>
              {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mic ' + d.deviceId}</option>)}
            </select>
            <button
              onClick={refreshDevices}
              title="Refresh device list (needed after connecting AirPods)"
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', background: 'white', fontSize: '1rem' }}
            >🔄</button>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#666', marginTop: '0.3rem' }}>
            If you just connected AirPods, click 🔄 to refresh the list and select <em>AirPods Microphone</em>.
          </p>
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>Translation Engine:</label>
          <select 
            value={translationMode} 
            onChange={e => setTranslationMode(e.target.value as 'speechmatics' | 'mymemory')} 
            style={{ padding: '0.5rem', width: '100%', maxWidth: '400px' }}
            disabled={isTranslating}
          >
            <option value="speechmatics">Speechmatics AI (High Accuracy, Higher Latency)</option>
            <option value="mymemory">MyMemory Fast Text (Lower Latency)</option>
          </select>
        </div>
        
        {translationMode === 'mymemory' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>
              MyMemory Email (Optional, increases limit from 500 to 50,000 words/day):
            </label>
            <input 
              type="email" 
              placeholder="youremail@example.com"
              value={myMemoryEmail}
              onChange={e => setMyMemoryEmail(e.target.value)}
              style={{ padding: '0.5rem', width: '100%', maxWidth: '400px' }}
              disabled={isTranslating}
            />
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {!isTranslating ? (
            <button onClick={startTranslation} style={{ padding: '0.75rem 1.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Start Translation
            </button>
          ) : (
            <>
              <button onClick={stopTranslation} style={{ padding: '0.75rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                Stop Translation
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: isSpeaking ? '#22c55e' : '#d1d5db',
                  transition: 'background 0.1s',
                  boxShadow: isSpeaking ? '0 0 6px #22c55e' : 'none'
                }} />
                <span style={{ color: isSpeaking ? '#22c55e' : '#9ca3af' }}>
                  {isSpeaking ? 'Voice detected' : 'Listening...'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ background: '#f9f9f9', padding: '1.5rem', borderRadius: '8px', minHeight: '150px' }}>
        <h3>Live Translation (VI)</h3>
        {finalCaptions.map((c, i) => <p key={i} style={{ margin: '0.5rem 0' }}>{c}</p>)}
        <p style={{ color: 'gray', fontStyle: 'italic' }}>{partialCaption}</p>
      </div>
      
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <p style={{ fontWeight: 'bold' }}>Share these links with your audience:</p>
        <a href={`/audience/${sessionId}`} target="_blank" style={{ display: 'block', margin: '0.5rem 0', color: '#2563eb' }}>Open Audience Page</a>
        <a href={`/display/${sessionId}`} target="_blank" style={{ display: 'block', margin: '0.5rem 0', color: '#2563eb' }}>Open Display Page</a>
      </div>
    </div>
  );
}
