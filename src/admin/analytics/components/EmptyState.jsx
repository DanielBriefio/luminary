import { T } from '../../../lib/constants';

export default function EmptyState({ message, hint }) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center',
      fontSize: 13, color: T.mu,
    }}>
      <div style={{ marginBottom: hint ? 4 : 0 }}>{message}</div>
      {hint && (
        <div style={{ fontSize: 12, color: T.mu, fontStyle: 'italic' }}>
          {hint}
        </div>
      )}
    </div>
  );
}
