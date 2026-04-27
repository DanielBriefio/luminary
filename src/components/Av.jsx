// Av (avatar) — optional `tier` prop renders a subtle gold ring for the
// Luminary tier only. All other tiers (and callers that don't pass tier)
// render exactly as before — zero visual change.

function AvInner({ color="me", size=38, name="", url="" }) {
  if (url) {
    return (
      <img src={url} alt={name||"Avatar"}
        style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, objectFit:"cover",
          border:"2.5px solid white", boxShadow:"0 1px 6px rgba(0,0,0,.1)", display:"block" }}/>
    );
  }
  const g = {
    me:["#667eea","#764ba2"],sr:["#f093fb","#f5576c"],yt:["#0ea5e9","#4338ca"],
    jm:["#f59e0b","#ef4444"],mk:["#10b981","#0ea5e9"],teal:["#14b8a6","#0ea5e9"],
    indigo:["#4338ca","#6c63ff"],rose:["#f43f5e","#f093fb"],
  };
  const [c1,c2] = g[color]||g.me;
  const id = `av${color}${size}`;
  const initials = name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius:"50%", flexShrink:0, border:"2.5px solid white", boxShadow:"0 1px 6px rgba(0,0,0,.1)" }}>
      <defs><linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={c1}/><stop offset="100%" stopColor={c2}/></linearGradient></defs>
      <circle cx={size/2} cy={size/2} r={size/2} fill={`url(#${id})`}/>
      {initials
        ? <text x={size/2} y={size/2+size*.07} textAnchor="middle" fill="white" fontSize={size*.3} fontFamily="DM Sans" fontWeight="700">{initials}</text>
        : <><circle cx={size/2} cy={size*.42} r={size*.19} fill="rgba(255,255,255,.85)"/><ellipse cx={size/2} cy={size*.85} rx={size*.3} ry={size*.22} fill="rgba(255,255,255,.7)"/></>}
    </svg>
  );
}

export default function Av({ tier=null, size=38, ...rest }) {
  if (tier !== 'luminary') return <AvInner size={size} {...rest}/>;
  const ringColor = '#C9A961';
  const ringWidth = 2;
  return (
    <div style={{
      width: size + ringWidth*2, height: size + ringWidth*2,
      borderRadius: '50%', padding: ringWidth,
      background: ringColor, flexShrink: 0,
      boxSizing: 'border-box',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <AvInner size={size} {...rest}/>
    </div>
  );
}
