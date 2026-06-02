'use client';
import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function AuthCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      localStorage.setItem('rgpv_token', token);
      
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      fetch(`${API}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          localStorage.setItem('rgpv_user', JSON.stringify(data.user));
          window.location.href = '/chat';
        } else {
          router.push('/auth?error=oauth_failed');
        }
      })
      .catch(() => {
        router.push('/auth?error=oauth_failed');
      });
    } else {
      router.push('/auth?error=oauth_failed');
    }
  }, [searchParams, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <p style={{ color: 'var(--text-1)', fontSize: '18px' }}>Authenticating...</p>
    </div>
  );
}
