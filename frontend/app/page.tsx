"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [title, setTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('vi');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const createSession = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost') 
        ? process.env.NEXT_PUBLIC_API_URL 
        : `http://${window.location.hostname}:4000`;
        
      const res = await fetch(`${apiUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sourceLanguage: sourceLang, targetLanguage: targetLang })
      });
      const data = await res.json();
      router.push(`/presenter/${data.id}`);
    } catch (e) {
      console.error(e);
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Conference Translation System</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '300px' }}>
        <input 
          placeholder="Session Title" 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          style={{ padding: '0.5rem' }}
        />
        <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} style={{ padding: '0.5rem' }}>
          <option value="en">English</option>
          <option value="vi">Vietnamese</option>
          <option value="fr">French</option>
        </select>
        <select value={targetLang} onChange={e => setTargetLang(e.target.value)} style={{ padding: '0.5rem' }}>
          <option value="vi">Vietnamese</option>
          <option value="en">English</option>
          <option value="fr">French</option>
        </select>
        <button 
          onClick={createSession} 
          disabled={loading || !title}
          style={{ padding: '0.5rem', background: '#0070f3', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Create Session
        </button>
      </div>
    </div>
  );
}
