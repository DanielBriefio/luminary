import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { MILESTONES, STAGES, STAGE_REWARDS, computeStage } from '../lib/profileMilestones';
import { capture } from '../lib/analytics';

function buildMilestoneHtml(heading, message, cta1Label, cta2Label) {
  return `<div style="background:linear-gradient(135deg,#eeecff,#f0f9ff);border-radius:12px;padding:20px 22px;font-family:'DM Sans',sans-serif">` +
    `<div style="height:4px;background:linear-gradient(90deg,#667eea,#764ba2,#f093fb);border-radius:2px;margin-bottom:16px"></div>` +
    `<div style="font-size:32px;margin-bottom:8px">🎉</div>` +
    `<div style="font-family:'DM Serif Display',serif;font-size:18px;margin-bottom:6px;color:#1b1d36">${heading}</div>` +
    `<div style="font-size:13px;color:#7a7fa8;line-height:1.6;margin-bottom:14px">${message}</div>` +
    `<div style="display:flex;gap:8px;flex-wrap:wrap">` +
    `<span style="font-size:13px;font-weight:700;color:#6c63ff">${cta1Label}</span>` +
    `<span style="font-size:13px;color:#7a7fa8">·</span>` +
    `<span style="font-size:13px;font-weight:700;color:#6c63ff">${cta2Label}</span>` +
    `</div></div>`;
}

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

  // Fire celebration when profile reaches stage 5 for the first time
  useEffect(() => {
    if (loading) return;
    const stage = computeStage(profile, stats);
    if (stage < 5) return;
    const flagKey = `luminary_profile_celebrated_${user.id}`;
    // Confetti — fires once per device via localStorage
    if (!localStorage.getItem(flagKey)) {
      localStorage.setItem(flagKey, '1');
      confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.5 },
        colors: ['#6c63ff', '#764ba2', '#f093fb', '#10b981', '#f59e0b', '#ffffff'],
      });
    }

    // Milestone post — always ensure a readable (visibility='everyone') one exists.
    // Deletes any old visibility='private' post left over from before the fix.
    supabase.from('posts').select('id, visibility')
      .eq('user_id', user.id).eq('post_type', 'milestone')
      .then(({ data }) => {
        const readable = (data || []).find(p => p.visibility === 'everyone');
        if (readable) return; // already correct — nothing to do

        // Delete stale private copies then insert a readable one
        const staleIds = (data || []).map(p => p.id);
        const cleanup = staleIds.length
          ? supabase.from('posts').delete().in('id', staleIds)
          : Promise.resolve();

        cleanup.then(async () => {
          const { data: configRow } = await supabase
            .from('admin_config').select('value')
            .eq('key', 'milestone_post_template').single();
          const tpl       = configRow?.value || {};
          const heading   = tpl.heading    || 'Your profile is complete! 🎉';
          const message   = tpl.message    || "You've built your Luminary profile. Share it with colleagues so they can follow your work and publications.";
          const cta1Label = tpl.cta1_label || 'View my profile →';
          const cta2Label = tpl.cta2_label || '🪪 Virtual business card';
          return supabase.from('posts').insert({
            user_id:        user.id,
            target_user_id: user.id,
            post_type:      'milestone',
            visibility:     'everyone',
            content:        buildMilestoneHtml(heading, message, cta1Label, cta2Label),
          });
        });
      });
  }, [loading, profile, stats, user.id]);

  const currentStage = computeStage(profile, stats);

  useEffect(() => {
    if (loading) return;
    const key = `luminary_last_stage_${user.id}`;
    const stored = parseInt(localStorage.getItem(key) || '-1', 10);
    if (stored === -1) {
      localStorage.setItem(key, String(currentStage));
    } else if (currentStage > stored) {
      localStorage.setItem(key, String(currentStage));
      const label = STAGES.find(s => s.number === currentStage)?.label?.toLowerCase() || String(currentStage);
      capture('profile_stage_reached', { stage: label });
    }
  }, [loading, currentStage, user.id]); // eslint-disable-line

  if (loading) return null;
  if (currentStage === 5) return null;

  const nextStageNum   = currentStage + 1;
  const completedCount = MILESTONES.filter(m => m.check(profile, stats)).length;
  const totalMilestones = MILESTONES.length;
  const nextReward     = STAGE_REWARDS[nextStageNum];

  const incomplete = MILESTONES.filter(m => !m.check(profile, stats));
  const completed  = MILESTONES.filter(m =>  m.check(profile, stats));
  const sorted     = [...incomplete, ...completed];

  return (
    <div style={{
      background: T.w, borderRadius: 12,
      border: `1.5px solid rgba(108,99,255,.2)`,
      marginBottom: 16, overflow: 'hidden',
    }}>

      {/* Clickable header — compact single row */}
      <div onClick={() => setExpanded(e => !e)} style={{padding: '10px 14px', cursor: 'pointer'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          {/* Slim progress bar with stage dividers */}
          <div style={{flex:1, height:5, borderRadius:3, background: T.s3, position:'relative'}}>
            <div style={{
              height:'100%', borderRadius:3, background: T.v,
              width: `${Math.round((completedCount / totalMilestones) * 100)}%`,
              transition: 'width .4s',
            }}/>
            {[3,6,9,12].map(t => (
              <div key={t} style={{
                position:'absolute', top:0, bottom:0,
                left: `${Math.round((t / totalMilestones) * 100)}%`,
                width: 2, background: T.w,
              }}/>
            ))}
          </div>
          <span style={{fontSize:11.5, color: T.mu, whiteSpace:'nowrap', flexShrink:0}}>
            Profile {Math.round((completedCount / totalMilestones) * 100)}% complete
          </span>
          <span style={{
            fontSize: 11, color: T.mu, flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            display: 'inline-block', transition: 'transform .2s',
          }}>▾</span>
        </div>
      </div>

      {/* Expanded milestone list */}
      {expanded && (
        <div style={{borderTop: `1px solid ${T.bdr}`}}>

          {/* Stage rewards reference */}
          <div style={{padding: '10px 16px 6px', display: 'flex', flexDirection: 'column', gap: 4}}>
            {STAGES.map(s => {
              const unlocked = s.number <= currentStage;
              return (
                <div key={s.number} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, color: unlocked ? T.gr : T.mu,
                }}>
                  <span style={{fontSize: 12}}>{s.icon}</span>
                  <span style={{fontWeight: 700, minWidth: 64}}>Stage {s.number}: {s.label}</span>
                  <span style={{color: unlocked ? T.gr : T.mu}}>
                    {unlocked ? '✓ ' : '🔒 '}{STAGE_REWARDS[s.number]}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{borderTop: `1px solid ${T.bdr}`, padding: '10px 16px', display:'flex', flexDirection:'column', gap:6}}>
            {sorted.map(m => {
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
                    textDecoration: done ? 'line-through' : 'none',
                  }}>
                    {m.label}
                  </span>

                  {!done && (
                    <button
                      onClick={e => { e.stopPropagation(); onAction(m.ctaAction); }}
                      style={{
                        fontSize: 11, color: T.v, fontWeight: 700,
                        border: `1px solid ${T.v}`, background: T.v2,
                        borderRadius: 20, padding: '2px 9px',
                        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                      }}>
                      {(m.ctaLabels?.[profile?.work_mode || 'researcher'] || m.cta)} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
