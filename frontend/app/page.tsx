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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Conference Translation System</h1>
      
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <div 
          onClick={() => router.push('/')}
          style={{ 
            flex: 1, 
            padding: '1.5rem', 
            border: '2px solid #0070f3', 
            borderRadius: '12px', 
            cursor: 'pointer',
            background: 'rgba(0, 112, 243, 0.05)'
          }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#0070f3' }}>Standard Mode</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Uses backend server for robust audio processing and multi-client broadcasting.</p>
        </div>
        
        <div 
          onClick={() => router.push('/fe-only')}
          style={{ 
            flex: 1, 
            padding: '1.5rem', 
            border: '2px solid #e5e7eb', 
            borderRadius: '12px', 
            cursor: 'pointer',
            transition: 'border-color 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#10b981'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>Frontend-Only Mode</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Direct browser-to-API translation. No backend required. (Requires API Key)</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f9f9f9', padding: '1.5rem', borderRadius: '12px' }}>
        <h3 style={{ marginTop: 0 }}>Start Standard Session</h3>
        <input 
          placeholder="Session Title" 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}>
            <option value="en">English (Source)</option>
            <option value="vi">Vietnamese (Source)</option>
            <option value="fr">French (Source)</option>
          </select>
          <select value={targetLang} onChange={e => setTargetLang(e.target.value)} style={{ flex: 1, padding: '0.75rem', borderRadius: '6px', border: '1px solid #ccc' }}>
            <option value="vi">Vietnamese (Target)</option>
            <option value="en">English (Target)</option>
            <option value="fr">French (Target)</option>
          </select>
        </div>
        <button 
          onClick={createSession} 
          disabled={loading || !title}
          style={{ 
            padding: '0.75rem', 
            background: loading || !title ? '#ccc' : '#0070f3', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            cursor: loading || !title ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            marginTop: '0.5rem'
          }}
        >
          {loading ? 'Creating...' : 'Create Session'}
        </button>
      </div>
    </div>
  );
}
