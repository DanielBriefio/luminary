import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  T,
  ORCID_CLIENT_ID,
  ORCID_AUTHORIZE_URL,
  ORCID_REDIRECT_URI,
} from '../lib/constants';
import { useWindowSize } from '../lib/useWindowSize';

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '📄',
    title: 'Share & Discuss',
    desc: 'Post papers, preprints, and clinical insights. Discuss findings with peers who understand the science. Follow topics and authors that matter to your work.',
  },
  {
    icon: '🔬',
    title: 'Connect & Collaborate',
    desc: 'Build a verified scientific profile. Find researchers, clinicians, and medical affairs professionals in your field. Groups bring the right people together.',
  },
  {
    icon: '📚',
    title: 'Organise & Build',
    desc: 'Your personal library for papers and references. Projects to coordinate research. Templates built for how scientific teams actually work.',
  },
];

const WHO_FOR = [
  {
    icon: '🔬',
    role: 'Researchers',
    desc: 'Share your work, follow the literature, connect with translational partners, and build a presence that reflects your full scientific identity.',
    color: T.v,
    bg:    T.v2,
  },
  {
    icon: '🏥',
    role: 'Clinicians',
    desc: 'Stay current with evidence that matters to your practice. Connect with researchers and industry across the bench-to-bedside gap.',
    color: T.gr,
    bg:    T.gr2,
  },
  {
    icon: '🏭',
    role: 'Industry',
    desc: 'Engage with the scientific community authentically. Whether in pharma, medtech, or biotech — build credibility, follow the evidence landscape, and connect with researchers doing work that matters to your field.',
    color: T.bl,
    bg:    T.bl2,
  },
];

const USE_CASES = [
  {
    icon: '📄',
    tag: 'Paper posts',
    headline: 'Discuss science around real papers',
    scenario: 'You find a landmark trial that changes your thinking. Upload the DOI, write your takeaway, and invite colleagues to comment. Luminary was built around exactly this — sharing and debating evidence in context.',
  },
  {
    icon: '✍️',
    tag: 'Rich posts',
    headline: 'Share more than papers',
    scenario: 'Science lives beyond journals. Post images, videos, links, and data files. Write deep-dive posts with rich text formatting — structured, article-style content that lets your thinking breathe.',
  },
  {
    icon: '🪪',
    tag: 'Business card',
    headline: 'Exchange profiles at conferences',
    scenario: 'You\'re presenting at AHA 2026 and meet a colleague at your poster. They scan your QR code, instantly see your full profile and publications, and connect with you on Luminary — even after you\'ve moved on.',
  },
  {
    icon: '📌',
    tag: 'QR on posters',
    headline: 'Let your poster find you',
    scenario: 'Print your Luminary QR on your conference poster. Colleagues who visit when you\'re not there can scan it, explore your background, follow your work, and reach out directly — no business cards needed.',
  },
  {
    icon: '🤖',
    tag: 'AI profile import',
    headline: 'Build your profile in minutes',
    scenario: 'Upload your CV as a PDF and our AI fills in your work history, education, and publications automatically. Or import directly from ORCID or LinkedIn. Your scientific identity, properly represented.',
  },
  {
    icon: '📖',
    tag: 'Groups',
    headline: 'Run your journal club on Luminary',
    scenario: 'Create a private group for your research team. Announce the paper, share pre-reads, collect questions, and post a summary for everyone who couldn\'t attend. All in one place, searchable forever.',
  },
  {
    icon: '🔭',
    tag: 'Groups + Projects',
    headline: 'Organise your research group',
    scenario: 'Private group feed for day-to-day discussion. Separate project spaces for each initiative — grant applications, lab protocols, manuscript drafts. Your team\'s knowledge, structured and findable.',
  },
  {
    icon: '✈️',
    tag: 'Groups',
    headline: 'Collaborate at conferences',
    scenario: 'Create a temporary group before a major conference. Share the agenda, pre-reads, and booth assignments. Capture poster photos, insights, and contacts during the event. A living record of the conference for the whole team.',
  },
  {
    icon: '🏛️',
    tag: 'Projects',
    headline: 'Manage your advisory board',
    scenario: 'Prepare and run advisory boards with a structured project space. Share briefing documents, collect advisor input, track action items, and keep the whole team aligned — internally and with external advisors.',
  },
  {
    icon: '🧪',
    tag: 'Projects',
    headline: 'Onboard new lab members',
    scenario: 'Use a structured onboarding project with reading lists, protocols, introductions, and orientation posts. New members get up to speed faster; institutional knowledge stops living only in people\'s heads.',
  },
  {
    icon: '⭐',
    tag: 'Follow',
    headline: 'Learn from scientific leaders',
    scenario: 'Follow researchers you admire. Track their new publications as they\'re shared on Luminary. Read their posts, deep-dives, and paper annotations. Let the people doing the most interesting work inform yours.',
  },
  {
    icon: '📚',
    tag: 'Library',
    headline: 'Build your evidence library',
    scenario: 'Save papers from Europe PMC, enter DOIs, or import from .ris and .bib files. Organise into folders by topic or project. Your personal reference collection — searchable, shareable, always with you.',
  },
];

