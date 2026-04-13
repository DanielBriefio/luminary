import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Inp from '../components/Inp';
import Btn from '../components/Btn';

export default function AuthScreen({ onAuth }) {
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [name,setName]=useState('');
  const [institution,setInstitution]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const submit = async e => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('');
    try {
      if (mode==='signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options:{ data:{ name:name||email.split('@')[0] } } });
        if(error) throw error;
        if(data.user && institution) await supabase.from('profiles').update({institution,name:name||email.split('@')[0]}).eq('id',data.user.id);
        setSuccess('Account created! Check your email to confirm, then log in.');
        setMode('login');
      } else if (mode==='login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if(error) throw error;
        onAuth();
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if(error) throw error;
        setSuccess('Password reset email sent.');
      }
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${T.v2},${T.bl2},#fff)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:420,background:T.w,borderRadius:20,padding:36,boxShadow:"0 8px 40px rgba(108,99,255,.15)",border:`1px solid ${T.bdr}`}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:T.text,marginBottom:4}}>Lumi<span style={{color:T.v}}>nary</span></div>
          <div style={{fontSize:13,color:T.mu}}>The scientific community network</div>
        </div>
        {mode!=='forgot'&&(
          <div style={{display:"flex",background:T.s2,borderRadius:10,padding:3,marginBottom:24}}>
            {[['login','Sign In'],['signup','Create Account']].map(([m,l])=>(
              <div key={m} onClick={()=>{setMode(m);setError('');setSuccess('');}}
                style={{flex:1,padding:"8px",borderRadius:8,textAlign:"center",cursor:"pointer",fontSize:13,fontWeight:700,
                  background:mode===m?T.w:"transparent",color:mode===m?T.v:T.mu,
                  boxShadow:mode===m?"0 1px 8px rgba(108,99,255,.12)":"none"}}>{l}</div>
            ))}
          </div>
        )}
        {error&&<div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:"10px 14px",marginBottom:16,fontSize:12.5,color:T.ro,fontWeight:600}}>⚠️ {error}</div>}
        {success&&<div style={{background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:9,padding:"10px 14px",marginBottom:16,fontSize:12.5,color:T.gr,fontWeight:600}}>✅ {success}</div>}
        <form onSubmit={submit}>
          {mode==='signup'&&<><Inp label="Your full name" value={name} onChange={setName} placeholder="Dr. Jane Smith" required/><Inp label="Institution" value={institution} onChange={setInstitution} placeholder="University of Tokyo"/></>}
          <Inp label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@university.edu" required/>
          {mode!=='forgot'&&<Inp label="Password" type="password" value={password} onChange={setPassword} placeholder={mode==='signup'?"Minimum 6 characters":""} required/>}
          <Btn variant="s" type="submit" disabled={loading} style={{width:"100%",padding:"11px",fontSize:14,marginBottom:14}}>
            {loading?"Please wait...":mode==='login'?"Sign In →":mode==='signup'?"Create Account →":"Send Reset Email"}
          </Btn>
        </form>
        <div style={{textAlign:"center",fontSize:12,color:T.mu}}>
          {mode==='login'&&<><span style={{cursor:"pointer",color:T.v,fontWeight:600}} onClick={()=>{setMode('forgot');setError('');setSuccess('');}}>Forgot password?</span></>}
          {mode==='forgot'&&<span style={{cursor:"pointer",color:T.v,fontWeight:600}} onClick={()=>{setMode('login');setError('');setSuccess('');}}>← Back to sign in</span>}
        </div>
        <div style={{marginTop:20,padding:"12px 14px",background:T.v2,borderRadius:10,border:`1px solid rgba(108,99,255,.15)`}}>
          <div style={{fontSize:12,color:T.v,fontWeight:700,marginBottom:3}}>🔬 Researchers: use your institutional email</div>
          <div style={{fontSize:11.5,color:T.mu}}>ORCID OAuth and PubMed auto-sync coming in v2. Sign up with your email and complete your profile.</div>
        </div>
      </div>
    </div>
  );
}
