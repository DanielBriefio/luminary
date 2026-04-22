import { useState } from 'react';
import { supabase } from '../supabase';
import { T, WORK_MODES } from '../lib/constants';
import Btn from '../components/Btn';

export default function AccountSettingsScreen({ user, profile, setProfile, onClose, onSignOut }) {
  const [workModeValue,  setWorkModeValue]  = useState(profile?.work_mode || 'researcher');
  const [workModeSaving, setWorkModeSaving] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [notifications,  setNotifications]  = useState(profile?.email_notifications ?? true);
  const [marketing,      setMarketing]      = useState(profile?.email_marketing ?? false);
  const [analytics,      setAnalytics]      = useState(!!profile?.analytics_consent_at);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleteText,     setDeleteText]     = useState('');
  const [deleting,       setDeleting]       = useState(false);
  const [deleteError,    setDeleteError]    = useState('');
  const [exporting,      setExporting]      = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword,    setNewPassword]    = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg,    setPasswordMsg]    = useState('');

  const saveWorkMode = async () => {
    setWorkModeSaving(true);
    const { data } = await supabase
      .from('profiles')
      .update({ work_mode: workModeValue })
      .eq('id', user.id)
      .select()
      .single();
    if (data) setProfile(data);
    setWorkModeSaving(false);
  };

  const savePreferences = async () => {
    setSaving(true);
    const updates = {
      email_notifications:  notifications,
      email_marketing:      marketing,
      marketing_consent_at: marketing
        ? (profile?.marketing_consent_at || new Date().toISOString())
        : null,
      analytics_consent_at: analytics
        ? (profile?.analytics_consent_at || new Date().toISOString())
        : null,
    };
    const { data } = await supabase
      .from('profiles').update(updates).eq('id', user.id).select().single();
    if (data) setProfile(data);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changePasswordHandler = async () => {
    if (newPassword.length < 8) { setPasswordMsg('Password must be at least 8 characters.'); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPasswordMsg(error.message);
    else {
      setPasswordMsg('Password updated successfully.');
      setNewPassword('');
      setTimeout(() => { setChangePassword(false); setPasswordMsg(''); }, 2000);
    }
    setPasswordSaving(false);
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const [profileRes, postsRes, pubsRes, commentsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('posts').select('*').eq('user_id', user.id),
        supabase.from('publications').select('*').eq('user_id', user.id),
        supabase.from('comments').select('*').eq('user_id', user.id),
      ]);
      const payload = {
        exported_at:  new Date().toISOString(),
        profile:      profileRes.data,
        posts:        postsRes.data    || [],
        publications: pubsRes.data     || [],
        comments:     commentsRes.data || [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `luminary-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    }
    setExporting(false);
  };

  const deleteAccount = async () => {
    if (deleteText !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      setDeleteError(e.message || 'Deletion failed. Please contact hello@luminary.to to delete your account.');
      setDeleting(false);
    }
  };

  const Toggle = ({ value, onChange, label, sublabel }) => (
    <label style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 16, padding: '12px 0', borderBottom: `1px solid ${T.bdr}`, cursor: 'pointer',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: T.mu, marginTop: 2, lineHeight: 1.5 }}>{sublabel}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: value ? T.v : T.s3, position: 'relative',
        cursor: 'pointer', transition: 'background .2s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s',
        }}/>
      </div>
    </label>
  );

  const TipsToggle = () => {
    const [tipsOn, setTipsOn] = useState(!localStorage.getItem('luminary_tips_dismissed'));
    const toggle = () => {
      if (tipsOn) {
        localStorage.setItem('luminary_tips_dismissed', '1');
      } else {
        localStorage.removeItem('luminary_tips_dismissed');
        localStorage.removeItem('luminary_tips_index');
      }
      setTipsOn(v => !v);
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Show tips in feed</div>
          <div style={{ fontSize: 12, color: T.mu }}>Feature tips shown in the right sidebar of your feed</div>
        </div>
        <Toggle value={tipsOn} onChange={toggle} label="" sublabel=""/>
      </div>
    );
  };

  const SectionHead = ({ label }) => (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase',
      letterSpacing: '.07em', margin: '24px 0 12px', paddingBottom: 8,
      borderBottom: `2px solid ${T.bdr}`,
    }}>
      {label}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }}/>

      {/* Panel */}
      <div style={{
        position: 'relative', width: 480, maxWidth: '95vw',
        background: T.w, overflowY: 'auto',
        boxShadow: '-8px 0 40px rgba(0,0,0,.15)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'DM Sans',sans-serif",
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${T.bdr}`,
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, background: T.w, zIndex: 1,
        }}>
          <button onClick={onClose} style={{
            fontSize: 18, border: 'none', background: 'transparent',
            cursor: 'pointer', color: T.mu, padding: '0 4px',
          }}>←</button>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18 }}>Account Settings</div>
        </div>

        <div style={{ padding: '8px 24px 40px' }}>

          {/* Account email */}
          <SectionHead label="Account"/>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.mu, marginBottom: 4 }}>Login email</div>
          <div style={{
            fontSize: 13, color: T.text, background: T.s2,
            border: `1.5px solid ${T.bdr}`, borderRadius: 9, padding: '8px 13px', marginBottom: 4,
          }}>
            {user?.email}
          </div>
          <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 16 }}>
            Used to sign in — contact <a href="mailto:hello@luminary.to" style={{ color: T.v }}>hello@luminary.to</a> to change it
          </div>

          {/* Change password */}
          <div style={{ marginBottom: 12 }}>
            {!changePassword ? (
              <Btn onClick={() => setChangePassword(true)}>Change password</Btn>
            ) : (
              <div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (min. 8 characters)"
                  style={{
                    width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
                    borderRadius: 9, padding: '8px 13px', fontSize: 13,
                    fontFamily: 'inherit', outline: 'none', marginBottom: 8,
                    boxSizing: 'border-box',
                  }}
                />
                {passwordMsg && (
                  <div style={{ fontSize: 12.5, marginBottom: 8, color: passwordMsg.includes('success') ? T.gr : T.ro }}>
                    {passwordMsg}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => { setChangePassword(false); setNewPassword(''); setPasswordMsg(''); }}>Cancel</Btn>
                  <Btn variant="s" onClick={changePasswordHandler} disabled={passwordSaving || newPassword.length < 8}>
                    {passwordSaving ? 'Saving...' : 'Update password'}
                  </Btn>
                </div>
              </div>
            )}
          </div>

          {/* Sign out */}
          <button onClick={onSignOut} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: 'inherit', color: T.mu, fontSize: 13, padding: '4px 0',
          }}>
            ↩ Sign out
          </button>

          {/* Work mode */}
          <SectionHead label="Your work mode"/>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: T.mu, marginBottom: 12, lineHeight: 1.6 }}>
              This adjusts how Luminary presents itself to you — your feed defaults, profile emphasis, and post prompts.
              Your existing content and connections are never affected.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {WORK_MODES.map(mode => (
                <label key={mode.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${workModeValue === mode.id ? T.v : T.bdr}`,
                  background: workModeValue === mode.id ? T.v2 : T.w,
                }}>
                  <input type="radio" name="work_mode" value={mode.id}
                    checked={workModeValue === mode.id}
                    onChange={() => setWorkModeValue(mode.id)}
                    style={{ accentColor: T.v }}
                  />
                  <span style={{ fontSize: 16 }}>{mode.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{mode.label}</div>
                    <div style={{ fontSize: 12, color: T.mu }}>{mode.description}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn variant="s" onClick={saveWorkMode}
                disabled={workModeValue === profile?.work_mode || workModeSaving}>
                {workModeSaving ? 'Saving...' : 'Save'}
              </Btn>
            </div>
          </div>

          {/* Feed tips */}
          <SectionHead label="Feed tips"/>
          <TipsToggle/>

          {/* Email preferences */}
          <SectionHead label="Email preferences"/>
          <Toggle
            value={notifications} onChange={setNotifications}
            label="Activity notifications"
            sublabel="Likes, comments, new followers, and replies to your posts"
          />
          <Toggle
            value={marketing} onChange={setMarketing}
            label="Product updates & news"
            sublabel="New Luminary features and research community highlights (max 2 per month)"
          />
          <Toggle
            value={analytics} onChange={setAnalytics}
            label="Usage analytics"
            sublabel="Share anonymous usage data to help us improve Luminary (no personal data)"
          />
          <div style={{ marginTop: 16 }}>
            <Btn variant="s" onClick={savePreferences} disabled={saving}>
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save preferences'}
            </Btn>
          </div>
          <div style={{ marginTop: 10, fontSize: 11.5, color: T.mu, lineHeight: 1.6 }}>
            We will never share your email address with third parties.{' '}
            <a href="https://luminary.to/privacy" target="_blank" rel="noopener noreferrer" style={{ color: T.v }}>
              Privacy Policy
            </a>
          </div>

          {/* Data */}
          <SectionHead label="Your data"/>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Download your data</div>
            <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 10, lineHeight: 1.6 }}>
              Export your profile, posts, publications, and comments as a JSON file (GDPR right to data portability).
            </div>
            <Btn onClick={exportData} disabled={exporting}>
              {exporting ? 'Preparing export...' : '⬇ Download my data'}
            </Btn>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Legal</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                ['Privacy Policy',   'https://luminary.to/privacy'],
                ['Terms of Service', 'https://luminary.to/terms'],
                ['Cookie Policy',    'https://luminary.to/cookies'],
              ].map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12.5, color: T.v, fontWeight: 600 }}>
                  {label} ↗
                </a>
              ))}
            </div>
          </div>

          {/* Feedback */}
          <SectionHead label="Feedback"/>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Send us feedback</div>
            <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 10, lineHeight: 1.6 }}>
              Bug reports, feature requests, or anything else — we read every message.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="mailto:hello@luminary.to?subject=Bug report" style={{
                fontSize: 12.5, fontWeight: 600, color: T.v,
                textDecoration: 'none', padding: '7px 14px',
                border: `1.5px solid ${T.bdr}`, borderRadius: 9,
              }}>
                🐛 Report a bug
              </a>
              <a href="mailto:hello@luminary.to?subject=Feature request" style={{
                fontSize: 12.5, fontWeight: 600, color: T.v,
                textDecoration: 'none', padding: '7px 14px',
                border: `1.5px solid ${T.bdr}`, borderRadius: 9,
              }}>
                💡 Request a feature
              </a>
              <a href="mailto:hello@luminary.to" style={{
                fontSize: 12.5, fontWeight: 600, color: T.v,
                textDecoration: 'none', padding: '7px 14px',
                border: `1.5px solid ${T.bdr}`, borderRadius: 9,
              }}>
                ✉️ General feedback
              </a>
            </div>
          </div>

          {/* Danger zone */}
          <SectionHead label="Danger zone"/>
          {!confirmDelete ? (
            <div>
              <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 12, lineHeight: 1.6 }}>
                Permanently delete your account, profile, posts, publications, and all other data. This cannot be undone.
              </div>
              <button onClick={() => setConfirmDelete(true)} style={{
                padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${T.ro}`,
                background: 'transparent', color: T.ro, cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
              }}>
                Delete my account
              </button>
            </div>
          ) : (
            <div style={{ background: T.ro2, border: `1.5px solid ${T.ro}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ro, marginBottom: 8 }}>
                Are you sure? This cannot be undone.
              </div>
              <div style={{ fontSize: 12.5, color: T.text, marginBottom: 12, lineHeight: 1.6 }}>
                All your data will be permanently deleted. Type <strong>DELETE</strong> to confirm.
              </div>
              <input
                value={deleteText}
                onChange={e => { setDeleteText(e.target.value); setDeleteError(''); }}
                placeholder="Type DELETE to confirm"
                style={{
                  width: '100%', background: 'white', border: `1.5px solid ${T.ro}`,
                  borderRadius: 9, padding: '8px 13px', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', marginBottom: 8,
                  boxSizing: 'border-box', letterSpacing: '.05em',
                }}
              />
              {deleteError && <div style={{ fontSize: 12.5, color: T.ro, marginBottom: 8 }}>⚠️ {deleteError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => { setConfirmDelete(false); setDeleteText(''); }}>Cancel</Btn>
                <button
                  onClick={deleteAccount}
                  disabled={deleteText !== 'DELETE' || deleting}
                  style={{
                    padding: '8px 16px', borderRadius: 9, border: 'none',
                    background: deleteText === 'DELETE' ? T.ro : T.bdr,
                    color: deleteText === 'DELETE' ? 'white' : T.mu,
                    cursor: deleteText === 'DELETE' ? 'pointer' : 'default',
                    fontSize: 13, fontFamily: 'inherit', fontWeight: 700,
                  }}
                >
                  {deleting ? 'Deleting...' : 'Permanently delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
