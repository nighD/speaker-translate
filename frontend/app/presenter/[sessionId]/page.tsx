"use client";

import { useEffect, useState, useRef } from 'react';
import { CaptionEvent } from '../../../lib/caption-types';

export default function PresenterPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [partialCaption, setPartialCaption] = useState('');
  const [finalCaptions, setFinalCaptions] = useState<string[]>([]);
  
  const speechmaticsWs = useRef<WebSocket | null>(null);
  const backendWs = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);

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
        speechmaticsWs.current?.send(JSON.stringify({
          message: "StartRecognition",
          audio_format: { type: "raw", encoding: "pcm_f32le", sample_rate: 16000 },
          transcription_config: { language: "en", enable_partials: true, max_delay: 2 },
          translation_config: { target_languages: ["vi"], enable_partials: true }
        }));

        // Send audio chunks
        audioContext.current = new AudioContext({ sampleRate: 16000 });
        const source = audioContext.current.createMediaStreamSource(stream);
        const processor = audioContext.current.createScriptProcessor(4096, 1, 1);
        
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
        if (msg.message === 'AddPartialTranslation') {
          const text = msg.results[0]?.content || '';
          setPartialCaption(text);
          if (backendWs.current?.readyState === WebSocket.OPEN && text) {
            backendWs.current.send(JSON.stringify({
              sessionId,
              type: 'partial',
              language: 'vi',
              text,
              timestamp: Date.now()
            } as CaptionEvent));
          }
        } else if (msg.message === 'AddTranslation') {
          const text = msg.results[0]?.content;
          if (text) {
            setPartialCaption('');
            setFinalCaptions(prev => [...prev, text]);
            
            // Broadcast to backend
            if (backendWs.current?.readyState === WebSocket.OPEN) {
              const captionEvent: CaptionEvent = {
                sessionId,
                type: 'final',
                language: 'vi',
                text,
                timestamp: Date.now()
              };
              backendWs.current.send(JSON.stringify(captionEvent));
            }
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Presenter Dashboard</h1>
      <div style={{ marginBottom: '1rem' }}>
        <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} style={{ padding: '0.5rem', marginRight: '1rem' }}>
          <option value="">Default Microphone</option>
          {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mic ' + d.deviceId}</option>)}
        </select>
        {!isTranslating ? (
          <button onClick={startTranslation} style={{ padding: '0.5rem 1rem', background: 'green', color: 'white' }}>Start Translation</button>
        ) : (
          <button onClick={stopTranslation} style={{ padding: '0.5rem 1rem', background: 'red', color: 'white' }}>Stop Translation</button>
        )}
      </div>

      <div style={{ background: '#f0f0f0', padding: '1rem', borderRadius: '8px', minHeight: '100px' }}>
        <h3>Live Translation (VI)</h3>
        {finalCaptions.map((c, i) => <p key={i}>{c}</p>)}
        <p style={{ color: 'gray' }}>{partialCaption}</p>
      </div>
      
      <div style={{ marginTop: '2rem' }}>
        <p>Links:</p>
        <a href={`/audience/${sessionId}`} target="_blank" style={{ display: 'block' }}>Audience Page</a>
        <a href={`/display/${sessionId}`} target="_blank" style={{ display: 'block' }}>Display Page</a>
      </div>
    </div>
  );
}
