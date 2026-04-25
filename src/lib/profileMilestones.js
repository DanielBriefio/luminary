export const MILESTONES = [
  {
    id: 'name_set',
    label: 'Name and title set',
    check: (p) => !!(p.name?.trim() && p.title?.trim()),
    cta: 'Edit profile', ctaAction: 'edit_profile',
  },
  {
    id: 'institution_set',
    label: 'Institution added',
    check: (p) => !!p.institution?.trim(),
    cta: 'Add institution', ctaAction: 'edit_profile',
  },
  {
    id: 'identity_badge_set',
    label: 'Professional identity set',
    check: (p) => !!(p.identity_tier1 && p.identity_tier2),
    cta: 'Set your field', ctaAction: 'edit_profile',
    ctaLabels: {
      researcher:          'Set your research field',
      clinician:           'Set your clinical speciality',
      clinician_scientist: 'Set your primary field',
      industry:            'Set your professional area',
    },
  },
  {
    id: 'photo_set',
    label: 'Profile photo added',
    check: (p) => !!p.avatar_url,
    cta: 'Add photo', ctaAction: 'edit_profile',
  },
  {
    id: 'bio_written',
    label: 'Bio or summary added',
    check: (p) => (p.bio || '').trim().split(/\s+/).filter(Boolean).length >= 15,
    cta: 'Write bio', ctaAction: 'edit_profile',
  },
  {
    id: 'following_1',
    label: 'Following at least 1 researcher',
    check: (p, s) => (s.followingCount || 0) >= 1,
    cta: 'Discover researchers', ctaAction: 'explore',
  },
  {
    id: 'interests_set',
    label: 'Research interests added (3+)',
    check: (p) => (p.topic_interests || []).length >= 3,
    cta: 'Add interests', ctaAction: 'edit_profile',
  },
  {
    id: 'first_post',
    label: 'First post published',
    check: (p, s) => (s.postCount || 0) >= 1,
    cta: 'Write a post', ctaAction: 'new_post',
  },
  {
    id: 'first_comment',
    label: 'First comment made',
    check: (p, s) => (s.commentCount || 0) >= 1,
    cta: 'Join a discussion', ctaAction: 'feed',
  },
  {
    id: 'joined_group',
    label: 'Joined or created a group',
    check: (p, s) => (s.groupCount || 0) >= 1,
    cta: 'Explore groups', ctaAction: 'groups',
  },
  {
    id: 'public_profile',
    label: 'Public profile enabled',
    check: (p) => !!p.profile_slug && p.profile_visibility !== 'private',
    cta: 'Enable public profile', ctaAction: 'share_profile',
  },
  {
    id: 'card_details',
    label: 'Business card contact details added',
    check: (p) => !!(p.card_email || p.card_linkedin || p.card_website),
    cta: 'Add contact details', ctaAction: 'edit_profile',
  },
];

export const STAGES = [
  { number: 1, label: 'Identified', icon: '🔬', threshold: 3  },
  { number: 2, label: 'Credible',   icon: '📄', threshold: 5  },
  { number: 3, label: 'Connected',  icon: '🔗', threshold: 7  },
  { number: 4, label: 'Active',     icon: '💬', threshold: 9  },
  { number: 5, label: 'Visible',    icon: '🌐', threshold: 12 },
];

export const STAGE_REWARDS = {
  1: 'Your profile is set up and ready to be discovered',
  2: 'Your profile ranks higher in research searches',
  3: 'Researchers in your field can find and follow you more easily',
  4: 'Your posts reach wider audiences based on your research identity',
  5: 'Your profile works as a complete shareable research CV',
};

export function computeStage(profile, stats) {
  const completed = MILESTONES.filter(m => m.check(profile, stats)).length;
  if (completed >= 12) return 5;
  if (completed >= 9)  return 4;
  if (completed >= 7)  return 3;
  if (completed >= 5)  return 2;
  if (completed >= 3)  return 1;
  return 0;
}
