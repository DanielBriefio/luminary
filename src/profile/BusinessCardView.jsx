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

  // wa.me requires international digits only — strip everything else.
  const whatsappDigits = (profile.card_whatsapp || '').replace(/\D/g, '');
  const whatsappUrl    = whatsappDigits ? `https://wa.me/${whatsappDigits}` : null;

  const hasContactDetails = (
    (profile.card_show_email        && profile.card_email)        ||
    (profile.card_show_phone        && profile.card_phone)        ||
    (profile.card_show_linkedin     && profile.card_linkedin)     ||
    (profile.card_show_whatsapp     && whatsappUrl)               ||
    (profile.card_show_website      && profile.card_website)      ||
    (profile.card_show_orcid        && profile.orcid)             ||
    (profile.card_show_twitter      && profile.twitter)           ||
    (profile.card_show_mobile_phone   && profile.mobile_phone)        ||
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
      (profile.card_show_mobile_phone && profile.mobile_phone)
        ? `TEL;TYPE=CELL:${profile.mobile_phone}` : '',
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
              {profile.profile_slug ? (
                <a href={`/p/${profile.profile_slug}`} title="View full profile"
                  style={{ fontFamily:"'DM Serif Display', serif", fontSize:22, lineHeight:1.2, marginBottom:4, color:'#1a1a2e', overflowWrap:'break-word', textDecoration:'none', display:'block' }}
                  onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'}
                  onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>
                  {profile.name}
                </a>
              ) : (
                <div style={{ fontFamily:"'DM Serif Display', serif", fontSize:22, lineHeight:1.2, marginBottom:4, color:'#1a1a2e', overflowWrap:'break-word' }}>
                  {profile.name}
                </div>
              )}
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
            const hasContact = (profile.card_show_mobile_phone && profile.mobile_phone) || (profile.card_show_phone && profile.card_phone) || (profile.card_show_email && profile.card_email);
            const hasOnline  = (profile.card_show_linkedin && profile.card_linkedin) || (profile.card_show_whatsapp && whatsappUrl) || (profile.card_show_website && profile.card_website) || (profile.card_show_orcid && profile.orcid) || (profile.card_show_twitter && profile.twitter);
            const hasAddr    = (profile.card_show_work_address && workAddress);
            return (
              <>
                <div style={{ height:1, background:'linear-gradient(90deg, #667eea22, #764ba244, #667eea22)', marginBottom:16 }}/>
                {hasContact && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Contact</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                      {profile.card_show_mobile_phone && profile.mobile_phone && <ContactRow icon="📱" label={profile.mobile_phone} href={`tel:${profile.mobile_phone}`}/>}
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
                      {profile.card_show_whatsapp && whatsappUrl            && <ContactRow icon="💬" label={profile.card_whatsapp} href={whatsappUrl}/>}
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

        {/* 3. Message on WhatsApp — TERTIARY, only if set */}
        {profile.card_show_whatsapp && whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank" rel="noopener noreferrer"
            style={{
              width:'100%', padding:'10px', borderRadius:12,
              border:'1.5px solid rgba(37,211,102,.35)', background:'rgba(37,211,102,.08)',
              color:'#1a8f4a', fontSize:12.5, fontWeight:700, fontFamily:'inherit',
              textDecoration:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxSizing:'border-box',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#1a8f4a" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Message on WhatsApp
          </a>
        )}

        {/* 4. Connect on LinkedIn — TERTIARY, only if set */}
        {profile.card_show_linkedin && profile.card_linkedin && (
          <a
            href={profile.card_linkedin.startsWith('http') ? profile.card_linkedin : `https://${profile.card_linkedin}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              width:'100%', padding:'10px', borderRadius:12,
              border:'1.5px solid rgba(0,119,181,.3)', background:'rgba(0,119,181,.07)',
              color:'#005f8e', fontSize:12.5, fontWeight:700, fontFamily:'inherit',
              textDecoration:'none', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxSizing:'border-box',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0077b5" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Connect on LinkedIn
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
