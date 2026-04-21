export const PROJECT_TEMPLATES = {

  conference: {
    type:        'conference',
    label:       'Conference',
    icon:        '🗓️',
    color:       '#f59e0b',
    description: 'Coordinate your team and capture key insights during a conference.',
    usedBy:      'Research teams, lab groups, pharma teams',
    folders: [
      { name: 'Planning',      sort_order: 0 },
      { name: 'Key Sessions',  sort_order: 1 },
      { name: 'Daily Notes',   sort_order: 2 },
      { name: 'Papers Shared', sort_order: 3 },
      { name: 'Action Items',  sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Planning',
        is_sticky: true,
        content: `<h3>📋 Welcome to {projectName}</h3>
<p>Use this space to coordinate before, during, and after the conference.</p>
<ul>
<li>Add sessions you plan to attend in <em>Key Sessions</em></li>
<li>Share papers from the programme in <em>Papers Shared</em></li>
<li>Post daily notes and highlights in <em>Daily Notes</em></li>
<li>Capture follow-ups and new contacts in <em>Action Items</em></li>
</ul>`,
      },
      {
        folder:  'Key Sessions',
        content: `<p>📌 <strong>Add a session you're planning to attend</strong></p>
<p>Share the title, speaker, time, and why it's relevant to your work. Others can add their picks too.</p>`,
      },
      {
        folder:  'Daily Notes',
        content: `<p>📝 <strong>Day 1 — Share your highlights</strong></p>
<p>What was the most interesting talk or conversation today? Even rough bullet points help the team stay aligned.</p>`,
      },
      {
        folder:  'Action Items',
        content: `<p>✅ <strong>People to follow up with</strong></p>
<p>Add contacts you met and what you discussed. Include their email or institution if you have it.</p>`,
      },
    ],
  },

  journal_club: {
    type:        'journal_club',
    label:       'Journal Club',
    icon:        '📖',
    color:       '#6c63ff',
    description: 'Run a recurring paper discussion with structured takeaways.',
    usedBy:      'Lab groups, residency programs, research teams',
    folders: [
      { name: "This Week's Paper", sort_order: 0 },
      { name: 'Discussion',        sort_order: 1 },
      { name: 'Key Takeaways',     sort_order: 2 },
      { name: 'Past Sessions',     sort_order: 3 },
    ],
    starterPosts: [
      {
        folder:    "This Week's Paper",
        is_sticky: true,
        content: `<p>📄 <strong>Add this week's paper</strong></p>
<p>Share the paper you're discussing this session using the paper post type — paste the DOI or search Europe PMC. Add a one-line reason why you chose it.</p>`,
      },
      {
        folder:  'Discussion',
        content: `<p>💬 <strong>What's your initial take?</strong></p>
<p>Before the session, share one thought on the paper — the methodology, the findings, or what surprised you. Doesn't need to be polished.</p>`,
      },
      {
        folder:  'Discussion',
        content: `<p>❓ <strong>Questions to discuss</strong></p>
<p>Add questions you want the group to tackle during the session. Others can add theirs too.</p>`,
      },
      {
        folder:  'Key Takeaways',
        content: `<p>🏆 <strong>Share your single most important learning</strong></p>
<p>After the session — what's the one thing you're taking away? One sentence is enough.</p>`,
      },
    ],
  },

  publication: {
    type:        'publication',
    label:       'Publication',
    icon:        '✍️',
    color:       '#10b981',
    description: 'Coordinate a manuscript from first draft to submission.',
    usedBy:      'Research teams, co-author groups',
    folders: [
      { name: 'Drafts',         sort_order: 0 },
      { name: 'Figures & Data', sort_order: 1 },
      { name: 'References',     sort_order: 2 },
      { name: 'Reviews',        sort_order: 3 },
      { name: 'Submission',     sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Drafts',
        is_sticky: true,
        content: `<h3>✍️ Welcome to {projectName}</h3>
<p><strong>Current status:</strong> [update this]</p>
<p><strong>Target journal:</strong> [add journal name]</p>
<p><strong>Submission deadline:</strong> [add date]</p>
<p><strong>Co-authors:</strong> [tag them here]</p>`,
      },
      {
        folder:  'Drafts',
        content: `<p>📝 <strong>Open questions before we start writing</strong></p>
<p>What do we need to agree on before drafting? List them here so co-authors can weigh in.</p>`,
      },
      {
        folder:  'Reviews',
        content: `<p>🔍 <strong>Co-author review round</strong></p>
<p>When the draft is ready, share it here and note which sections need most attention.</p>`,
      },
      {
        folder:  'Submission',
        content: `<p>📬 <strong>Submission checklist</strong></p>
<p>Before submitting: cover letter drafted · figures in correct format · author contributions statement · conflict of interest statement · supplementary files ready.</p>`,
      },
    ],
  },

  blank: {
    type:        'blank',
    label:       'Blank Project',
    icon:        '✏️',
    color:       '#6b7280',
    description: 'Start with a clean slate — your structure, your way.',
    usedBy:      'Anyone',
    folders: [],
    starterPosts: [
      {
        folder:    null,
        is_sticky: true,
        content: `<p>👋 <strong>Welcome to {projectName}</strong></p>
<p>This is your space. Add folders using the + button in the sidebar, then start posting.</p>`,
      },
    ],
  },

  weekly_team_meeting: {
    type:           'weekly_team_meeting',
    label:          'Weekly Team Meeting',
    icon:           '📅',
    color:          '#0284c7',
    filterCategory: 'clinical',
    description:    'Keep your clinical or research team aligned week to week.',
    usedBy:         'Clinical teams, lab groups, departments',
    galleryOnly:    true,
    keyActions:     ['Share agendas', 'Discuss cases', 'Track actions'],
    previewPosts: [
      { author: 'Dr. J. Park', content: 'Week 12 agenda: (1) Q3 audit results, (2) new oncology pathway, (3) rotas for December. Please review the audit summary before we meet.', folder: 'Agenda', likes: 3, comments: 4 },
      { author: 'Dr. S. Ali', content: 'Case for discussion Thursday: 68yr F, COPD + newly diagnosed T2DM, on metformin but HbA1c still 74. Thoughts on next step?', folder: 'Case Discussions', likes: 5, comments: 7 },
    ],
    folders: [
      { name: 'Agenda',           sort_order: 0 },
      { name: 'Case Discussions', sort_order: 1 },
      { name: 'Action Items',     sort_order: 2 },
      { name: 'Decisions Made',   sort_order: 3 },
    ],
    starterPosts: [
      {
        folder:    'Agenda',
        is_sticky: true,
        content: `<h3>📅 Welcome to {projectName}</h3>
<p>Use this space to prepare for and document your weekly meetings.</p>
<ul>
<li>Post this week's agenda items in <em>Agenda</em></li>
<li>Add cases you want to discuss in <em>Case Discussions</em></li>
<li>Capture follow-ups in <em>Action Items</em></li>
<li>Record key decisions in <em>Decisions Made</em></li>
</ul>`,
      },
      {
        folder:  'Agenda',
        content: `<p>📋 <strong>This week's agenda</strong></p>
<p>Add agenda items here before the meeting. Anyone can contribute.</p>`,
      },
      {
        folder:  'Case Discussions',
        content: `<p>🔍 <strong>Cases to discuss this week</strong></p>
<p>Add cases you'd like the team's input on. Include relevant background and your specific question.</p>`,
      },
      {
        folder:  'Action Items',
        content: `<p>✅ <strong>Follow-up from last meeting</strong></p>
<p>List action items with owners and deadlines. Update status as things are completed.</p>`,
      },
    ],
  },

  clinical_training: {
    type:           'clinical_training',
    label:          'Clinical Training',
    icon:           '🎓',
    color:          '#7c3aed',
    filterCategory: 'clinical',
    description:    'Organise a new technique, certification or training programme.',
    usedBy:         'Clinical teams, training departments, lab groups',
    galleryOnly:    true,
    keyActions:     ['Share protocols', 'Log sessions', 'Ask questions'],
    previewPosts: [
      { author: 'Dr. M. Chen (Supervisor)', content: 'ERCP training log — trainee completed cases 11-15 this week. Cannulation success rate now 78%. Progressing well on the steep part of the curve.', folder: 'Training Log', likes: 4, comments: 2 },
      { author: 'Dr. A. Fernandez (Trainee)', content: 'Question: in Case 13 the patient had a Billroth II anatomy. The guidewire kept going into the afferent limb. What\'s the best approach?', folder: 'Questions & Notes', likes: 1, comments: 5 },
    ],
    folders: [
      { name: 'Background Reading', sort_order: 0 },
      { name: 'Protocol & Steps',   sort_order: 1 },
      { name: 'Training Log',       sort_order: 2 },
      { name: 'Questions & Notes',  sort_order: 3 },
    ],
    starterPosts: [
      {
        folder:    'Background Reading',
        is_sticky: true,
        content: `<h3>🎓 Welcome to {projectName}</h3>
<p>Use this space to organise your training — from background reading to hands-on practice.</p>
<ul>
<li>Share key papers and resources in <em>Background Reading</em></li>
<li>Document the protocol or steps in <em>Protocol & Steps</em></li>
<li>Track progress and sessions in <em>Training Log</em></li>
<li>Capture questions and insights in <em>Questions & Notes</em></li>
</ul>`,
      },
      {
        folder:  'Background Reading',
        content: `<p>📄 <strong>Key papers and resources</strong></p>
<p>Share the papers, guidelines or resources everyone should read before starting. Use the paper post type to add them with DOI.</p>`,
      },
      {
        folder:  'Protocol & Steps',
        content: `<p>📝 <strong>The protocol</strong></p>
<p>Document the technique or procedure step by step. Others can comment with questions or refinements.</p>`,
      },
      {
        folder:  'Training Log',
        content: `<p>📊 <strong>Training session log</strong></p>
<p>Record each training session here — date, who was involved, what was covered, and any observations.</p>`,
      },
      {
        folder:  'Questions & Notes',
        content: `<p>❓ <strong>Questions and observations</strong></p>
<p>Post questions as you train. Anyone with experience can answer. No question is too basic.</p>`,
      },
    ],
  },

  research_project: {
    type:           'research_project',
    label:          'Research Project',
    icon:           '🔬',
    color:          '#0891b2',
    filterCategory: 'research',
    description:    'Run a focused research project from hypothesis to results.',
    usedBy:         'Lab groups, PhD students, research teams',
    keyActions:     ['Share findings', 'Discuss methods', 'Track progress'],
    galleryOnly:    true,
    folders: [
      { name: 'Hypothesis & Background', sort_order: 0 },
      { name: 'Methods',                 sort_order: 1 },
      { name: 'Results & Data',          sort_order: 2 },
      { name: 'Analysis',                sort_order: 3 },
      { name: 'Manuscript Draft',        sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Hypothesis & Background',
        is_sticky: true,
        content: `<h3>🔬 Welcome to {projectName}</h3>
<p>Use this project to track your research from first idea to final manuscript.</p>
<ul>
<li>Define your hypothesis and background in this folder</li>
<li>Document methods as you develop them</li>
<li>Share results and data as they come in</li>
<li>Build toward your manuscript draft together</li>
</ul>`,
      },
      {
        folder:  'Hypothesis & Background',
        content: `<p>💡 <strong>Our research question</strong></p>
<p>State the hypothesis clearly here. What are we testing, and why does it matter? Team members can comment and refine.</p>`,
      },
      {
        folder:  'Methods',
        content: `<p>📐 <strong>Methods — working draft</strong></p>
<p>Document the experimental design, inclusion/exclusion criteria, and key protocols here. Flag open methodological questions for the team.</p>`,
      },
      {
        folder:  'Results & Data',
        content: `<p>📊 <strong>First results</strong></p>
<p>Share your initial findings here — even preliminary or unexpected ones. Early discussion often changes the direction of the analysis.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Dr. A. Müller', content: 'Hypothesis confirmed in the first cohort (n=47). Surprisingly, the effect was stronger in the female subgroup — worth pre-specifying for the main analysis.', folder: 'Results & Data', likes: 8, comments: 5 },
      { author: 'Dr. K. Tanaka', content: "Agreed. I'd also flag the age distribution — median 67 is older than our target population for the manuscript.", folder: 'Results & Data', likes: 3, comments: 2 },
    ],
  },

  grant_application: {
    type:           'grant_application',
    label:          'Grant Application',
    icon:           '🎓',
    color:          '#7c3aed',
    filterCategory: 'research',
    description:    'Coordinate a grant submission from first draft to submission.',
    usedBy:         'PIs, research administrators, academic teams',
    keyActions:     ['Draft sections', 'Share feedback', 'Track deadlines'],
    galleryOnly:    true,
    folders: [
      { name: 'Specific Aims',             sort_order: 0 },
      { name: 'Background & Significance', sort_order: 1 },
      { name: 'Research Strategy',         sort_order: 2 },
      { name: 'Budget',                    sort_order: 3 },
      { name: 'Biosketches',               sort_order: 4 },
      { name: 'Submission',                sort_order: 5 },
    ],
    starterPosts: [
      {
        folder:    'Specific Aims',
        is_sticky: true,
        content: `<h3>🎓 Welcome to {projectName}</h3>
<p><strong>Funding agency:</strong> [add here]</p>
<p><strong>Submission deadline:</strong> [add date]</p>
<p><strong>Requested amount:</strong> [add here]</p>
<p><strong>PI:</strong> [add name]</p>
<p>Use the folders to coordinate each section of the application.</p>`,
      },
      {
        folder:  'Specific Aims',
        content: `<p>📝 <strong>Specific Aims — draft v1</strong></p>
<p>The Specific Aims page is the most important page of the grant. Share your draft here early — team feedback at this stage saves weeks later.</p>`,
      },
      {
        folder:  'Research Strategy',
        content: `<p>🔍 <strong>Open questions before we write</strong></p>
<p>What methodological or conceptual gaps do we need to address before drafting the Research Strategy? Flag them here.</p>`,
      },
      {
        folder:  'Submission',
        content: `<p>✅ <strong>Submission checklist</strong></p>
<p>All sections complete · Budget approved · All biosketches submitted · IRB documentation ready · Institution sign-off obtained · Submitted to agency.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Prof. S. Chen', content: 'Specific Aims page — version 3. Major change: repositioned the innovation section earlier based on reviewer feedback from the pilot. Please review before Friday.', folder: 'Specific Aims', likes: 4, comments: 7 },
      { author: 'Dr. R. Patel', content: 'The budget justification for the sequencing core needs updating — costs went up 15% since last year.', folder: 'Budget', likes: 2, comments: 3 },
    ],
  },

  advisory_board: {
    type:           'advisory_board',
    label:          'Advisory Board',
    icon:           '🤝',
    color:          '#0284c7',
    filterCategory: 'industry',
    description:    'Plan and run an external expert advisory board meeting.',
    usedBy:         'Medical Affairs, clinical development, pharma teams',
    keyActions:     ['Share pre-reads', 'Capture insights', 'Assign follow-ups'],
    galleryOnly:    true,
    folders: [
      { name: 'Agenda',          sort_order: 0 },
      { name: 'Pre-reads',       sort_order: 1 },
      { name: 'Member Profiles', sort_order: 2 },
      { name: 'Meeting Notes',   sort_order: 3 },
      { name: 'Action Items',    sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Agenda',
        is_sticky: true,
        content: `<h3>🤝 Welcome to {projectName}</h3>
<p><strong>Meeting date:</strong> [add date]</p>
<p><strong>Format:</strong> [in-person / virtual / hybrid]</p>
<p><strong>Location / platform:</strong> [add details]</p>
<p>Use this project to coordinate before, during, and after the meeting.</p>`,
      },
      {
        folder:  'Agenda',
        content: `<p>📋 <strong>Draft agenda</strong></p>
<p>Share the agenda here for internal review before it goes to advisors. Include timing for each topic and which team member owns each session.</p>`,
      },
      {
        folder:  'Pre-reads',
        content: `<p>📄 <strong>Materials for advisors</strong></p>
<p>Upload or link the pre-read package here. Note which materials are essential vs background, and any specific questions you want advisors to come prepared to discuss.</p>`,
      },
      {
        folder:  'Action Items',
        content: `<p>✅ <strong>Post-meeting action items</strong></p>
<p>Document all commitments made during the meeting — owner, deadline, and status. Update this post as items are completed.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Sarah K. (Medical Affairs)', content: 'KOL feedback on the evidence gap was consistent across all 5 advisors — they all flagged the absence of real-world data in Japan. Added to the evidence generation plan.', folder: 'Meeting Notes', likes: 6, comments: 4 },
      { author: 'James T.', content: 'Action: Prof. Yamamoto agreed to review the protocol design for the Japan RWE study. Follow-up by end of Q2.', folder: 'Action Items', likes: 2, comments: 1 },
    ],
  },

  literature_review: {
    type:           'literature_review',
    label:          'Literature Review',
    icon:           '📚',
    color:          '#059669',
    filterCategory: 'research',
    description:    'Conduct a structured literature review from search to synthesis.',
    usedBy:         'Researchers, clinical fellows, systematic review teams',
    keyActions:     ['Add papers', 'Discuss inclusion', 'Synthesise findings'],
    galleryOnly:    true,
    folders: [
      { name: 'Search Strategy', sort_order: 0 },
      { name: 'Included Papers', sort_order: 1 },
      { name: 'Excluded Papers', sort_order: 2 },
      { name: 'Data Extraction', sort_order: 3 },
      { name: 'Summary',         sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Search Strategy',
        is_sticky: true,
        content: `<h3>📚 Welcome to {projectName}</h3>
<p><strong>Review question:</strong> [PICO or equivalent]</p>
<p><strong>Databases to search:</strong> Europe PMC, PubMed, Cochrane, [add others]</p>
<p><strong>Date range:</strong> [add]</p>
<p><strong>Target journal:</strong> [add if known]</p>`,
      },
      {
        folder:  'Search Strategy',
        content: `<p>🔍 <strong>Search strings</strong></p>
<p>Document the exact search strings used in each database here so the review is reproducible. Include the date each search was run.</p>`,
      },
      {
        folder:  'Included Papers',
        content: `<p>✓ <strong>Inclusion criteria</strong></p>
<p>Document what makes a paper eligible for inclusion. Post papers you're unsure about here for team discussion before final decision.</p>`,
      },
      {
        folder:  'Summary',
        content: `<p>📝 <strong>Key themes emerging</strong></p>
<p>As you read through the included papers, post emerging themes and patterns here. This becomes the backbone of the Discussion section.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Dr. L. Hoffmann', content: 'Screened 847 abstracts. 64 meet inclusion criteria, 12 are borderline — added to Included Papers folder with notes. The heterogeneity in outcome measures is going to be a challenge for meta-analysis.', folder: 'Included Papers', likes: 5, comments: 3 },
    ],
  },

  lab_onboarding: {
    type:           'lab_onboarding',
    label:          'Lab / Team Onboarding',
    icon:           '👋',
    color:          '#d97706',
    filterCategory: 'collaboration',
    description:    'Get a new team member up to speed quickly.',
    usedBy:         'Lab groups, clinical teams, department heads',
    keyActions:     ['Share essentials', 'Answer questions', 'Track progress'],
    galleryOnly:    true,
    folders: [
      { name: 'Welcome & Orientation', sort_order: 0 },
      { name: 'Key Papers',            sort_order: 1 },
      { name: 'Protocols & Methods',   sort_order: 2 },
      { name: 'Tools & Resources',     sort_order: 3 },
      { name: 'First Tasks',           sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Welcome & Orientation',
        is_sticky: true,
        content: `<h3>👋 Welcome to {projectName}</h3>
<p>This project has everything you need to get started. Work through the folders at your own pace — ask questions in any post by leaving a comment.</p>
<ul>
<li>Start in <em>Welcome & Orientation</em> for context on the team and its work</li>
<li>Read the <em>Key Papers</em> that underpin what we do</li>
<li>Review <em>Protocols & Methods</em> before your first experiment</li>
<li>Check <em>First Tasks</em> for what to tackle in your first two weeks</li>
</ul>`,
      },
      {
        folder:  'Welcome & Orientation',
        content: `<p>🏢 <strong>About our team</strong></p>
<p>Introduce the team, the research focus, and how we work together. What are the current active projects? What's the overall goal we're working toward?</p>`,
      },
      {
        folder:  'Key Papers',
        content: `<p>📄 <strong>The 5 papers everyone on this team has read</strong></p>
<p>Add the foundational papers for your work using the paper post type. These are the papers that explain why we do what we do.</p>`,
      },
      {
        folder:  'First Tasks',
        content: `<p>✅ <strong>Your first two weeks</strong></p>
<p>List concrete tasks for the new team member's first two weeks. Be specific — "Read these 3 papers and post a 3-sentence summary of each" is better than "get familiar with the literature."</p>`,
      },
    ],
    previewPosts: [
      { author: 'Prof. H. Nakamura (PI)', content: "Welcome to the lab! Your first task is to read the three papers in Key Papers and leave a comment on each with your main takeaway. Then let's meet Thursday to discuss.", folder: 'Welcome & Orientation', likes: 7, comments: 3 },
      { author: 'New team member', content: 'Read the first paper — the methodology section raised a question about the cell culture conditions. Is our protocol the same as described in Supplementary Table 2?', folder: 'Protocols & Methods', likes: 2, comments: 4 },
    ],
  },

  regulatory_submission: {
    type:           'regulatory_submission',
    label:          'Regulatory Submission',
    icon:           '📋',
    color:          '#dc2626',
    filterCategory: 'industry',
    description:    'Coordinate a regulatory submission using CTD structure.',
    usedBy:         'Regulatory Affairs, Medical Affairs, pharma teams',
    keyActions:     ['Draft modules', 'Track reviews', 'Manage submission'],
    galleryOnly:    true,
    folders: [
      { name: 'Module 1: Administrative', sort_order: 0 },
      { name: 'Module 2: Summaries',      sort_order: 1 },
      { name: 'Module 3: Quality',        sort_order: 2 },
      { name: 'Module 4: Nonclinical',    sort_order: 3 },
      { name: 'Module 5: Clinical',       sort_order: 4 },
      { name: 'Submission Checklist',     sort_order: 5 },
    ],
    starterPosts: [
      {
        folder:    'Module 1: Administrative',
        is_sticky: true,
        content: `<h3>📋 Welcome to {projectName}</h3>
<p>This project follows the <strong>Common Technical Document (CTD) structure</strong> used for regulatory submissions worldwide.</p>
<ul>
<li><strong>Module 1</strong> — Administrative: cover letters, forms, regional documents</li>
<li><strong>Module 2</strong> — Summaries: quality, nonclinical, and clinical overviews</li>
<li><strong>Module 3</strong> — Quality (CMC): drug substance, drug product, stability</li>
<li><strong>Module 4</strong> — Nonclinical: pharmacology, PK, toxicology study reports</li>
<li><strong>Module 5</strong> — Clinical: clinical study reports and literature references</li>
</ul>
<p>Post working drafts, flag open items, and track review status in the relevant module folder. Use the <em>Submission Checklist</em> to confirm readiness before filing.</p>`,
      },
      {
        folder:  'Module 2: Summaries',
        content: `<p>📝 <strong>Summaries draft</strong></p>
<p>Post working versions of the Quality Overall Summary (QOS), Nonclinical Overview, and Clinical Overview here for team review. Note the version number and any sections still pending sign-off.</p>`,
      },
      {
        folder:  'Module 5: Clinical',
        content: `<p>📄 <strong>Clinical study reports</strong></p>
<p>Add the key studies supporting the submission here using the paper post type. Include the CSR reference number, study phase, and whether the study is pivotal or supportive.</p>`,
      },
      {
        folder:  'Submission Checklist',
        content: `<p>✅ <strong>Pre-submission checklist</strong></p>
<p>All modules complete · Agency formatting requirements met · Cover letter drafted · Regional annexes prepared · Internal sign-off obtained · Submission date confirmed.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Dr. K. Hoffmann (Regulatory Affairs)', folder: 'Module 5: Clinical', content: 'Module 5 index updated — 47 clinical study reports included. The Japan-specific bridging study is now in section 5.3.5.4. Flagging for Medical Affairs review before we lock.', likes: 4, comments: 3 },
      { author: 'T. Nakamura (CMC Lead)', folder: 'Module 3: Quality', content: 'Module 3 draft ready for QA review. Main open item is the updated stability data — expecting final readout Friday.', likes: 2, comments: 5 },
    ],
  },

  product_launch: {
    type:           'product_launch',
    label:          'Product Launch',
    icon:           '🚀',
    color:          '#dc2626',
    filterCategory: 'industry',
    description:    'Coordinate a medical product launch across teams.',
    usedBy:         'Medical Affairs, market access, pharma and MedTech teams',
    keyActions:     ['Align strategy', 'Share materials', 'Track milestones'],
    galleryOnly:    true,
    folders: [
      { name: 'Scientific Platform',   sort_order: 0 },
      { name: 'Key Messages',          sort_order: 1 },
      { name: 'Publication Plan',      sort_order: 2 },
      { name: 'Stakeholder Materials', sort_order: 3 },
      { name: 'Launch Checklist',      sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Scientific Platform',
        is_sticky: true,
        content: `<h3>🚀 Welcome to {projectName}</h3>
<p><strong>Product:</strong> [add name]</p>
<p><strong>Indication:</strong> [add]</p>
<p><strong>Target launch date:</strong> [add]</p>
<p><strong>Key markets:</strong> [add]</p>
<p>Use this project to coordinate the cross-functional launch team.</p>`,
      },
      {
        folder:  'Scientific Platform',
        content: `<p>🔬 <strong>Scientific platform — draft</strong></p>
<p>The scientific narrative that underpins all launch materials. Share the draft here for cross-functional review — Medical Affairs, Market Access, and Commercial should all align on this before anything else is written.</p>`,
      },
      {
        folder:  'Key Messages',
        content: `<p>💬 <strong>Core messages by audience</strong></p>
<p>Document the key messages for each stakeholder group: HCPs, payers, patients. Flag any message where Medical Affairs and Commercial have different perspectives — better to resolve early.</p>`,
      },
      {
        folder:  'Launch Checklist',
        content: `<p>✅ <strong>Launch readiness checklist</strong></p>
<p>Scientific platform approved · Key messages aligned · Publication plan in place · Medical information responses ready · Training materials completed · Regulatory sign-off obtained.</p>`,
      },
    ],
    previewPosts: [
      { author: 'Dr. M. Santos (Medical Affairs)', content: 'Updated scientific platform after the Phase 3 subgroup data came in. The Japan-specific data changes our positioning story for the APAC region significantly — needs discussion before we brief the field team.', folder: 'Scientific Platform', likes: 9, comments: 6 },
      { author: 'T. Williams (Market Access)', content: '"Insufficient real-world data" is going to come up in every HTA. We need this addressed in the publication plan now, not after launch.', folder: 'Key Messages', likes: 5, comments: 4 },
    ],
  },

};

export const FAST_TEMPLATES    = Object.values(PROJECT_TEMPLATES).filter(t => !t.galleryOnly);
export const GALLERY_TEMPLATES = Object.values(PROJECT_TEMPLATES).filter(t =>  t.galleryOnly);
export const TEMPLATE_LIST     = Object.values(PROJECT_TEMPLATES);

export const GALLERY_FILTER_CATEGORIES = [
  { id: 'all',           label: 'All'              },
  { id: 'research',      label: '🔬 Research'      },
  { id: 'clinical',      label: '🏥 Clinical'      },
  { id: 'industry',      label: '💊 Industry'      },
  { id: 'collaboration', label: '🤝 Collaboration' },
];

export function applyTemplate(template, projectName, projectId, userId) {
  const folders = template.folders.map(f => ({
    project_id: projectId,
    name:       f.name,
    sort_order: f.sort_order,
  }));

  const posts = template.starterPosts.map(sp => ({
    project_id:  projectId,
    user_id:     userId,
    post_type:   'text',
    is_starter:  true,
    is_sticky:   sp.is_sticky || false,
    content:     sp.content.replace(/\{projectName\}/g, projectName),
    _folderName: sp.folder,
  }));

  return { folders, posts };
}
