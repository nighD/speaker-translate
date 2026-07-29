"use client";

import { useEffect, useState } from 'react';
import { CaptionEvent } from '../../../lib/caption-types';

export default function AudiencePage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [captions, setCaptions] = useState<CaptionEvent[]>([]);
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    const apiUrl = `http://${window.location.hostname}:4000`;
    
    // Load historical captions
    fetch(`${apiUrl}/api/sessions/${sessionId}/captions`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCaptions(data);
      })
      .catch(console.error);

    // Connect to websocket for live captions
    const wsUrl = `ws://${window.location.hostname}:4000/audience?sessionId=${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setStatus('Connected to live translation');
    ws.onclose = () => setStatus('Disconnected. Reconnecting...');
    
    ws.onmessage = (event) => {
      try {
        const caption: CaptionEvent = JSON.parse(event.data);
        if (caption.type === 'final') {
          setCaptions(prev => [...prev, caption]);
        }
      } catch (e) {
        console.error('Parse error', e);
      }
    };

    return () => ws.close();
  }, [sessionId]);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Live Translation</h2>
        <span style={{ fontSize: '0.8rem', color: status.includes('Connected') ? 'green' : 'red' }}>{status}</span>
      </div>
      
      <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {captions.map((c, i) => (
          <div key={i} style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', fontSize: '1.2rem' }}>
            {c.text}
          </div>
        ))}
        {captions.length === 0 && <p style={{ color: 'gray' }}>Waiting for speaker to start...</p>}
      </div>
    </div>
  );
}
