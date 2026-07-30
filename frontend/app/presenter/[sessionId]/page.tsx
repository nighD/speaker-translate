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
  const [partialCaption, setPartialCaption] = useState('');
  const [finalCaptions, setFinalCaptions] = useState<string[]>([]);
  
  const speechmaticsWs = useRef<WebSocket | null>(null);
  const backendWs = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const lastMyMemoryCall = useRef<number>(0);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      setDevices(devs.filter(d => d.kind === 'audioinput'));
    });
    
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

      // 2. Setup Microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined }
      });
      mediaStream.current = stream;

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

        // Send audio chunks
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
          <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} style={{ padding: '0.5rem', width: '100%', maxWidth: '400px' }}>
            <option value="">Default Microphone</option>
            {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mic ' + d.deviceId}</option>)}
          </select>
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

        <div style={{ marginTop: '1.5rem' }}>
          {!isTranslating ? (
            <button onClick={startTranslation} style={{ padding: '0.75rem 1.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Start Translation
            </button>
          ) : (
            <button onClick={stopTranslation} style={{ padding: '0.75rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Stop Translation
            </button>
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
