"use client";

import { useEffect, useState } from 'react';
import { CaptionEvent } from '../../../lib/caption-types';

export default function DisplayPage({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [captions, setCaptions] = useState<CaptionEvent[]>([]);
  const [partial, setPartial] = useState('');

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost') 
      ? process.env.NEXT_PUBLIC_API_URL 
      : `http://${window.location.hostname}:4000`;

    // Load last few historical captions
    fetch(`${apiUrl}/api/sessions/${sessionId}/captions`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCaptions(data.slice(-3));
      })
      .catch(console.error);

    const wsBaseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL && !process.env.NEXT_PUBLIC_WEBSOCKET_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_WEBSOCKET_URL
      : `ws://${window.location.hostname}:4000`;
      
    const wsUrl = `${wsBaseUrl}/audience?sessionId=${sessionId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const caption: CaptionEvent = JSON.parse(event.data);
        if (caption.type === 'final') {
          setCaptions(prev => {
            const newCaptions = [...prev, caption];
            return newCaptions.slice(-10); // Keep last 10 for connected paragraph
          });
          setPartial('');
        } else if (caption.type === 'partial') {
          setPartial(caption.text);
        }
      } catch (e) {
        console.error(e);
      }
    };

    return () => ws.close();
  }, [sessionId]);

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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
        <p style={{ 
          fontSize: '3.5vw', 
          fontWeight: 'bold', 
          lineHeight: '1.5',
          margin: 0,
          textAlign: 'left'
        }}>
          {captions.map(c => c.text).join(' ')}
          {partial && (
            <span style={{ 
              opacity: 0.5, 
              marginLeft: captions.length > 0 ? '1vw' : '0'
            }}>
              {partial}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
