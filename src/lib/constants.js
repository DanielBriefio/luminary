export const AUTO_TAG_ENABLED = true;

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
  {id:"feed",    p:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",                                                                               l:"Feed"},
  {id:"explore", p:"M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.35-4.35",                                                                   l:"Explore"},
  {id:"network", p:"M17 20h5v-1a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-1a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", l:"Network"},
  {id:"groups",  p:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",l:"Groups"},
  {id:"library", p:"M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",                                                                            l:"Library"},
  {id:"profile", p:"M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c0-4 3.6-7 8-7s8 3 8 7",                                                               l:"My Profile"},
  {id:"messages",p:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",                                                               l:"Messages"},
  {id:"notifs",  p:"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",                                                      l:"Notifications"},
  {id:"post",    p:"M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",                                                             l:"New Post"},
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
