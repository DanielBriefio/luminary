import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import FollowBtn from '../components/FollowBtn';
import TopicInterestsPicker from '../components/TopicInterestsPicker';

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  // 3 setup steps (1-3), step 4 is the showcase (no bar dot needed)
  const total = 3;
  const filled = Math.min(step, total);
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

// ── Feature showcase card ─────────────────────────────────────────────────────
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

  // Step 1 state — topics
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [savingTopics,   setSavingTopics]   = useState(false);

  // Step 2 state — follow researchers
  const [suggested,      setSuggested]      = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [followCount,    setFollowCount]    = useState(0);

  // Load suggested researchers when arriving at step 2
  useEffect(() => {
    if (step !== 2) return;
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
    onComplete();
  };

  // ── Step 1: save topics ───────────────────────────────────────────────────
  const saveTopics = async () => {
    setSavingTopics(true);
    await supabase.from('profiles')
      .update({ topic_interests: selectedTopics })
      .eq('id', user.id);
    setProfile(p => ({ ...p, topic_interests: selectedTopics }));
    setSavingTopics(false);
    setStep(2);
  };

  // ── Step 3: import option handlers ───────────────────────────────────────
  const handleImportChoice = (flag) => {
    if (flag !== 'skip') sessionStorage.setItem('onboarding_import', flag);
    setStep(4);
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
              Let's set up your profile in 2 minutes.
            </div>
            <Btn variant="s" onClick={() => setStep(1)} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
              Get started →
            </Btn>
            <button
              onClick={handleComplete}
              style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit' }}>
              Skip for now
            </button>
          </div>
        )}

        {/* ── Steps 1–3 ── */}
        {step >= 1 && step <= 3 && (
          <>
            <ProgressBar step={step} />

            {/* Back button */}
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Back
            </button>

            {/* ── Step 1: Topics ── */}
            {step === 1 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  What topics are you interested in?
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 22 }}>
                  Pick at least 3. Your feed will be tailored to these.
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

            {/* ── Step 2: Follow researchers ── */}
            {step === 2 && (
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

                <Btn variant="s" onClick={() => setStep(3)} style={{ width: '100%', padding: '11px', fontSize: 13 }}>
                  {followCount > 0 ? `Following ${followCount} researcher${followCount !== 1 ? 's' : ''} →` : 'Next →'}
                </Btn>
              </>
            )}

            {/* ── Step 3: Import publications ── */}
            {step === 3 && (
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
                  onClick={() => setStep(4)}
                  style={{ display: 'block', margin: '0 auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.mu, fontFamily: 'inherit' }}>
                  Skip for now — I'll do this from My Profile later
                </button>
              </>
            )}
          </>
        )}

        {/* ── Step 4: Feature showcase ── */}
        {step === 4 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>🎉</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 8 }}>
                You're all set!
              </div>
              <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
                Here's a quick look at what Luminary can do for you — all built around your research identity.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <FeatureCard
                icon="🌐"
                title="Public profile page"
                desc="Share a beautiful public profile page at luminary.app/p/your-name — perfect for conference posters and email signatures"
                badge="My Profile → Share"
              />
              <FeatureCard
                icon="📱"
                title="Virtual business card"
                desc="Install Luminary on your phone's home screen and share your contact details with a tap — no paper needed"
                badge="Mobile PWA"
              />
              <FeatureCard
                icon="🔗"
                title="QR code for your profile"
                desc="Generate a QR code that links directly to your public profile — add it to slides, posters, or print it on your badge"
                badge="My Profile → Share"
              />
              <FeatureCard
                icon="📚"
                title="Publication list"
                desc="Import from ORCID, LinkedIn, or CV upload. Share a clean list of your work, sorted and formatted automatically"
                badge="My Profile → Publications"
              />
              <FeatureCard
                icon="📤"
                title="CV & publication export"
                desc="Export your profile as a formatted CV — useful for grant applications, job searches, and department reports"
                badge="My Profile → Export"
              />
              <FeatureCard
                icon="📡"
                title="Research feed & discovery"
                desc="Follow researchers and papers by DOI. Your feed surfaces the work you care about — no algorithm noise"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Btn variant="s" onClick={() => { sessionStorage.removeItem('onboarding_import'); handleComplete(); }} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                Go to my feed →
              </Btn>
              <Btn variant="v" onClick={() => { handleComplete().then(() => onGoToProfile?.()); }} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                Complete my profile
              </Btn>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
