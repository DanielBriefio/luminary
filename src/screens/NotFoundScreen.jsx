import React from 'react';
import { T } from '../lib/constants';

export default function NotFoundScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: T.bg,
      padding: 20,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{
          fontSize: 72,
          fontFamily: "'DM Serif Display', serif",
          color: T.v,
          lineHeight: 1,
          marginBottom: 12,
        }}>
          404
        </div>
        <div style={{
          fontSize: 20,
          fontFamily: "'DM Serif Display', serif",
          color: T.text,
          marginBottom: 10,
        }}>
          Page not found
        </div>
        <div style={{
          fontSize: 14,
          color: T.mu,
          lineHeight: 1.6,
          marginBottom: 24,
        }}>
          The page you're looking for doesn't exist.
        </div>
        <a href="/" style={{
          display: 'inline-block',
          padding: '10px 20px',
          background: T.v,
          color: '#fff',
          borderRadius: 9,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}>
          Back to Luminary
        </a>
      </div>
    </div>
  );
}
