export const MILESTONES = [

  // Stage 1: Identified
  {
    id: 'name_set', stage: 1,
    label: 'Name and title set',
    check: (p) => !!(p.name?.trim() && p.title?.trim()),
    cta: 'Edit profile', ctaAction: 'edit_profile',
  },
  {
    id: 'institution_set', stage: 1,
    label: 'Institution added',
    check: (p) => !!p.institution?.trim(),
    cta: 'Add institution', ctaAction: 'edit_profile',
  },
  {
    id: 'identity_badge_set', stage: 1,
    label: 'Professional identity badge set',
    check: (p) => !!(p.identity_tier1 && p.identity_tier2),
    cta: 'Set your field', ctaAction: 'edit_profile',
  },

  // Stage 2: Credible
  {
    id: 'photo_set', stage: 2,
    label: 'Profile photo added',
    check: (p) => !!p.avatar_url,
    cta: 'Add photo', ctaAction: 'edit_profile',
  },
  {
    id: 'bio_written', stage: 2,
    label: 'Bio written (50+ words)',
    check: (p) => (p.bio || '').trim().split(/\s+/).length >= 50,
    cta: 'Write bio', ctaAction: 'edit_profile',
    importNote: 'Completed via import',
  },
  {
    id: 'publication_added', stage: 2,
    label: 'At least 1 publication added',
    check: (p, s) => (s.publicationCount || 0) >= 1,
    cta: 'Add publication', ctaAction: 'publications',
    importNote: 'Completed via ORCID import',
  },

  // Stage 3: Connected
  {
    id: 'orcid_linked', stage: 3,
    label: 'ORCID linked and verified',
    check: (p) => !!(p.orcid && p.orcid_verified),
    cta: 'Link ORCID', ctaAction: 'import_orcid',
    importNote: 'Completed via ORCID sign-up',
  },
  {
    id: 'following_3', stage: 3,
    label: 'Following at least 3 researchers',
    check: (p, s) => (s.followingCount || 0) >= 3,
    cta: 'Discover researchers', ctaAction: 'explore',
  },
  {
    id: 'interests_set', stage: 3,
    label: 'Research interests added (3+)',
    check: (p) => (p.topic_interests || []).length >= 3,
    cta: 'Add interests', ctaAction: 'edit_profile',
  },

  // Stage 4: Active
  {
    id: 'first_post', stage: 4,
    label: 'First post published',
    check: (p, s) => (s.postCount || 0) >= 1,
    cta: 'Write a post', ctaAction: 'new_post',
  },
  {
    id: 'first_comment', stage: 4,
    label: 'First comment made',
    check: (p, s) => (s.commentCount || 0) >= 1,
    cta: 'Join a discussion', ctaAction: 'feed',
  },
  {
    id: 'joined_group', stage: 4,
    label: 'Joined or created a group',
    check: (p, s) => (s.groupCount || 0) >= 1,
    cta: 'Explore groups', ctaAction: 'groups',
  },

  // Stage 5: Visible
  {
    id: 'public_profile', stage: 5,
    label: 'Public profile enabled',
    check: (p) => !!p.profile_slug && p.profile_visibility !== 'private',
    cta: 'Enable public profile', ctaAction: 'share_profile',
  },
  {
    id: 'card_details', stage: 5,
    label: 'Business card contact details added',
    check: (p) => !!(p.card_email || p.card_linkedin || p.card_website),
    cta: 'Add contact details', ctaAction: 'edit_profile',
  },
  {
    id: 'publications_5', stage: 5,
    label: '5 or more publications added',
    check: (p, s) => (s.publicationCount || 0) >= 5,
    cta: 'Add more publications', ctaAction: 'publications',
    importNote: 'Completed via import',
  },
];

export const STAGES = [
  { number: 1, label: 'Identified',  icon: '🔬' },
  { number: 2, label: 'Credible',    icon: '📄' },
  { number: 3, label: 'Connected',   icon: '🔗' },
  { number: 4, label: 'Active',      icon: '💬' },
  { number: 5, label: 'Visible',     icon: '🌐' },
];

export const STAGE_REWARDS = {
  1: 'Your profile is set up and ready to be discovered',
  2: 'Your profile appears in Explore researcher search',
  3: 'You can send and receive direct messages',
  4: 'Your posts appear in For You feeds across Luminary',
  5: 'Your profile is fully shareable as a public research CV',
};

export function computeStage(profile, stats) {
  let highestComplete = 0;
  for (const stage of [1, 2, 3, 4, 5]) {
    const stageMilestones = MILESTONES.filter(m => m.stage === stage);
    const allDone = stageMilestones.every(m => m.check(profile, stats));
    if (allDone) highestComplete = stage;
    else break;
  }
  return highestComplete;
}

export function getNextStageMilestones(profile, stats) {
  const currentStage = computeStage(profile, stats);
  const nextStage    = Math.min(currentStage + 1, 5);
  return {
    stage:      nextStage,
    milestones: MILESTONES.filter(m => m.stage === nextStage),
  };
}