// ─── LandingScreen ────────────────────────────────────────────────────────────

export default function LandingScreen({ supabase, onShowAuth }) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const inviteRef   = useRef(null);
  const waitlistRef = useRef(null);
  const { isMobile } = useWindowSize();

  const scrollToWaitlist = () => {
    waitlistRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInviteClick = () => {
    setShowInviteForm(true);
    setTimeout(() => {
      inviteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // Matches AuthScreen.handleOrcidOAuth exactly
  const handleOrcid = () => {
    const params = new URLSearchParams({
      client_id:     ORCID_CLIENT_ID,
      response_type: 'code',
      scope:         '/authenticate',
      redirect_uri:  ORCID_REDIRECT_URI,
      state:         'signup',
    });
    window.location.href = `${ORCID_AUTHORIZE_URL}?${params}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      fontFamily: "'DM Sans',sans-serif",
      color: T.text,
    }}>

      {/* ── Sticky header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(242,243,251,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.bdr}`,
        padding: isMobile ? '0 14px' : '0 32px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        height: isMobile ? 52 : 56,
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: isMobile ? 20 : 22, color: T.text, letterSpacing: -0.3,
        }}>
          Lumi<span style={{ color: T.v }}>nary</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
          {!isMobile && (
            <button
              onClick={handleInviteClick}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: 'transparent',
                color: T.mu, fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Have an invite code?
            </button>
          )}
          <button
            onClick={handleOrcid}
            title="Join with ORCID"
            style={{
              padding: isMobile ? '7px 10px' : '7px 14px', borderRadius: 8,
              border: `1px solid ${T.bdr}`, background: T.w,
              color: T.text, fontSize: isMobile ? 12 : 13, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: isMobile ? 13 : 15 }}>🔬</span>
            {isMobile ? 'ORCID' : 'Join with ORCID'}
          </button>
          <button
            onClick={onShowAuth}
            style={{
              padding: isMobile ? '7px 14px' : '7px 16px', borderRadius: 8,
              border: 'none', background: T.v,
              color: '#fff', fontSize: isMobile ? 12 : 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Log in
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 720, margin: '0 auto',
        padding: isMobile ? '48px 20px 40px' : '80px 32px 64px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: isMobile ? 11 : 12, fontWeight: 700, letterSpacing: 1.2,
          textTransform: 'uppercase', color: T.v,
          background: T.v2, padding: '4px 14px', borderRadius: 20,
          marginBottom: isMobile ? 18 : 24,
        }}>
          Early access — by invitation
        </div>

        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: isMobile ? 32 : 52,
          lineHeight: 1.15,
          color: T.text, margin: '0 0 16px',
          letterSpacing: -0.5,
          fontWeight: 400,
        }}>
          {isMobile ? (
            'Where research meets practice, and evidence becomes conversation.'
          ) : (
            <>
              Where research meets practice,<br />
              and evidence becomes conversation.
            </>
          )}
        </h1>

        <p style={{
          fontSize: isMobile ? 15 : 18,
          color: T.mu, lineHeight: 1.6,
          margin: isMobile ? '0 auto 28px' : '0 auto 36px',
          maxWidth: 560,
        }}>
          Luminary is a professional network for researchers, clinicians,
          and industry scientists — built for the way science
          actually works.
        </p>

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 10 : 12,
          justifyContent: 'center',
          alignItems: 'stretch',
          flexWrap: 'wrap',
          marginBottom: showInviteForm ? (isMobile ? 24 : 32) : 0,
        }}>
          <button
            onClick={handleInviteClick}
            style={{
              padding: isMobile ? '12px 24px' : '13px 28px', borderRadius: 10, border: 'none',
              background: T.v, color: '#fff',
              fontSize: isMobile ? 14 : 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            I have an invite code →
          </button>
          <button
            onClick={scrollToWaitlist}
            style={{
              padding: isMobile ? '12px 24px' : '13px 28px', borderRadius: 10,
              border: `1.5px solid ${T.bdr}`, background: T.w,
              color: T.text, fontSize: isMobile ? 14 : 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            Request early access
          </button>
        </div>

        {showInviteForm && (
          <div ref={inviteRef} style={{
            marginTop: 24,
            display: isMobile ? 'block' : 'inline-block',
            background: T.w, border: `1.5px solid ${T.v}`,
            borderRadius: 12,
            padding: isMobile ? '16px 16px' : '20px 24px',
            textAlign: 'left',
            minWidth: isMobile ? 0 : 320,
            boxShadow: '0 4px 20px rgba(108,99,255,0.10)',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: T.text,
              marginBottom: 12,
            }}>
              Enter your invite code
            </div>
            <InviteCodeForm supabase={supabase} onShowAuth={onShowAuth} />
            <div style={{
              marginTop: 12, paddingTop: 12,
              borderTop: `1px solid ${T.bdr}`,
              fontSize: 12, color: T.mu, textAlign: 'center',
            }}>
              Already have an account?{' '}
              <button onClick={onShowAuth} style={{
                background: 'transparent', border: 'none',
                color: T.v, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, padding: 0,
              }}>
                Log in
              </button>
            </div>
          </div>
        )}
      </section>

      <div style={{
        height: 1, background: T.bdr,
        maxWidth: 680, margin: '0 auto',
      }} />

      {/* ── Feature pillars ── */}
      <section style={{
        maxWidth: 860, margin: '0 auto',
        padding: isMobile ? '48px 20px' : '72px 32px',
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: isMobile ? 26 : 34, color: T.text, fontWeight: 400,
          textAlign: 'center', margin: isMobile ? '0 0 32px' : '0 0 48px',
        }}>
          Built for how science works
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: isMobile ? 14 : 24,
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: T.w, borderRadius: 14,
              border: `1px solid ${T.bdr}`,
              padding: isMobile ? '22px 20px' : '28px 24px',
            }}>
              <div style={{ fontSize: isMobile ? 28 : 32, marginBottom: 12 }}>
                {f.icon}
              </div>
              <div style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: isMobile ? 18 : 20, color: T.text, marginBottom: 8,
              }}>
                {f.title}
              </div>
              <div style={{
                fontSize: isMobile ? 13.5 : 14, color: T.mu, lineHeight: 1.65,
              }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases carousel ── */}
      <section style={{
        background: T.w,
        borderTop: `1px solid ${T.bdr}`,
        borderBottom: `1px solid ${T.bdr}`,
        padding: isMobile ? '48px 0' : '72px 0',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '0 20px' : '0 32px' }}>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: isMobile ? 26 : 34, color: T.text, fontWeight: 400,
            textAlign: 'center', margin: isMobile ? '0 0 28px' : '0 0 48px',
          }}>
            How people use Luminary
          </h2>
        </div>
        <UseCasesCarousel isMobile={isMobile} />
      </section>

      {/* ── Who it's for ── */}
      <section style={{
        background: T.w,
        borderBottom: `1px solid ${T.bdr}`,
      }}>
        <div style={{
          maxWidth: 860, margin: '0 auto',
          padding: isMobile ? '48px 20px' : '72px 32px',
        }}>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: isMobile ? 26 : 34, color: T.text, fontWeight: 400,
            textAlign: 'center', margin: isMobile ? '0 0 32px' : '0 0 48px',
          }}>
            Who Luminary is for
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: isMobile ? 14 : 20,
          }}>
            {WHO_FOR.map(w => (
              <div key={w.role} style={{
                borderRadius: 14,
                border: `1px solid ${T.bdr}`,
                padding: isMobile ? '22px 20px' : '28px 24px',
                background: T.bg,
              }}>
                <div style={{
                  width: isMobile ? 40 : 44, height: isMobile ? 40 : 44, borderRadius: 12,
                  background: w.bg, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobile ? 20 : 22, marginBottom: 12,
                }}>
                  {w.icon}
                </div>
                <div style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: isMobile ? 18 : 20, color: T.text, marginBottom: 8,
                }}>
                  {w.role}
                </div>
                <div style={{
                  fontSize: isMobile ? 13.5 : 14, color: T.mu, lineHeight: 1.65,
                }}>
                  {w.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Waitlist ── */}
      <section
        ref={waitlistRef}
        style={{
          maxWidth: 560, margin: '0 auto',
          padding: isMobile ? '56px 20px' : '80px 32px',
          textAlign: 'center',
        }}
      >
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: isMobile ? 26 : 34, color: T.text, fontWeight: 400, margin: '0 0 12px',
        }}>
          Join the founding community
        </h2>
        <p style={{
          fontSize: isMobile ? 14 : 15, color: T.mu, lineHeight: 1.65,
          margin: isMobile ? '0 0 24px' : '0 0 36px',
        }}>
          Luminary is growing by invitation. Leave your details and
          we'll reach out when a spot opens up for your field.
        </p>

        <WaitlistForm supabase={supabase} isMobile={isMobile} />
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: `1px solid ${T.bdr}`,
        padding: isMobile ? '20px' : '24px 32px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap', gap: isMobile ? 14 : 12,
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 16, color: T.text,
        }}>
          Luminary
        </div>
        <div style={{
          display: 'flex',
          gap: isMobile ? '10px 16px' : 20,
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Use',   href: '/terms' },
            { label: 'Cookie Policy',  href: '/cookies' },
            { label: 'Contact',        href: 'mailto:team@luminary.to' },
          ].map(link => (
            <a key={link.label} href={link.href} style={{
              fontSize: isMobile ? 12.5 : 13, color: T.mu, textDecoration: 'none',
            }}>
              {link.label}
            </a>
          ))}
        </div>
        <div style={{ fontSize: 12, color: T.mu }}>
          © {new Date().getFullYear()} Luminary
        </div>
      </footer>
    </div>
  );
}

