import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import FollowBtn from '../components/FollowBtn';
import TopicInterestsPicker from '../components/TopicInterestsPicker';

async function fetchCrossRefDoi(doi) {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
  if (!clean) return null;
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
    if (!r.ok) return null;
    const { message: w } = await r.json();
    return {
      title:   w.title?.[0] || '',
      journal: w['container-title']?.[0] || '',
      year:    w.published?.['date-parts']?.[0]?.[0]?.toString() || '',
      authors: (w.author||[]).slice(0,5).map(a=>`${a.given||''} ${a.family||''}`.trim()).join(', ')
               + ((w.author||[]).length > 5 ? ' et al.' : ''),
      doi:     clean,
      pub_type:'journal',
    };
  } catch { return null; }
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ step }) {
  // step 0 = welcome, 1-3 = wizard steps, 4 = complete
  const total = 4;
  const filled = step; // 0 = none filled, 4 = all filled
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

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingScreen({ user, profile, setProfile, onComplete, onGoToProfile }) {
  const [step, setStep] = useState(0);

  // Step 1 state — topics
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [savingTopics,   setSavingTopics]   = useState(false);

  // Step 2 state — follow researchers
  const [suggested,    setSuggested]    = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [followCount,  setFollowCount]  = useState(0);

  // Step 3 state — publication
  const [pubMode,      setPubMode]      = useState(null); // 'search' | 'doi' | 'skip'
  const [epQuery,      setEpQuery]      = useState('');
  const [epResults,    setEpResults]    = useState([]);
  const [epSearching,  setEpSearching]  = useState(false);
  const [epError,      setEpError]      = useState('');
  const [addedPmids,   setAddedPmids]   = useState(new Set());
  const [addingPmid,   setAddingPmid]   = useState(null);
  const [doiInput,     setDoiInput]     = useState('');
  const [doiPaper,     setDoiPaper]     = useState(null);
  const [doiFetching,  setDoiFetching]  = useState(false);
  const [doiError,     setDoiError]     = useState('');
  const [doiAdded,     setDoiAdded]     = useState(false);
  const [doiAdding,    setDoiAdding]    = useState(false);

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

      // Count follows per user client-side, sort desc, take top 6
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

  // ── Step 3: Europe PMC search ─────────────────────────────────────────────
  const searchEpmc = async () => {
    if (!epQuery.trim()) return;
    setEpSearching(true); setEpError(''); setEpResults([]);
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
        + `?query=${encodeURIComponent(epQuery)}&resultType=core&pageSize=5&format=json`;
      const res  = await fetch(url);
      const data = await res.json();
      setEpResults(data.resultList?.result || []);
      if (!data.resultList?.result?.length) setEpError('No results found. Try a different search.');
    } catch { setEpError('Search failed. Check your connection.'); }
    setEpSearching(false);
  };

  const addEpmcPub = async (pub) => {
    const key = pub.pmid || pub.doi || pub.title;
    setAddingPmid(key);
    await supabase.from('publications').insert({
      user_id:  user.id,
      title:    pub.title,
      journal:  pub.journalTitle || pub.journal || '',
      year:     pub.pubYear?.toString() || '',
      doi:      pub.doi || '',
      authors:  pub.authorString || '',
      pub_type: 'journal',
    });
    setAddedPmids(s => new Set([...s, key]));
    setAddingPmid(null);
  };

  // ── Step 3: DOI lookup ────────────────────────────────────────────────────
  const lookupDoi = async () => {
    if (!doiInput.trim()) return;
    setDoiFetching(true); setDoiError(''); setDoiPaper(null); setDoiAdded(false);
    const result = await fetchCrossRefDoi(doiInput.trim());
    if (!result || !result.title) setDoiError('Could not find a paper for that DOI.');
    else setDoiPaper(result);
    setDoiFetching(false);
  };

  const addDoiPub = async () => {
    if (!doiPaper) return;
    setDoiAdding(true);
    await supabase.from('publications').insert({
      user_id:  user.id,
      title:    doiPaper.title,
      journal:  doiPaper.journal || '',
      year:     doiPaper.year || '',
      doi:      doiPaper.doi || '',
      authors:  doiPaper.authors || '',
      pub_type: doiPaper.pub_type || 'journal',
    });
    setDoiAdded(true);
    setDoiAdding(false);
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

            {/* ── Step 3: Add publication ── */}
            {step === 3 && (
              <>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 6 }}>
                  Add a publication to your profile
                </div>
                <div style={{ fontSize: 13, color: T.mu, marginBottom: 22 }}>
                  Your publication list is one of the most viewed parts of your profile. Add one now to get started.
                </div>

                {/* Mode selection */}
                {!pubMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {[
                      { mode: 'search', icon: '📄', title: 'Search Europe PMC', desc: 'Find your papers by name — we\'ll auto-fill everything' },
                      { mode: 'doi',    icon: '🔗', title: 'Enter a DOI',        desc: 'Paste a DOI and we\'ll fetch the details' },
                      { mode: 'skip',   icon: '⏭️', title: 'Skip for now',       desc: 'You can add publications anytime from your profile' },
                    ].map(({ mode, icon, title, desc }) => (
                      <button
                        key={mode}
                        onClick={() => { if (mode === 'skip') setStep(4); else setPubMode(mode); }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 14,
                          padding: '15px 16px', border: `1.5px solid ${T.bdr}`,
                          borderRadius: 12, background: T.w, cursor: 'pointer',
                          textAlign: 'left', fontFamily: 'inherit',
                          transition: 'border-color .15s, background .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.v; e.currentTarget.style.background = T.v2; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.bdr; e.currentTarget.style.background = T.w; }}
                      >
                        <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>{title}</div>
                          <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.5 }}>{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Europe PMC search */}
                {pubMode === 'search' && (
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={() => { setPubMode(null); setEpResults([]); setEpQuery(''); setEpError(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 14 }}>
                      ← Choose differently
                    </button>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        value={epQuery}
                        onChange={e => setEpQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchEpmc()}
                        placeholder="Search by title, author, or keyword…"
                        style={{ flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 9, padding: '9px 13px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: T.text }}
                      />
                      <button
                        onClick={searchEpmc}
                        disabled={epSearching || !epQuery.trim()}
                        style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.v, color: '#fff', cursor: epQuery.trim() ? 'pointer' : 'default', fontSize: 13, fontFamily: 'inherit', fontWeight: 700, opacity: epQuery.trim() ? 1 : .5 }}>
                        {epSearching ? '…' : 'Search'}
                      </button>
                    </div>
                    {epError && <div style={{ fontSize: 12, color: T.ro, marginBottom: 10 }}>{epError}</div>}
                    {epResults.map(pub => {
                      const key = pub.pmid || pub.doi || pub.title;
                      const added = addedPmids.has(key);
                      const adding = addingPmid === key;
                      return (
                        <div key={key} style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 4, color: T.text }}>{pub.title}</div>
                          <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 8 }}>
                            {[pub.journalTitle, pub.pubYear].filter(Boolean).join(' · ')}
                          </div>
                          {added ? (
                            <span style={{ fontSize: 11.5, color: T.gr, fontWeight: 700 }}>Added ✓</span>
                          ) : (
                            <button
                              onClick={() => addEpmcPub(pub)}
                              disabled={adding}
                              style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${T.v}`, background: T.v, color: '#fff', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 700 }}>
                              {adding ? '…' : 'Add this paper'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {(epResults.length > 0 || addedPmids.size > 0) && (
                      <Btn variant="s" onClick={() => setStep(4)} style={{ width: '100%', padding: '11px', fontSize: 13, marginTop: 8 }}>
                        Done →
                      </Btn>
                    )}
                  </div>
                )}

                {/* DOI input */}
                {pubMode === 'doi' && (
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={() => { setPubMode(null); setDoiInput(''); setDoiPaper(null); setDoiError(''); setDoiAdded(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: T.mu, fontFamily: 'inherit', padding: 0, marginBottom: 14 }}>
                      ← Choose differently
                    </button>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        value={doiInput}
                        onChange={e => { setDoiInput(e.target.value); setDoiPaper(null); setDoiError(''); setDoiAdded(false); }}
                        onKeyDown={e => e.key === 'Enter' && lookupDoi()}
                        placeholder="e.g. 10.1038/nature12345"
                        style={{ flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 9, padding: '9px 13px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: T.text }}
                      />
                      <button
                        onClick={lookupDoi}
                        disabled={doiFetching || !doiInput.trim()}
                        style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: T.v, color: '#fff', cursor: doiInput.trim() ? 'pointer' : 'default', fontSize: 13, fontFamily: 'inherit', fontWeight: 700, opacity: doiInput.trim() ? 1 : .5 }}>
                        {doiFetching ? '…' : 'Look up'}
                      </button>
                    </div>
                    {doiError && <div style={{ fontSize: 12, color: T.ro, marginBottom: 10 }}>{doiError}</div>}
                    {doiPaper && (
                      <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 5, color: T.text }}>{doiPaper.title}</div>
                        {doiPaper.authors && <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 4 }}>{doiPaper.authors}</div>}
                        <div style={{ fontSize: 11.5, color: T.mu }}>
                          {[doiPaper.journal, doiPaper.year].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    )}
                    {doiPaper && !doiAdded && (
                      <button
                        onClick={addDoiPub}
                        disabled={doiAdding}
                        style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: T.v, color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 700, marginBottom: 12 }}>
                        {doiAdding ? '…' : 'Add to my profile'}
                      </button>
                    )}
                    {doiAdded && (
                      <>
                        <div style={{ fontSize: 13, color: T.gr, fontWeight: 700, marginBottom: 14 }}>Added to your profile ✓</div>
                        <Btn variant="s" onClick={() => setStep(4)} style={{ width: '100%', padding: '11px', fontSize: 13 }}>
                          Done →
                        </Btn>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Step 4: Complete ── */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <ProgressBar step={4} />
            <div style={{ fontSize: 48, marginBottom: 20 }}>🎉</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, marginBottom: 12 }}>
              You're all set!
            </div>
            <div style={{ fontSize: 14, color: T.mu, lineHeight: 1.7, marginBottom: 32, maxWidth: 360, margin: '0 auto 32px' }}>
              Your feed is ready. Start exploring research, share a paper, or complete your profile.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Btn variant="s" onClick={handleComplete} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                Go to my feed →
              </Btn>
              <Btn variant="v" onClick={() => { handleComplete(); onGoToProfile?.(); }} style={{ width: '100%', padding: '12px', fontSize: 14 }}>
                Complete my profile
              </Btn>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
