"use client";

import { useEffect, useState } from 'react';
import { CaptionEvent } from '../../../lib/caption-types';

export default function DisplayPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [captions, setCaptions] = useState<CaptionEvent[]>([]);

  useEffect(() => {
    const apiUrl = `http://${window.location.hostname}:4000`;

    // Load last few historical captions
    fetch(`${apiUrl}/api/sessions/${sessionId}/captions`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCaptions(data.slice(-3));
      })
      .catch(console.error);

    const wsUrl = `ws://${window.location.hostname}:4000/audience?sessionId=${sessionId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const caption: CaptionEvent = JSON.parse(event.data);
        if (caption.type === 'final') {
          setCaptions(prev => {
            const newCaptions = [...prev, caption];
            return newCaptions.slice(-3); // Keep only last 3 captions
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => ws.close();
  }, [sessionId]);

  return (
    <div style={{ 
      height: '100vh', 
      background: 'black', 
      color: 'white', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center',
      alignItems: 'center',
      padding: '4rem',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ width: '100%', maxWidth: '1200px', textAlign: 'center' }}>
        {captions.map((c, i) => (
          <p key={i} style={{ 
            fontSize: '4vw', 
            fontWeight: 'bold', 
            margin: '1rem 0',
            opacity: i === captions.length - 1 ? 1 : 0.5 
          }}>
            {c.text}
          </p>
        ))}
      </div>
    </div>
  );
}
