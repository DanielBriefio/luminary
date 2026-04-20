import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import {
  MILESTONES, STAGES, STAGE_REWARDS,
  computeStage, getNextStageMilestones
} from '../lib/profileMilestones';

export default function ProfileCompletionMeter({ profile, user, onAction }) {
  const [stats,    setStats]    = useState({});
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [pubsRes, postsRes, commentsRes, followingRes, groupsRes] =
        await Promise.all([
          supabase.from('publications').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('posts').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('comments').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('follows').select('id', {count:'exact',head:true})
            .eq('follower_id', user.id).eq('target_type', 'user'),
          supabase.from('group_members').select('id', {count:'exact',head:true})
            .eq('user_id', user.id).in('role', ['admin','member']),
        ]);
      setStats({
        publicationCount: pubsRes.count  || 0,
        postCount:        postsRes.count || 0,
        commentCount:     commentsRes.count || 0,
        followingCount:   followingRes.count || 0,
        groupCount:       groupsRes.count || 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [user.id]);

  if (loading) return null;

  const currentStage = computeStage(profile, stats);
  const currentStageDef = STAGES[currentStage] || STAGES[0];
  const nextStageDef    = STAGES[Math.min(currentStage, 4)];
  const { milestones: nextMilestones } = getNextStageMilestones(profile, stats);

  const completedCount  = MILESTONES.filter(m => m.check(profile, stats)).length;
  const totalMilestones = MILESTONES.length;

  if (currentStage === 5) return null;

  return (
    <div style={{
      background: T.w, borderRadius: 12,
      border: `1.5px solid rgba(108,99,255,.2)`,
      marginBottom: 16, overflow: 'hidden',
    }}>

      {/* Collapsed header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '12px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          {STAGES.map((s, i) => (
            <div key={s.number} style={{
              width:  i < currentStage ? 24 : 8,
              height: 8, borderRadius: 4,
              background: i < currentStage ? T.v
                : i === currentStage ? T.v2
                : T.s3,
              border: i === currentStage
                ? `1.5px solid ${T.v}` : 'none',
              transition: 'all .3s',
            }}/>
          ))}
        </div>

        <div style={{flex: 1}}>
          <div style={{fontSize: 12.5, fontWeight: 700}}>
            {currentStageDef.icon} {currentStageDef.label}
            <span style={{fontSize: 11, color: T.mu, fontWeight: 400, marginLeft: 6}}>
              → {nextStageDef.icon} {nextStageDef.label}
            </span>
          </div>
          <div style={{fontSize: 11.5, color: T.mu, marginTop: 1}}>
            {completedCount} of {totalMilestones} milestones complete
          </div>
        </div>

        <span style={{
          fontSize: 12, color: T.mu, transition: 'transform .2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          ▾
        </span>
      </div>

      {expanded && (
        <div style={{borderTop: `1px solid ${T.bdr}`}}>
          {STAGES.map(stageDef => {
            const stageMilestones = MILESTONES.filter(m => m.stage === stageDef.number);
            const stageComplete = stageMilestones.every(m => m.check(profile, stats));
            const isCurrentStage = stageDef.number === currentStage + 1;

            return (
              <div key={stageDef.number} style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${T.bdr}`,
                opacity: stageDef.number > currentStage + 1 ? 0.5 : 1,
              }}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
                  <span style={{fontSize: 16, opacity: stageComplete ? 1 : 0.4}}>
                    {stageDef.icon}
                  </span>
                  <div style={{flex: 1}}>
                    <span style={{fontSize: 12.5, fontWeight: 700, color: stageComplete ? T.gr : T.text}}>
                      Stage {stageDef.number}: {stageDef.label}
                    </span>
                    {stageComplete && STAGE_REWARDS[stageDef.number] && (
                      <div style={{fontSize: 11, color: T.gr, marginTop: 1}}>
                        ✓ {STAGE_REWARDS[stageDef.number]}
                      </div>
                    )}
                  </div>
                  {stageComplete && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      color: T.gr, background: T.gr2,
                      padding: '1px 8px', borderRadius: 20,
                    }}>
                      Complete
                    </span>
                  )}
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 5}}>
                  {stageMilestones.map(m => {
                    const done = m.check(profile, stats);
                    return (
                      <div key={m.id} style={{display: 'flex', alignItems: 'center', gap: 8}}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          flexShrink: 0,
                          background: done ? T.gr : 'transparent',
                          border: `1.5px solid ${done ? T.gr : T.bdr}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {done && (
                            <svg width="9" height="9" viewBox="0 0 12 12">
                              <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" fill="none"/>
                            </svg>
                          )}
                        </div>
                        <span style={{fontSize: 12.5, flex: 1, color: done ? T.mu : T.text}}>
                          {m.label}
                        </span>
                        {!done && isCurrentStage && (
                          <button onClick={() => onAction(m.ctaAction)}
                            style={{
                              fontSize: 11, color: T.v, fontWeight: 700,
                              border: `1px solid ${T.v}`,
                              background: T.v2,
                              borderRadius: 20, padding: '2px 9px',
                              cursor: 'pointer', fontFamily: 'inherit',
                              flexShrink: 0,
                            }}>
                            {m.cta} →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
