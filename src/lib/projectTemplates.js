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

};

export const TEMPLATE_LIST = Object.values(PROJECT_TEMPLATES);

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
