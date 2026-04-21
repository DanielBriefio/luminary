import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';

export function ContactRow({ icon, label, href }) {
  const inner = (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:14, width:20, textAlign:'center', flexShrink:0 }}>{icon}</span>
      <span style={{ fontSize:12.5, color: href ? '#6c63ff' : '#555', fontWeight: href ? 600 : 400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {label}
      </span>
    </div>
  );
  if (href) return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}>
      {inner}
    </a>
  );
  return inner;
}

export function BusinessCardView({ profile, currentUserId }) {
  const isOwner = currentUserId && currentUserId === profile.id;

  const handleConnectOnLuminary = () => {
    if (currentUserId) {
      // Already logged in — redirect to app with view_profile param
      sessionStorage.setItem('post_auth_action', 'follow');
      window.location.href = `${window.location.origin}?view_profile=${profile.profile_slug}`;
    } else {
      // Not logged in — store redirect target and go to auth
      sessionStorage.setItem('post_auth_profile', profile.profile_slug);
      sessionStorage.setItem('post_auth_action', 'follow');
      window.location.href = `${window.location.origin}?connect=${profile.profile_slug}`;
    }
  };

  const workAddress = [profile.work_street, profile.work_city, profile.work_postal_code, profile.work_country].filter(Boolean).join(', ') || profile.work_address || '';

  const hasContactDetails = (
    (profile.card_show_email        && profile.card_email)        ||
    (profile.card_show_phone        && profile.card_phone)        ||
    (profile.card_show_linkedin     && profile.card_linkedin)     ||
    (profile.card_show_website      && profile.card_website)      ||
    (profile.card_show_orcid        && profile.orcid)             ||
    (profile.card_show_twitter      && profile.twitter)           ||
    (profile.card_show_work_phone   && profile.work_phone)        ||
    (profile.card_show_work_address && workAddress)
  );

  const downloadVCard = () => {
    const nameParts = (profile.name || '').split(' ');
    const lastName  = nameParts[nameParts.length - 1];
    const firstName = nameParts.slice(0, -1).join(' ');
    const lines = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `FN:${profile.name || ''}`,
      `N:${lastName};${firstName};;;`,
      profile.title       ? `TITLE:${profile.title}` : '',
      profile.institution ? `ORG:${profile.institution}` : '',
      (profile.card_show_email && profile.card_email)
        ? `EMAIL;TYPE=WORK:${profile.card_email}` : '',
      (profile.card_show_phone && profile.card_phone)
        ? `TEL;TYPE=WORK:${profile.card_phone}` : '',
      (profile.card_show_work_phone && profile.work_phone)
        ? `TEL;TYPE=WORK:${profile.work_phone}` : '',
      (profile.card_show_work_address && workAddress)
        ? `ADR;TYPE=WORK:;;${workAddress};;;;` : '',
      `URL:${window.location.origin}/p/${profile.profile_slug}`,
      'NOTE:Connected via Luminary',
      'END:VCARD',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([lines], { type: 'text/vcard' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `${(profile.name || 'contact').replace(/\s+/g, '_')}.vcf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 20px 40px' }}>

      {/* Empty card nudge for owner */}
      {isOwner && !hasContactDetails && (
        <div style={{ width:'100%', maxWidth:440, background:T.v2, border:`1.5px dashed rgba(108,99,255,.3)`, borderRadius:14, padding:'20px 24px', marginBottom:24, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🪪</div>
          <div style={{ fontSize:14, fontWeight:700, color:T.v, marginBottom:6 }}>Your card is empty</div>
          <div style={{ fontSize:12.5, color:T.mu, lineHeight:1.7, marginBottom:16 }}>
            Add contact details to make your card useful when someone scans your QR at a conference.
          </div>
          <a href="/" style={{ display:'inline-block', padding:'10px 20px', borderRadius:10, background:T.v, color:'white', fontSize:13, fontWeight:700, textDecoration:'none' }}>
            Edit my card details →
          </a>
        </div>
      )}

      {/* The card */}
      <div style={{ width:'100%', maxWidth:440, background:'white', borderRadius:16, boxShadow:'0 8px 40px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08)', overflow:'hidden', border:'1px solid rgba(0,0,0,.06)' }}>
        {/* Gradient band */}
        <div style={{ height:8, background:'linear-gradient(90deg, #667eea, #764ba2, #f093fb)' }}/>

        {/* Card body */}
        <div style={{ padding:'28px 32px 24px' }}>
          {/* Avatar + name block */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:20, marginBottom: hasContactDetails ? 24 : 0 }}>
            <Av size={72} color={profile.avatar_color || 'me'} name={profile.name} url={profile.avatar_url || ''}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:22, lineHeight:1.2, marginBottom:4, color:'#1a1a2e', overflowWrap:'break-word' }}>
                {profile.name}
              </div>
              {profile.title && (
                <div style={{ fontSize:13, fontWeight:600, color:'#6c63ff', marginBottom:3 }}>{profile.title}</div>
              )}
              {profile.institution && (
                <div style={{ fontSize:12.5, color:'#666', fontWeight:500 }}>{profile.institution}</div>
              )}
              {profile.location && (
                <div style={{ fontSize:12, color:'#999', marginTop:2 }}>{profile.location}</div>
              )}
            </div>
          </div>

          {/* Contact details */}
          {hasContactDetails && (() => {
            const hasContact = (profile.card_show_work_phone && profile.work_phone) || (profile.card_show_phone && profile.card_phone) || (profile.card_show_email && profile.card_email);
            const hasOnline  = (profile.card_show_linkedin && profile.card_linkedin) || (profile.card_show_website && profile.card_website) || (profile.card_show_orcid && profile.orcid) || (profile.card_show_twitter && profile.twitter);
            const hasAddr    = (profile.card_show_work_address && workAddress);
            return (
              <>
                <div style={{ height:1, background:'linear-gradient(90deg, #667eea22, #764ba244, #667eea22)', marginBottom:16 }}/>
                {hasContact && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Contact</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                      {profile.card_show_work_phone && profile.work_phone && <ContactRow icon="📱" label={profile.work_phone} href={`tel:${profile.work_phone}`}/>}
                      {profile.card_show_phone      && profile.card_phone && <ContactRow icon="☎️" label={profile.card_phone} href={`tel:${profile.card_phone}`}/>}
                      {profile.card_show_email      && profile.card_email && <ContactRow icon="✉️" label={profile.card_email} href={`mailto:${profile.card_email}`}/>}
                    </div>
                  </div>
                )}
                {hasOnline && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Online</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                      {profile.card_show_linkedin && profile.card_linkedin && <ContactRow icon="💼" label={profile.card_linkedin} href={profile.card_linkedin.startsWith('http')?profile.card_linkedin:`https://${profile.card_linkedin}`}/>}
                      {profile.card_show_website  && profile.card_website  && <ContactRow icon="🌐" label={profile.card_website}  href={profile.card_website.startsWith('http')?profile.card_website:`https://${profile.card_website}`}/>}
                      {profile.card_show_orcid    && profile.orcid         && <ContactRow icon="🔬" label={`orcid.org/${profile.orcid}`} href={`https://orcid.org/${profile.orcid}`}/>}
                      {profile.card_show_twitter  && profile.twitter       && <ContactRow icon="𝕏"  label={`@${profile.twitter.replace('@','')}`} href={`https://x.com/${profile.twitter.replace('@','')}`}/>}
                    </div>
                  </div>
                )}
                {hasAddr && (
                  <div style={{ marginBottom:4 }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Address</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                      {profile.card_show_work_address && workAddress && <ContactRow icon="📍" label={workAddress}/>}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Branding */}
          <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid #f0f0f0', display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
            <span style={{ fontSize:10, color:'#ccc', letterSpacing:'.05em' }}>
              {window.location.hostname.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ width:'100%', maxWidth:440, display:'flex', flexDirection:'column', gap:10, marginTop:20 }}>

        {/* 1. Connect on Luminary — PRIMARY */}
        <button onClick={handleConnectOnLuminary} style={{
          width:'100%', padding:'13px', borderRadius:12, border:'none',
          background:'linear-gradient(135deg, #6c63ff, #764ba2)',
          color:'white', fontSize:14, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          🔬 Connect on Luminary
        </button>

        {/* 2. Save to Contacts — SECONDARY */}
        <button onClick={downloadVCard} style={{
          width:'100%', padding:'12px', borderRadius:12,
          border:'1.5px solid #e0e0e0', background:'#f8f8f8',
          color:'#333', fontSize:13, fontWeight:700, fontFamily:'inherit', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          📱 Save to Contacts
        </button>

        {/* 3. Connect on LinkedIn — TERTIARY, only if set */}
        {profile.card_show_linkedin && profile.card_linkedin && (
          <a
            href={profile.card_linkedin.startsWith('http') ? profile.card_linkedin : `https://${profile.card_linkedin}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              width:'100%', padding:'10px', borderRadius:12,
              border:'1.5px solid #c8d0d8', background:'transparent',
              color:'#888', fontSize:12.5, fontWeight:600, fontFamily:'inherit',
              textDecoration:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxSizing:'border-box',
            }}
          >
            💼 Connect on LinkedIn
          </a>
        )}

        {/* 4. View full profile — text link */}
        <a
          href={`${window.location.origin}/p/${profile.profile_slug}`}
          style={{
            textAlign:'center', fontSize:12.5, color:'#6c63ff', fontWeight:600,
            textDecoration:'none', padding:'6px 0', display:'block',
          }}
        >
          View full profile →
        </a>

      </div>

      <div style={{ marginTop:12, fontSize:11, color:'#bbb', textAlign:'center' }}>
        Scan QR · Save contact · Connect
      </div>
    </div>
  );
}