// ─── UseCasesCarousel ─────────────────────────────────────────────────────────

function UseCasesCarousel({ isMobile }) {
  const [active, setActive]     = useState(0);
  const [paused, setPaused]     = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef             = useRef(null);
  const progressRef             = useRef(null);
  const DURATION                = 5000;
  const TICK                    = 50;

  const goTo = useCallback((index) => {
    setActive(index);
    setProgress(0);
  }, []);

  const next = useCallback(() => {
    setActive(prev => (prev + 1) % USE_CASES.length);
    setProgress(0);
  }, []);

  const prev = useCallback(() => {
    setActive(prev => (prev - 1 + USE_CASES.length) % USE_CASES.length);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (paused) {
      clearInterval(intervalRef.current);
      clearInterval(progressRef.current);
      return;
    }

    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) return 0;
        return p + (TICK / DURATION) * 100;
      });
    }, TICK);

    intervalRef.current = setInterval(next, DURATION);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(progressRef.current);
    };
  }, [paused, active, next]);

  const card = USE_CASES[active];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ userSelect: 'none' }}
    >
      <div style={{
        maxWidth: 680, margin: '0 auto',
        padding: isMobile ? '0 20px' : '0 32px',
        minHeight: isMobile ? 260 : 220,
      }}>
        <div style={{
          background: T.bg,
          border: `1px solid ${T.bdr}`,
          borderRadius: 16,
          padding: isMobile ? '24px 20px' : '32px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 3, background: T.bdr,
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: T.v,
              transition: `width ${TICK}ms linear`,
              borderRadius: '0 2px 2px 0',
            }} />
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase', color: T.v,
            background: T.v2, padding: '3px 10px',
            borderRadius: 20, marginBottom: isMobile ? 14 : 18,
          }}>
            {card.tag}
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-start',
            gap: isMobile ? 12 : 16,
            marginBottom: isMobile ? 12 : 16,
          }}>
            <div style={{
              fontSize: isMobile ? 30 : 36, lineHeight: 1, flexShrink: 0,
              marginTop: 2,
            }}>
              {card.icon}
            </div>
            <h3 style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: isMobile ? 20 : 24, color: T.text,
              margin: 0, lineHeight: 1.25, fontWeight: 400,
            }}>
              {card.headline}
            </h3>
          </div>

          <p style={{
            fontSize: isMobile ? 14 : 15, color: T.mu, lineHeight: 1.65,
            margin: 0,
            paddingLeft: isMobile ? 0 : 52,
          }}>
            {card.scenario}
          </p>
        </div>
      </div>

      <div style={{
        maxWidth: 680, margin: '20px auto 0',
        padding: isMobile ? '0 20px' : '0 32px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 8 : 0,
      }}>
        <button
          onClick={prev}
          aria-label="Previous"
          style={{
            width: isMobile ? 34 : 36, height: isMobile ? 34 : 36, borderRadius: '50%',
            border: `1px solid ${T.bdr}`, background: T.w,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, color: T.mu,
            flexShrink: 0,
          }}
        >
          ‹
        </button>

        <div style={{
          display: 'flex', gap: isMobile ? 5 : 6, alignItems: 'center',
          flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: 560, flex: 1,
        }}>
          {USE_CASES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              style={{
                width: i === active ? 20 : 8,
                height: 8, borderRadius: 4,
                border: 'none',
                background: i === active ? T.v : T.bdr,
                cursor: 'pointer', padding: 0,
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          aria-label="Next"
          style={{
            width: isMobile ? 34 : 36, height: isMobile ? 34 : 36, borderRadius: '50%',
            border: `1px solid ${T.bdr}`, background: T.w,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, color: T.mu,
            flexShrink: 0,
          }}
        >
          ›
        </button>
      </div>

      <div style={{
        textAlign: 'center', marginTop: 12,
        fontSize: 12, color: T.mu,
      }}>
        {active + 1} / {USE_CASES.length}
      </div>
    </div>
  );
}

// ─── InviteCodeForm ───────────────────────────────────────────────────────────

function InviteCodeForm({ supabase, onShowAuth }) {
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');

    const normalized = code.trim().toUpperCase();

    const { data: row, error: fetchErr } = await supabase
      .from('invite_codes')
      .select('id, claimed_by, is_multi_use, max_uses, uses_count, expires_at, locked_at')
      .eq('code', normalized)
      .single();

    if (fetchErr || !row) {
      setError('Invalid invite code. Please check and try again.');
      setLoading(false);
      return;
    }

    if (row.locked_at) {
      setError('This invite code has been locked.');
      setLoading(false);
      return;
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      setError('This invite code has expired.');
      setLoading(false);
      return;
    }

    if (!row.is_multi_use && row.claimed_by) {
      setError('This invite code has already been used.');
      setLoading(false);
      return;
    }

    if (row.is_multi_use && row.max_uses != null
        && row.uses_count >= row.max_uses) {
      setError('This invite code is no longer available.');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('prefill_invite_code', normalized);
    setLoading(false);
    onShowAuth();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={e => { setCode(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. AHA2026"
          autoFocus
          style={{
            flex: 1, padding: '10px 13px', borderRadius: 8,
            border: `1.5px solid ${error ? T.ro : T.bdr}`,
            background: T.s2, fontSize: 14,
            fontFamily: 'monospace', fontWeight: 700,
            color: T.text, outline: 'none',
            textTransform: 'uppercase',
            letterSpacing: 1,
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !code.trim()}
          style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: T.v, color: '#fff', fontWeight: 700,
            fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            opacity: (loading || !code.trim()) ? 0.6 : 1,
          }}
        >
          {loading ? '…' : 'Continue'}
        </button>
      </div>
      {error && (
        <div style={{
          marginTop: 8, fontSize: 12.5, color: T.ro,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── WaitlistForm ─────────────────────────────────────────────────────────────

function WaitlistForm({ supabase, isMobile }) {
  const [form, setForm] = useState({
    full_name:       '',
    email:           '',
    institution:     '',
    role_title:      '',
    referral_source: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setForm(prev => ({ ...prev, referral_source: ref }));
  }, []);

  const set = (key, val) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error: insertErr } = await supabase
      .from('waitlist')
      .insert({
        full_name:       form.full_name.trim(),
        email:           form.email.trim().toLowerCase(),
        institution:     form.institution.trim() || null,
        role_title:      form.role_title.trim()  || null,
        referral_source: form.referral_source    || null,
        is_priority:     false,
      });

    setSubmitting(false);

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('This email is already on the waitlist.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div style={{
        background: T.gr2, border: `1px solid ${T.gr}`,
        borderRadius: 12, padding: '28px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, color: T.text, marginBottom: 8,
        }}>
          You're on the list
        </div>
        <div style={{ fontSize: 14, color: T.mu, lineHeight: 1.6 }}>
          We'll be in touch when a spot opens up
          for your field. Thank you for your interest in Luminary.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 14,
      padding: isMobile ? '20px 18px' : '28px 28px',
      textAlign: 'left',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
        }}>
          <WaitlistField
            label="Full name *"
            value={form.full_name}
            onChange={v => set('full_name', v)}
            placeholder="Dr. Jane Smith"
          />
          <WaitlistField
            label="Email *"
            value={form.email}
            onChange={v => set('email', v)}
            placeholder="jane@university.edu"
            type="email"
          />
        </div>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
        }}>
          <WaitlistField
            label="Institution"
            value={form.institution}
            onChange={v => set('institution', v)}
            placeholder="University / Hospital / Company"
          />
          <WaitlistField
            label="Role / Title"
            value={form.role_title}
            onChange={v => set('role_title', v)}
            placeholder="e.g. Clinical Researcher, MSL"
          />
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '12px 0', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff',
            fontWeight: 700, fontSize: 14,
            cursor: submitting ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: submitting ? 0.7 : 1,
            marginTop: 4,
          }}
        >
          {submitting ? 'Submitting…' : 'Request early access'}
        </button>

        <div style={{ fontSize: 11.5, color: T.mu, textAlign: 'center' }}>
          We'll never share your details. No spam.
        </div>
      </div>
    </div>
  );
}

function WaitlistField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 11.5, fontWeight: 600, color: T.mu,
        marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 11px', borderRadius: 8,
          border: `1px solid ${T.bdr}`, background: T.s2,
          fontSize: 13, color: T.text, fontFamily: 'inherit',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
