import { FastifyInstance } from 'fastify';

export async function createSpeechmaticsToken(apiKey: string): Promise<string> {
  const response = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ttl: 3600 // 1 hour token
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Speechmatics token: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.key_value;
}
