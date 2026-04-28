import { useEffect, useState } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';
import SectionCard from './components/SectionCard';
import UserRow from './components/UserRow';
import EmptyState from './components/EmptyState';
import BulkNudgeModal from '../BulkNudgeModal';

function NudgeBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11.5, fontWeight: 700,
        color: T.v3, background: T.v2,
        border: `1px solid ${T.v}40`, borderRadius: 7,
        padding: '5px 10px', cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      Nudge
    </button>
  );
}

export default function BehaviourTab({ supabase, days }) {
  const [loading, setLoading] = useState(true);
  const [posters, setPosters]       = useState([]);
  const [commenters, setCommenters] = useState([]);
  const [atRisk, setAtRisk]         = useState([]);
  const [quiet, setQuiet]           = useState([]);
  const [nudgeTarget, setNudgeTarget] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pp, pc, ar, qc] = await Promise.all([
        supabase.rpc('get_power_posters',    { p_days: days, p_limit: 20 }),
        supabase.rpc('get_power_commenters', { p_days: days, p_limit: 20 }),
        supabase.rpc('get_at_risk_users',    { p_limit: 30 }),
        supabase.rpc('get_quiet_champions',  { p_limit: 30 }),
      ]);
      setPosters(pp.data || []);
      setCommenters(pc.data || []);
      setAtRisk(ar.data || []);
      setQuiet(qc.data || []);
      setLoading(false);
    })();
  }, [supabase, days]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner/></div>;

  return (
    <div>
      {/* Power posters */}
      <SectionCard
        title="Power posters"
        subtitle="Most active posters in the selected window"
      >
        {posters.length === 0 ? (
          <EmptyState message="No posts in the selected window."/>
        ) : (
          posters.map(u => (
            <UserRow
              key={u.user_id}
              user={u}
              primary={{ value: u.post_count, label: 'posts' }}
              secondary={`${u.lumens} lumens`}
            />
          ))
        )}
      </SectionCard>

      {/* Power commenters */}
      <SectionCard
        title="Power commenters"
        subtitle="Substantive (>50 char) comments in the selected window"
      >
        {commenters.length === 0 ? (
          <EmptyState message="No substantive comments in the selected window."/>
        ) : (
          commenters.map(u => (
            <UserRow
              key={u.user_id}
              user={u}
              primary={{ value: u.comment_count, label: 'comments' }}
              secondary={`${u.lumens} lumens`}
            />
          ))
        )}
      </SectionCard>

      {/* At risk */}
      <SectionCard
        title="At-risk users"
        subtitle="≥3 actions, silent for 7+ days, signed up 14+ days ago"
      >
        {atRisk.length === 0 ? (
          <EmptyState message="No users currently silent for 7+ days."/>
        ) : (
          atRisk.map(u => (
            <UserRow
              key={u.user_id}
              user={u}
              primary={{ value: `${u.days_silent}d`, label: 'silent' }}
              secondary={`${u.total_posts} posts · ${u.lumens} lumens`}
              action={<NudgeBtn onClick={() => setNudgeTarget(u)}/>}
            />
          ))
        )}
      </SectionCard>

      {/* Quiet champions */}
      <SectionCard
        title="Quiet champions"
        subtitle="3+ followers but fewer than 3 posts — credibility without voice"
      >
        {quiet.length === 0 ? (
          <EmptyState message="No quiet champions right now."/>
        ) : (
          quiet.map(u => (
            <UserRow
              key={u.user_id}
              user={u}
              primary={{ value: u.follower_count, label: 'followers' }}
              secondary={`${u.post_count} posts`}
              action={<NudgeBtn onClick={() => setNudgeTarget(u)}/>}
            />
          ))
        )}
      </SectionCard>

      {nudgeTarget && (
        <BulkNudgeModal
          supabase={supabase}
          targetUsers={[nudgeTarget]}
          onClose={() => setNudgeTarget(null)}
          onSent={() => setNudgeTarget(null)}
        />
      )}
    </div>
  );
}
