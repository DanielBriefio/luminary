export const AUTO_TAG_ENABLED = true;

// Gamification: set to true ONLY after migration_gamification.sql has been run.
// Until then, calls to the award_lumens RPC will hit a missing function and
// silently break the surrounding flow (publish, comment, onboarding).
export const LUMENS_ENABLED = true;

// Luminary Team bot account — used for admin nudge DMs
export const LUMINARY_TEAM_USER_ID = 'af56ef6f-635a-438b-8c8a-41cc84751bca';

// ── ORCID OAuth ────────────────────────────────────────────────────────────────
// Client ID is public (like an API key). Secret stays in Supabase secrets only.
export const ORCID_CLIENT_ID     = 'APP-1BL4ASN7GRKJSFA0';
export const ORCID_AUTHORIZE_URL = 'https://orcid.org/oauth/authorize';
export const ORCID_REDIRECT_URI  = 'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/orcid-callback';

export const T = {
  bg:"#f2f3fb",w:"#fff",s2:"#f7f8fe",s3:"#eef0fc",bdr:"#e3e5f5",
  text:"#1b1d36",mu:"#7a7fa8",
  v:"#6c63ff",v2:"#eeecff",v3:"#5a52e8",
  bl:"#4285f4",bl2:"#e8f0fe",
  gr:"#10b981",gr2:"#ecfdf5",
  am:"#f59e0b",am2:"#fef3c7",
  ro:"#f43f5e",ro2:"#fff1f3",
  te:"#0ea5e9",te2:"#f0f9ff",
};

// ── Gamification: Lumens & tiers ──────────────────────────────────────────────
// Catalyst → Pioneer → Beacon → Luminary. Only Luminary gets the gold treatment;
// the others use platform violet to keep the brand consistent.
export const TIER_CONFIG = {
  catalyst: {
    name:        'Catalyst',
    min:         0,
    max:         499,
    color:       T.v,
    bg:          T.v2,
    ringColor:   null,
    description: "You're a Catalyst — igniting the conversation. Every post, comment, and connection you make sparks new thinking on Luminary. Keep contributing — you're shaping what this community becomes.",
  },
  pioneer: {
    name:        'Pioneer',
    min:         500,
    max:         1999,
    color:       T.v,
    bg:          T.v2,
    ringColor:   null,
    description: "You're a Pioneer — going where others haven't yet. Your contributions are establishing your voice in the community, and others are starting to take notice. You're charting the path forward.",
  },
  beacon: {
    name:        'Beacon',
    min:         2000,
    max:         4999,
    color:       T.v,
    bg:          T.v2,
    ringColor:   null,
    description: "You're a Beacon — a reference point others navigate by. Your insights guide discussions, your library curates evidence others rely on, and your voice carries weight. The community is stronger because of you.",
  },
  luminary: {
    name:        'Luminary',
    min:         5000,
    max:         null,
    color:       '#C9A961',
    bg:          '#C9A96115',
    ringColor:   '#C9A961',
    description: "You're a Luminary — embodying what this platform stands for. Your influence reaches across the community, and your contributions inspire the next generation of scientists. Welcome to the highest tier — and to The Luminarians, where peers at your level gather.",
  },
};

export const TIER_ORDER = ['catalyst', 'pioneer', 'beacon', 'luminary'];

export function getTierFromLumens(lumens) {
  const n = Number(lumens) || 0;
  if (n >= 5000) return 'luminary';
  if (n >= 2000) return 'beacon';
  if (n >= 500)  return 'pioneer';
  return 'catalyst';
}

