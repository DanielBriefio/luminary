import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, TIER1_LIST, getTier2, WORK_MODES, LUMENS_ENABLED } from '../lib/constants';
import Av from '../components/Av';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import FollowBtn from '../components/FollowBtn';
import TopicInterestsPicker from '../components/TopicInterestsPicker';

// ── Progress bar (setup steps 3–6 = dots 1–4) ────────────────────────────────
function ProgressBar({ step }) {
  const total  = 4;
  const filled = Math.max(0, step - 2); // step3→1, step4→2, step5→3, step6→4
  return (
    <div style={{ display: 'flex', gap: 5, marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: i < filled ? T.v : T.s3,
          transition: 'background .3s',
        }}/>
      ))}
    </div>
  );
}

// ── Import option card ────────────────────────────────────────────────────────
function ImportCard({ icon, title, desc, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '15px 16px', border: `1.5px solid ${hover ? T.v : T.bdr}`,
        borderRadius: 12, background: hover ? T.v2 : T.w, cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit', width: '100%',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <span style={{ fontSize: 24, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <span style={{ marginLeft: 'auto', color: T.mu, fontSize: 14, flexShrink: 0, alignSelf: 'center' }}>→</span>
    </button>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, badge }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px', border: `1.5px solid ${T.bdr}`,
      borderRadius: 12, background: T.s2,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 10, fontWeight: 700, color: T.v, background: T.v2, padding: '1px 7px', borderRadius: 20 }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingScreen({ user, profile, setProfile, onComplete, onGoToProfile }) {
  const [step, setStep] = useState(0);

  // Step 1 state — work mode
  const [workMode, setWorkMode] = useState('researcher');

  // Step 3 state — professional identity
  const [identityTier1, setIdentityTier1] = useState('');
  const [identityTier2, setIdentityTier2] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Step 4 state — topics
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [savingTopics,   setSavingTopics]   = useState(false);

  // Step 5 state — follow researchers
  const [suggested,      setSuggested]      = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [followCount,    setFollowCount]    = useState(0);

  // Load suggested researchers when arriving at step 5
  useEffect(() => {
    if (step !== 5) return;
    setSuggestLoading(true);
    (async () => {
      const { data } = await supabase
        .from('follows')
        .select('target_id')
        .eq('target_type', 'user')
        .neq('target_id', user.id);

      const counts = {};
      (data || []).forEach(f => { counts[f.target_id] = (counts[f.target_id] || 0) + 1; });
      const topIds = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id]) => id);

      if (!topIds.length) { setSuggested([]); setSuggestLoading(false); return; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, title, institution, avatar_color, avatar_url')
        .in('id', topIds);
      setSuggested(profiles || []);
      setSuggestLoading(false);
    })();
  }, [step, user.id]);

  const handleComplete = async () => {
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
    setProfile(p => ({ ...p, onboarding_completed: true }));
    capture('onboarding_completed');
    if (LUMENS_ENABLED) {
      try {
        supabase.rpc('award_lumens', {
          p_user_id:  user.id,
          p_amount:   25,
          p_reason:   'onboarding_completed',
          p_category: 'creation',
          p_meta:     {},
        }).catch(() => {});
      } catch {}
    }
    onComplete();
  };

  // Step 3: save professional identity and advance
  const saveIdentity = async () => {
    setSavingIdentity(true);
    await supabase.from('profiles')
      .update({ identity_tier1: identityTier1, identity_tier2: identityTier2 })
      .eq('id', user.id);
    setProfile(p => ({ ...p, identity_tier1: identityTier1, identity_tier2: identityTier2 }));
    setSavingIdentity(false);
    setStep(4);
  };

  // Step 4: save topics and advance
  const saveTopics = async () => {
    setSavingTopics(true);
    await supabase.from('profiles')
      .update({ topic_interests: selectedTopics })
      .eq('id', user.id);
    setProfile(p => ({ ...p, topic_interests: selectedTopics }));
    setSavingTopics(false);
    setStep(5);
  };

  // Step 5: import choice — completes onboarding immediately
  const handleImportChoice = (flag) => {
    sessionStorage.removeItem('onboarding_import');
    if (flag) {
      sessionStorage.setItem('onboarding_import', flag);
      handleComplete().then(() => onGoToProfile?.());
    } else {
      handleComplete();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(27,29,54,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans',sans-serif", fontSize: 13,
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        background: T.w, borderRadius: 20, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 80px rgba(108,99,255,.22)',
        padding: '32px 36px',
        margin: '0 16px',
      }}>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🔬</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, marginBottom: 12 }}>
              Welcome to Luminary
            </div>
            <div style={{ fontSize: 14, color: T.mu, lineHeight: 1.7, marginBottom: 32, maxWidth: 380, margin: '0 auto 32px' }}>
              The home for researchers who want more than a PDF repository.
              Let's set up your profile in a couple of minutes.
            </div>
            <Btn variant="s" onClick={() => setStep(1)} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
              Get started →
            </Btn>
          </div>
        )}

        {/* ── Step 1: Work mode ── */}
        {step === 1 && (
          <div>
            <button
              onClick={() => setStep(0)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, marginBottom: 6 }}>
              What best describes your work?
            </div>
            <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
              This helps Luminary show you the most relevant content and people. You can change this anytime in Settings.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {WORK_MODES.map(mode => (
                <button key={mode.id}
                  onClick={() => setWorkMode(mode.id)}
                  style={{
                    padding: '14px 16px', borderRadius: 12,
                    cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', display: 'flex',
                    alignItems: 'center', gap: 14,
                    border: `2px solid ${workMode === mode.id ? T.v : T.bdr}`,
                    background: workMode === mode.id ? T.v2 : T.w,
                    transition: 'all .12s',
                  }}>
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{mode.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2, color: workMode === mode.id ? T.v : T.text }}>
                      {mode.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: T.mu }}>{mode.description}</div>
                  </div>
                  {workMode === mode.id && (
                    <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.v} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <Btn variant="s" onClick={async () => {
              await supabase.from('profiles').update({ work_mode: workMode }).eq('id', user.id);
              setProfile(p => ({ ...p, work_mode: workMode }));
              setStep(2);
            }} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
              Next →
            </Btn>
          </div>
        )}

        {/* ── Step 2: Feature overview ── */}
        {step === 2 && (
          <div>
            <button
              onClick={() => setStep(1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
              Your research identity, all in one place
            </div>
            <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
              Here's what you can do with Luminary:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <FeatureCard
                icon="🌐"
                title="Public profile page"
                desc="A beautiful page at luminary.app/p/your-name — perfect for conference posters and email signatures"
                badge="My Profile → Share"
              />
              <FeatureCard
                icon="🔗"
                title="QR code & virtual business card"
                desc="Generate a QR code for slides or posters, or install Luminary on your phone as a tap-to-share card"
                badge="My Profile → Share"
              />
              <FeatureCard
                icon="📚"
                title="Publication list"
                desc="Import from ORCID, LinkedIn, CV, or PubMed. Sorted, formatted, and shareable automatically"
                badge="My Profile → Publications"
              />
              <FeatureCard
                icon="📡"
                title="Research feed & discovery"
                desc="Follow researchers and papers by DOI. Your feed surfaces the work you care about — no algorithm noise"
              />
              <FeatureCard
                icon="📤"
                title="CV export"
                desc="Export your profile as a formatted publication list — useful for grant applications and department reports"
                badge="My Profile → Export"
              />
            </div>
            <Btn variant="s" onClick={() => setStep(3)} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
              Set up my profile →
            </Btn>
          </div>
        )}

        {/* ── Steps 3–6 (setup) ── */}
        {step >= 3 && step <= 6 && (
          <>
            <ProgressBar step={step} />

            {/* Back button */}
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>

            {/* ── Step 3: Professional identity ── */}
            {step === 3 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  {workMode === 'clinician' ? 'What is your clinical speciality?' : 'What is your primary field?'}
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
                  This appears as a badge on your profile. Pick your main discipline.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {TIER1_LIST.map(t1 => (
                    <button key={t1}
                      onClick={() => { setIdentityTier1(t1); setIdentityTier2(''); }}
                      style={{
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left', fontSize: 12,
                        fontWeight: identityTier1 === t1 ? 700 : 500,
                        border: `2px solid ${identityTier1 === t1 ? T.v : T.bdr}`,
                        background: identityTier1 === t1 ? T.v2 : T.w,
                        color: identityTier1 === t1 ? T.v : T.text,
                        lineHeight: 1.3,
                      }}>
                      {t1}
                    </button>
                  ))}
                </div>

                {identityTier1 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: T.text }}>
                      Speciality within {identityTier1}:
                    </label>
                    <select value={identityTier2}
                      onChange={e => setIdentityTier2(e.target.value)}
                      style={{
                        width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
                        borderRadius: 9, padding: '10px 13px', fontSize: 13,
                        fontFamily: 'inherit', outline: 'none', color: T.text,
                      }}>
                      <option value="">Select your speciality...</option>
                      {getTier2(identityTier1).map(t2 =>
                        <option key={t2} value={t2}>{t2}</option>
                      )}
                    </select>
                  </div>
                )}

                <Btn
                  variant="s"
                  onClick={saveIdentity}
                  disabled={!identityTier1 || !identityTier2 || savingIdentity}
                  style={{ width: '100%', padding: '11px', fontSize: 13, opacity: (!identityTier1 || !identityTier2) ? .5 : 1 }}>
                  {savingIdentity ? 'Saving…' : 'Next →'}
                </Btn>
              </>
            )}

            {/* ── Step 4: Topics ── */}
            {step === 4 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  What topics do you want to follow?
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 22, lineHeight: 1.6 }}>
                  Your identity says who you are. Your interests shape your feed.
                  Pick at least 3.
                </div>
                <TopicInterestsPicker
                  selected={selectedTopics}
                  onChange={setSelectedTopics}
                  minRequired={3}
                />
                <Btn
                  variant="s"
                  onClick={saveTopics}
                  disabled={selectedTopics.length < 3 || savingTopics}
                  style={{ width: '100%', padding: '11px', fontSize: 13, marginTop: 20, opacity: selectedTopics.length < 3 ? .5 : 1 }}>
                  {savingTopics ? 'Saving…' : 'Next →'}
                </Btn>
              </>
            )}

            {/* ── Step 5: Follow researchers ── */}
            {step === 5 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  Follow researchers in your field
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 22 }}>
                  Your Following feed shows only people you follow. Start with a few.
                </div>

                {suggestLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}><Spinner /></div>
                ) : suggested.length === 0 ? (
                  <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '24px 20px', textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🌱</div>
                    <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6 }}>
                      You're one of the first! Check back soon as more researchers join.
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    {suggested.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${T.bdr}`, borderRadius: 12, marginBottom: 10 }}>
                        <Av color={p.avatar_color || 'me'} size={40} name={p.name} url={p.avatar_url || ''} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || 'Researcher'}</div>
                          <div style={{ fontSize: 11.5, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[p.title, p.institution].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <FollowBtn
                          targetType="user"
                          targetId={p.id}
                          currentUserId={user.id}
                          onToggle={now => setFollowCount(c => now ? c + 1 : Math.max(0, c - 1))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Btn variant="s" onClick={() => setStep(6)} style={{ width: '100%', padding: '11px', fontSize: 13 }}>
                  {followCount > 0 ? `Following ${followCount} researcher${followCount !== 1 ? 's' : ''} →` : 'Next →'}
                </Btn>
              </>
            )}

            {/* ── Step 6: Import publications ── */}
            {step === 6 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  Build your publication list
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 22, lineHeight: 1.6 }}>
                  Your publications are one of the most-viewed parts of your profile. Import them now or add them later from <strong>My Profile</strong>.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <ImportCard
                    icon="📄"
                    title="Upload your CV"
                    desc="Upload a PDF or DOCX — we'll extract publications, work history, and more automatically"
                    onClick={() => handleImportChoice('cv')}
                  />
                  <ImportCard
                    icon="💼"
                    title="Import from LinkedIn"
                    desc="Export your LinkedIn data and import your profile, experience, and publications at once"
                    onClick={() => handleImportChoice('linkedin')}
                  />
                  <ImportCard
                    icon="🔬"
                    title="Import from ORCID"
                    desc="Connect your ORCID iD to import your publications and work history directly"
                    onClick={() => handleImportChoice('orcid')}
                  />
                  <ImportCard
                    icon="🔍"
                    title="Search Europe PMC"
                    desc="Find your papers by name or keyword in the PubMed / Europe PMC database"
                    onClick={() => handleImportChoice('pmc_search')}
                  />
                  <ImportCard
                    icon="🔗"
                    title="Import by DOI"
                    desc="Paste a DOI to import a specific paper directly — great for preprints and non-indexed work"
                    onClick={() => handleImportChoice('doi_lookup')}
                  />
                </div>

                <button
                  onClick={() => handleImportChoice(null)}
                  style={{ display: 'block', margin: '0 auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit' }}>
                  Skip for now — I'll do this from My Profile later
                </button>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
