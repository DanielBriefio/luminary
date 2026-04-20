import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { MILESTONES, STAGES, STAGE_REWARDS, computeStage, getNextStageMilestones } from '../lib/profileMilestones';

export default function ProfileCompletionMeter({ profile, user, onAction }) {
  const [stats,    setStats]    = useState({});
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('publications').select('id', {count:'exact',head:true}).eq('user_id', user.id),
      supabase.from('posts').select('id', {count:'exact',head:true}).eq('user_id', user.id),
      supabase.from('comments').select('id', {count:'exact',head:true}).eq('user_id', user.id),
      supabase.from('follows').select('id', {count:'exact',head:true}).eq('follower_id', user.id).eq('target_type', 'user'),
      supabase.from('group_members').select('id', {count:'exact',head:true}).eq('user_id', user.id).in('role', ['admin','member']),
    ]).then(([pubs, posts, comments, following, groups]) => {
      setStats({
        publicationCount: pubs.count    || 0,
        postCount:        posts.count   || 0,
        commentCount:     comments.count|| 0,
        followingCount:   following.count|| 0,
        groupCount:       groups.count  || 0,
      });
      setLoading(false);
    });
  }, [user.id]);

  if (loading) return null;

  const currentStage = computeStage(profile, stats);
  if (currentStage === 5) return null;

  const nextStageNum = currentStage + 1;
  const completedCount  = MILESTONES.filter(m => m.check(profile, stats)).length;
  const totalMilestones = MILESTONES.length;
  const nextReward = STAGE_REWARDS[nextStageNum];
  const { milestones: nextMilestones } = getNextStageMilestones(profile, stats);

  return (
    <div style={{
      background: T.w, borderRadius: 12,
      border: `1.5px solid rgba(108,99,255,.2)`,
      marginBottom: 16, overflow: 'hidden',
    }}>

      {/* Clickable header */}
      <div onClick={() => setExpanded(e => !e)} style={{padding: '14px 16px', cursor: 'pointer'}}>

        {/* Title row */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 10}}>
          <div>
            <div style={{fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2}}>
              Complete your profile to unlock more features
            </div>
            {nextReward && (
              <div style={{fontSize: 11.5, color: T.v, fontWeight: 600}}>
                → Next unlock: {nextReward}
              </div>
            )}
            <div style={{fontSize: 11, color: T.mu, marginTop: 2}}>
              {completedCount} of {totalMilestones} milestones complete
            </div>
          </div>
          <span style={{
            fontSize: 13, color: T.mu, marginLeft: 8, flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            display: 'inline-block', transition: 'transform .2s',
          }}>▾</span>
        </div>

        {/* Stage labels above the bar */}
        <div style={{display: 'flex', marginBottom: 4}}>
          {STAGES.map(s => {
            const done = s.number <= currentStage;
            const current = s.number === nextStageNum;
            return (
              <div key={s.number} style={{
                flex: 1, textAlign: 'center',
                fontSize: 10, fontWeight: current || done ? 700 : 400,
                color: done ? T.v : current ? T.text : T.mu,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                paddingBottom: 2,
              }}>
                {done ? '✓ ' : ''}{s.label}
              </div>
            );
          })}
        </div>

        {/* Segmented progress bar */}
        <div style={{display: 'flex', gap: 3, height: 8}}>
          {STAGES.map(s => {
            const done    = s.number <= currentStage;
            const current = s.number === nextStageNum;
            return (
              <div key={s.number} style={{
                flex: 1, borderRadius: 4,
                background: done ? T.v : current ? T.v2 : T.s3,
                border: current ? `1.5px solid ${T.v}` : 'none',
                transition: 'background .3s',
              }}/>
            );
          })}
        </div>
      </div>

      {/* Expanded milestone list */}
      {expanded && (
        <div style={{borderTop: `1px solid ${T.bdr}`}}>
          {STAGES.map(stageDef => {
            const stageMilestones = MILESTONES.filter(m => m.stage === stageDef.number);
            const stageComplete   = stageMilestones.every(m => m.check(profile, stats));
            const isNext          = stageDef.number === nextStageNum;
            const isFuture        = stageDef.number > nextStageNum;

            return (
              <div key={stageDef.number} style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${T.bdr}`,
                opacity: isFuture ? 0.45 : 1,
              }}>
                {/* Stage header */}
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <span style={{fontSize:15}}>{stageDef.icon}</span>
                  <div style={{flex:1}}>
                    <span style={{
                      fontSize: 12.5, fontWeight: 700,
                      color: stageComplete ? T.gr : T.text,
                    }}>
                      Stage {stageDef.number}: {stageDef.label}
                    </span>
                    {stageComplete && STAGE_REWARDS[stageDef.number] && (
                      <div style={{fontSize:11, color:T.gr, marginTop:1}}>
                        ✓ Unlocked: {STAGE_REWARDS[stageDef.number]}
                      </div>
                    )}
                    {isNext && !stageComplete && nextReward && (
                      <div style={{fontSize:11, color:T.v, marginTop:1}}>
                        Complete to unlock: {nextReward}
                      </div>
                    )}
                  </div>
                  {stageComplete && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: T.gr, background: T.gr2,
                      padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                    }}>Complete</span>
                  )}
                </div>

                {/* Milestone rows */}
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {stageMilestones.map(m => {
                    const done = m.check(profile, stats);
                    return (
                      <div key={m.id} style={{display:'flex', alignItems:'center', gap:8}}>
                        {/* Checkbox circle */}
                        <div style={{
                          width:16, height:16, borderRadius:'50%', flexShrink:0,
                          background: done ? T.gr : 'transparent',
                          border: `1.5px solid ${done ? T.gr : T.bdr}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          {done && (
                            <svg width="9" height="9" viewBox="0 0 12 12">
                              <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" fill="none"/>
                            </svg>
                          )}
                        </div>

                        <span style={{
                          fontSize: 12.5, flex: 1,
                          color: done ? T.mu : T.text,
                        }}>
                          {m.label}
                        </span>

                        {!done && isNext && (
                          <button
                            onClick={e => { e.stopPropagation(); onAction(m.ctaAction); }}
                            style={{
                              fontSize: 11, color: T.v, fontWeight: 700,
                              border: `1px solid ${T.v}`, background: T.v2,
                              borderRadius: 20, padding: '2px 9px',
                              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
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