export function getNextTier(currentTier) {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx < 0 || idx === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export function getProgressToNextTier(lumens, currentTier) {
  const next = getNextTier(currentTier);
  if (!next) return { progress: 100, needed: 0, nextTier: null };
  const cur = TIER_CONFIG[currentTier];
  const nxt = TIER_CONFIG[next];
  const range  = nxt.min - cur.min;
  const earned = (Number(lumens) || 0) - cur.min;
  return {
    progress: Math.max(0, Math.min(100, Math.round((earned / range) * 100))),
    needed:   Math.max(0, nxt.min - (Number(lumens) || 0)),
    nextTier: next,
  };
}

export const PUB_TYPES = [
  {id:'journal',    label:'Journal Article', icon:'📄'},
  {id:'conference', label:'Conference Paper', icon:'🎤'},
  {id:'poster',     label:'Poster',           icon:'🪧'},
  {id:'lecture',    label:'Lecture / Talk',   icon:'🎙️'},
  {id:'book',       label:'Book Chapter',     icon:'📚'},
  {id:'review',     label:'Review Article',   icon:'🔍'},
  {id:'preprint',    label:'Preprint',         icon:'📝'},
  {id:'peer_review', label:'Peer Review',      icon:'⭐'},
  {id:'other',       label:'Other',            icon:'📎'},
];

export const NAV=[
  {id:"feed",     p:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",                                                                               l:"Feed"},
  {id:"explore",  p:"M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.35-4.35",                                                                   l:"Explore"},
  {id:"network",  p:"M17 20h5v-1a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-1a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", l:"Network"},
  {id:"groups",   p:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",l:"Groups"},
  {id:"projects", p:"M12 2L9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z",                                                                     l:"Projects"},
  {id:"library",  p:"M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",                                                                            l:"Library"},
  {id:"profile",  p:"M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c0-4 3.6-7 8-7s8 3 8 7",                                                               l:"My Profile"},
  {id:"messages", p:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",                                                               l:"Messages"},
  {id:"notifs",   p:"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",                                                      l:"Notifications"},
  {id:"post",     p:"M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",                                                             l:"New Post"},
];

export const EDGE_FN = 'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/extract-publications';
export const EDGE_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmxxeWxob3N3Y2t2d3dzcGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUzOTQsImV4cCI6MjA5MTEyMTM5NH0.lHcaMtZ6a781g8RTVkddupNc7qV1Ll1lvBdtdsaIgOs`,
};

// ── TAXONOMY ──────────────────────────────────────────────────────────────────

export const TAXONOMY = {
  "Clinical Medicine": [
    "Cardiology & Cardiovascular Medicine",
    "Oncology & Hematology",
    "Neurology & Neuroscience",
    "Endocrinology & Metabolism",
    "Infectious Disease & Microbiology",
    "Gastroenterology & Hepatology",
    "Rheumatology & Immunology",
    "Pulmonology & Critical Care",
    "Nephrology & Urology",
    "Dermatology",
    "Ophthalmology",
    "Psychiatry & Mental Health",
    "Pediatrics & Neonatology",
    "Obstetrics & Gynecology",
    "Geriatrics & Palliative Care",
    "Emergency & Trauma Medicine",
    "Anesthesiology & Pain Medicine",
    "Radiology & Medical Imaging",
    "Rehabilitation & Sports Medicine",
    "Cardiac & Thoracic Surgery",
    "Neurosurgery",
    "Orthopaedic & Trauma Surgery",
    "General & Gastrointestinal Surgery",
    "Vascular Surgery",
    "Transplant Surgery",
    "Plastic & Reconstructive Surgery",
    "Minimally Invasive & Robotic Surgery"
  ],
  "Basic Life Sciences": [
    "Molecular Biology & Genetics",
    "Cell Biology",
    "Biochemistry & Structural Biology",
    "Immunology & Inflammation",
    "Neurobiology",
    "Microbiology & Virology",
    "Cancer Biology",
    "Developmental Biology & Stem Cells",
    "Physiology",
    "Epigenetics & Gene Regulation",
    "Proteomics & Metabolomics",
    "Genomics & Sequencing",
    "Chemical Biology",
    "Plant & Environmental Biology"
  ],
  "Pharmacology & Therapeutics": [
    "Drug Discovery & Medicinal Chemistry",
    "Pharmacokinetics & Pharmacodynamics",
    "Toxicology & Safety",
    "Clinical Pharmacology",
    "Biologics & Antibody Engineering",
    "Gene & Cell Therapy",
    "Small Molecule Drug Development",
    "Vaccines & Immunotherapeutics",
    "Precision Medicine & Biomarkers",
    "Formulation & Drug Delivery",
    "Pharmacogenomics",
    "Rare Disease & Orphan Drugs"
  ],
  "Public Health & Epidemiology": [
    "Epidemiology & Disease Surveillance",
    "Biostatistics & Research Methods",
    "Global Health & Tropical Medicine",
    "Health Policy & Systems",
    "Environmental & Occupational Health",
    "Nutritional Science & Dietetics",
    "Mental Health & Behavioural Science",
    "Infectious Disease Epidemiology",
    "Cancer Epidemiology",
    "Chronic Disease Prevention",
    "Health Economics & Outcomes",
    "Social Determinants of Health"
  ],
  "Bioengineering & Informatics": [
    "Bioinformatics & Computational Biology",
    "Artificial Intelligence & Machine Learning in Health",
    "Biomedical Engineering",
    "Imaging & Signal Processing",
    "Genomics & Sequencing Technology",
    "Synthetic Biology",
    "Robotics & Surgical Technology Research",
    "Health Data Science",
    "Nanotechnology & Biomaterials",
    "Digital Therapeutics Research"
  ],
  "Pharmaceutical & Biotech Industry": [
    "Medical Affairs",
    "Health Economics & Outcomes Research (HEOR)",
    "Real-World Evidence & Data Science",
    "Regulatory Affairs & Drug Approval",
    "Market Access & Pricing",
    "Pharmacovigilance & Drug Safety",
    "Medical Communications & Publishing",
    "Clinical Operations & Trial Management",
    "Translational Medicine",
    "Business Development & Licensing",
    "Medical Information",
    "Patient Advocacy & Engagement"
  ],
  "Medical Devices & Diagnostics Industry": [
    "Device Design & Engineering",
    "In Vitro Diagnostics (IVD)",
    "Medical Imaging Systems",
    "Surgical & Interventional Devices",
    "Digital Health Products & Software as Medical Device (SaMD)",
    "Wearables & Remote Patient Monitoring",
    "Regulatory Affairs for Devices (MDR / FDA 510k / PMA)",
    "Clinical Evidence & Post-Market Surveillance",
    "Artificial Intelligence in Diagnostics",
    "Point-of-Care & Rapid Testing",
    "Cardiovascular Devices",
    "Orthopaedic & Implantable Devices"
  ],
  "Medical Education & Research Methods": [
    "Medical & Science Education",
    "Systematic Review & Meta-Analysis",
    "Clinical Research Methodology",
    "Evidence-Based Medicine",
    "Scientific Writing & Publishing",
    "Bioethics & Research Integrity",
    "Simulation & Training Technology",
    "Continuing Medical Education",
    "Peer Review & Journal Editing",
    "Open Science & Data Sharing"
  ]
};

export const TIER1_LIST = Object.keys(TAXONOMY);

// All Tier 2 specialities as a flat array — used as suggestion pool
export const ALL_TIER2 = Object.values(TAXONOMY).flat();

// Get Tier 2 options for a given Tier 1
export const getTier2 = (tier1) => TAXONOMY[tier1] || [];

// Find which Tier 1 a Tier 2 belongs to
export const getTier1ForTier2 = (tier2) =>
  TIER1_LIST.find(t1 => TAXONOMY[t1].includes(tier2)) || null;

// ── DISCUSSION PROMPTS ────────────────────────────────────────────────────────

export const DISCUSSION_PROMPTS = {
  'Clinical Medicine': [
    "Share your thoughts on patient impact…",
    "Add your clinical perspective…",
    "Share any relevant experience from practice…",
    "Add your thoughts on real-world applicability…",
    "Share your view on how this fits current guidelines…",
  ],
  'Basic Life Sciences': [
    "Add your perspective on the mechanism or methodology…",
    "Share your thoughts on the broader implications…",
    "Add any observations from your own work…",
    "Share your view on the limitations or next steps…",
    "Add your perspective on how this fits existing models…",
  ],
  'Pharmacology & Therapeutics': [
    "Share your thoughts on the translational potential…",
    "Add your perspective on safety or tolerability…",
    "Share your view on how this compares to current options…",
    "Add your thoughts on the patient selection…",
    "Share your perspective on the clinical development path…",
  ],
  'Pharmaceutical & Biotech Industry': [
    "Share your thoughts on the market implications…",
    "Add your perspective on evidence gaps or next steps…",
    "Share your view on access and reimbursement…",
    "Add your thoughts on how this fits the treatment landscape…",
    "Share your perspective on the regulatory path…",
  ],
  'Public Health & Epidemiology': [
    "Share your thoughts on generalisability…",
    "Add your perspective on the policy implications…",
    "Share your view on study design or methodology…",
    "Add your thoughts on underrepresented populations…",
    "Share your perspective on the public health impact…",
  ],
  'Bioengineering & Informatics': [
    "Share your thoughts on scalability or implementation…",
    "Add your perspective on validation or robustness…",
    "Share your view on real-world deployment challenges…",
    "Add your thoughts on the data or modelling approach…",
    "Share your perspective on clinical integration…",
  ],
  'Medical Devices & Diagnostics Industry': [
    "Share your thoughts on the regulatory or commercial path…",
    "Add your perspective on clinical workflow integration…",
    "Share your view on real-world performance…",
    "Add your thoughts on access in different care settings…",
    "Share your perspective on the evidence requirements…",
  ],
  'Medical Education & Research Methods': [
    "Share your thoughts on the methodology…",
    "Add your perspective on reproducibility or bias…",
    "Share your view on how this applies to your teaching…",
    "Add your thoughts on the evidence base…",
    "Share your perspective on open science implications…",
  ],
  default: [
    "Share your thoughts…",
    "Add your perspective…",
    "Share your view on how this applies to your work…",
    "Add anything you'd highlight from your experience…",
    "Share your take on the implications…",
  ],
};

export const ZERO_COMMENT_PROMPTS = [
  "Be the first to share your perspective…",
  "Add your thoughts on this…",
  "Share your view from your field…",
  "Start the discussion — add your perspective…",
  "Share any relevant experience or insight…",
];

export const getDiscussionPrompts = (tier1) =>
  DISCUSSION_PROMPTS[tier1] || DISCUSSION_PROMPTS.default;

// ── WORK MODES ────────────────────────────────────────────────────────────────

export const WORK_MODES = [
  {
    id:          'researcher',
    label:       'Research',
    icon:        '🔬',
    description: 'Lab, clinical trials, publishing',
    statsConfig: ['followers', 'following', 'publications', 'citations'],
  },
  {
    id:          'clinician',
    label:       'Patient Care',
    icon:        '🏥',
    description: 'I see patients, applying evidence',
    statsConfig: ['followers', 'following', 'experience', 'highlight'],
  },
  {
    id:          'clinician_scientist',
    label:       'Research & Patient Care',
    icon:        '⚕️',
    description: 'Research and clinical practice',
    statsConfig: ['followers', 'following', 'publications', 'highlight'],
  },
  {
    id:          'industry',
    label:       'Industry',
    icon:        '💊',
    description: 'Pharma, MedTech, Medical Affairs, HEOR',
    statsConfig: ['followers', 'following', 'publications', 'highlight'],
  },
];

export const WORK_MODE_MAP = {
  ...Object.fromEntries(WORK_MODES.map(m => [m.id, m])),
  both: { id: 'clinician_scientist', label: 'Research & Patient Care', icon: '⚕️', description: 'Research and clinical practice' },
};

export const COMPOSER_PROMPTS = {
  researcher: [
    "Share a paper you found interesting...",
    "What's the latest in your field?",
    "Share a finding from your research...",
  ],
  clinician: [
    "Share a clinical insight from your practice...",
    "What guideline update changed how you treat patients?",
    "Share a technique or approach that works for you...",
    "What does this paper mean for your patients?",
  ],
  clinician_scientist: [
    "Share what bridges your research and clinical work...",
    "What's the latest in your field?",
    "Share an insight from the bench or bedside...",
  ],
  industry: [
    "Share an insight from your field...",
    "What's the latest in Medical Affairs or HEOR?",
    "Share a perspective on translating evidence to practice...",
  ],
};
