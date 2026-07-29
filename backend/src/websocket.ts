import { WebSocket, WebSocketServer } from 'ws';
import { saveCaption } from './database';
import { randomUUID } from 'crypto';

interface CaptionEvent {
  sessionId: string;
  type: 'partial' | 'final';
  language: string;
  text: string;
  timestamp: number;
}

const audienceClients = new Map<string, Set<WebSocket>>();
const presenterClients = new Map<string, Set<WebSocket>>();

export function setupWebSockets(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // e.g. /presenter?sessionId=123
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      ws.close(1008, 'Missing sessionId');
      return;
    }

    if (pathname === '/presenter') {
      if (!presenterClients.has(sessionId)) presenterClients.set(sessionId, new Set());
      presenterClients.get(sessionId)!.add(ws);

      ws.on('message', (message) => {
        try {
          const caption: CaptionEvent = JSON.parse(message.toString());
          
          // Save to database if it is a final caption
          if (caption.type === 'final') {
            saveCaption(randomUUID(), caption.sessionId, caption.language, caption.text);
          }

          // Broadcast to audience
          publishCaption(caption);
        } catch (error) {
          console.error('Failed to parse caption event', error);
        }
      });

      ws.on('close', () => {
        presenterClients.get(sessionId)?.delete(ws);
      });

    } else if (pathname === '/audience') {
      if (!audienceClients.has(sessionId)) audienceClients.set(sessionId, new Set());
      audienceClients.get(sessionId)!.add(ws);

      ws.on('close', () => {
        audienceClients.get(sessionId)?.delete(ws);
      });
    } else {
      ws.close(1008, 'Invalid path');
    }
  });
}

export function publishCaption(caption: CaptionEvent) {
  const clients = audienceClients.get(caption.sessionId);
  if (!clients) return;

  const message = JSON.stringify(caption);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
