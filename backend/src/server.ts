import fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { setupWebSockets } from './websocket';
import { createSpeechmaticsToken } from './speechmatics';
import { initDatabase, createSession, getSession, endSession, getCaptions } from './database';
import { randomUUID } from 'crypto';

dotenv.config();

const server = fastify({ logger: true });

// Initialize database on startup
initDatabase();

server.register(cors, {
  origin: '*'
});

server.post('/api/sessions', async (request, reply) => {
  const { title, sourceLanguage, targetLanguage } = request.body as any;
  const id = randomUUID();
  createSession(id, title, sourceLanguage, targetLanguage);
  return { id, title, sourceLanguage, targetLanguage, status: 'active' };
});

server.get('/api/sessions/:sessionId', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  const session = getSession(sessionId);
  if (!session) return reply.status(404).send({ error: 'Session not found' });
  return session;
});

server.post('/api/sessions/:sessionId/end', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  endSession(sessionId);
  return { success: true };
});

server.get('/api/sessions/:sessionId/captions', async (request, reply) => {
  const { sessionId } = request.params as { sessionId: string };
  const captions = getCaptions(sessionId);
  return captions;
});

server.post('/api/speechmatics/token', async (request, reply) => {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return reply.status(500).send({ error: 'SPEECHMATICS_API_KEY not configured on server' });
  }

  try {
    const token = await createSpeechmaticsToken(apiKey);
    return { 
      token, 
      endpoint: process.env.SPEECHMATICS_REALTIME_URL || 'wss://global.rt.speechmatics.com/v2'
    };
  } catch (err: any) {
    server.log.error(err);
    return reply.status(500).send({ error: 'Failed to create token' });
  }
});

// Setup WebSockets after HTTP server is ready
server.ready(err => {
  if (err) throw err;
  setupWebSockets(server.server);
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
