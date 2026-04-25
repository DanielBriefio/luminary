# Luminary — Database Schema Reference
_Generated from live Supabase snapshot: 2026-04-26_
_For coding conventions, architecture, and file structure see CLAUDE.md._

> **Usage:** Include this file in Claude Code prompts when the task
> touches the database: "Read CLAUDE.md, PRODUCT_STATE.md, SCHEMA.md,
> and TASK.md."

---

## 1. Tables

### `admin_config`
Key-value store for admin-controlled platform settings.
| column | type | nullable | default |
|---|---|---|---|
| key | text | NO | — |
| value | jsonb | NO | — |
| updated_at | timestamptz | YES | now() |
| updated_by | uuid | YES | null |

Known keys: `luminary_board`, `paper_of_week`, `milestone_post_template`

---

### `comments`
Public post comments.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| post_id | uuid | NO | — |
| content | text | NO | — |
| created_at | timestamptz | YES | now() |

---

### `community_template_ratings`
User ratings on community project templates.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| template_id | uuid | NO | — |
| user_id | uuid | NO | — |
| created_at | timestamptz | YES | now() |

---

### `community_templates`
User-submitted project templates pending admin approval.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| submitted_by | uuid | NO | — |
| status | text | YES | 'pending' |
| name | text | NO | — |
| description | text | YES | '' |
| used_by | text | YES | '' |
| filter_category | text | YES | 'collaboration' |
| icon | text | YES | 'pencil emoji' |
| color | text | YES | '#6c63ff' |
| folders | jsonb | YES | [] |
| starter_posts | jsonb | YES | [] |
| preview_posts | jsonb | YES | [] |
| rating_count | integer | YES | 0 |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

Status values: pending, approved, rejected

---

### `conversations`
Direct message conversation threads between two users.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id_a | uuid | NO | — |
| user_id_b | uuid | NO | — |
| last_message | text | YES | '' |
| last_message_at | timestamptz | YES | now() |
| created_at | timestamptz | YES | now() |

Note: user_id_a < user_id_b (canonical sort prevents duplicates).

---

### `follows`
Universal follow table for users, papers, and groups.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| follower_id | uuid | NO | — |
| target_type | text | NO | — |
| target_id | text | NO | — |
| created_at | timestamptz | YES | now() |

target_type values: user, paper, group

---

### `group_follows`
Users following a group without joining it.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| group_id | uuid | NO | — |
| user_id | uuid | NO | — |
| created_at | timestamptz | YES | now() |

---

### `group_invites`
Token-based group invite links (separate from platform invite_codes).
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| group_id | uuid | NO | — |
| created_by | uuid | NO | — |
| token | text | NO | auto-generated 12-char lowercase |
| expires_at | timestamptz | YES | now() + 7 days |
| max_uses | integer | YES | 10 |
| use_count | integer | YES | 0 |
| created_at | timestamptz | YES | now() |

---

### `group_join_requests`
Pending requests to join closed groups.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| group_id | uuid | NO | — |
| user_id | uuid | NO | — |
| message | text | YES | '' |
| status | text | YES | 'pending' |
| created_at | timestamptz | YES | now() |

---

### `group_members`
Group membership roster.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| group_id | uuid | NO | — |
| user_id | uuid | NO | — |
| role | text | YES | 'member' |
| display_role | text | YES | '' |
| joined_at | timestamptz | YES | now() |
| last_read_at | timestamptz | YES | now() |
| created_at | timestamptz | YES | now() |

Role values: admin, member, alumni

---

### `group_post_comments`
Comments on group posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | NO | — |
| user_id | uuid | NO | — |
| content | text | NO | — |
| read_at | timestamptz | YES | null |
| created_at | timestamptz | YES | now() |

---

### `group_post_likes`
Likes on group posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | NO | — |
| user_id | uuid | NO | — |
| created_at | timestamptz | YES | now() |

---

### `group_posts`
Posts within a group feed.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| group_id | uuid | NO | — |
| user_id | uuid | NO | — |
| content | text | NO | — |
| post_type | text | YES | 'text' |
| paper_doi | text | YES | '' |
| paper_title | text | YES | '' |
| paper_journal | text | YES | '' |
| paper_authors | text | YES | '' |
| paper_abstract | text | YES | '' |
| paper_year | text | YES | '' |
| paper_citation | text | YES | '' |
| link_url | text | YES | '' |
| link_title | text | YES | '' |
| link_description | text | YES | '' |
| image_url | text | YES | '' |
| file_type | text | YES | '' |
| file_name | text | YES | '' |
| tags | text[] | YES | {} |
| tier1 | text | YES | '' |
| tier2 | text[] | YES | {} |
| is_sticky | boolean | YES | false |
| is_announcement | boolean | YES | false |
| is_reposted_public | boolean | YES | false |
| content_iv | text | YES | '' |
| content_encrypted | boolean | YES | false |
| edited_at | timestamptz | YES | null |
| created_at | timestamptz | YES | now() |

content_iv and content_encrypted are Phase 6 encryption placeholders.

---

### `groups`
Research groups and collaborative spaces.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| description | text | YES | '' |
| institution | text | YES | '' |
| research_topic | text | YES | '' |
| research_details | text | YES | '' |
| field_tags | text[] | YES | {} |
| tier1 | text | YES | '' |
| tier2 | text[] | YES | {} |
| owner_id | uuid | YES | null |
| created_by | uuid | YES | null |
| is_private | boolean | YES | true |
| is_public | boolean | YES | true |
| is_searchable | boolean | YES | true |
| slug | text | YES | null |
| avatar_url | text | YES | '' |
| cover_url | text | YES | '' |
| leader_name | text | YES | '' |
| contact_email | text | YES | '' |
| website_url | text | YES | '' |
| location | text | YES | '' |
| company | text | YES | '' |
| country | text | YES | '' |
| department_name | text | YES | '' |
| patient_population | text | YES | '' |
| group_type | text | YES | 'research' |
| collaborating_groups | jsonb | YES | [] |
| public_show_members | boolean | YES | true |
| public_show_leader | boolean | YES | true |
| public_show_location | boolean | YES | true |
| public_show_contact | boolean | YES | false |
| public_show_posts | boolean | YES | true |
| public_show_publications | boolean | YES | true |
| public_profile_enabled | boolean | YES | false |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

CONVENTION: Use created_by not owner_id. Use is_public not is_private.
slug is auto-generated by generate_group_slug trigger.

---

### `invite_code_uses`
Tracks individual uses of multi-use (event) invite codes.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code_id | uuid | NO | — |
| user_id | uuid | NO | — |
| claimed_at | timestamptz | YES | now() |

Unique constraint: (code_id, user_id)

---

### `invite_codes`
Platform invite codes.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| code | text | NO | — |
| created_by | uuid | YES | null |
| claimed_by | uuid | YES | null |
| claimed_at | timestamptz | YES | null |
| batch_label | text | YES | '' |
| label | text | YES | null |
| notes | text | YES | null |
| max_uses | integer | YES | 1 |
| uses_count | integer | YES | 0 |
| is_multi_use | boolean | YES | false |
| expires_at | timestamptz | YES | null |
| locked_at | timestamptz | YES | null |
| attempts | integer | YES | 0 |
| created_at | timestamptz | YES | now() |

Personal code: is_multi_use=false, claimed_by set on claim.
Event code: is_multi_use=true, uses tracked in invite_code_uses.

---

### `invite_rate_limits`
IP-based rate limiting for invite code attempts.
| column | type | nullable | default |
|---|---|---|---|
| ip | text | NO | — |
| window_start | timestamptz | NO | — |
| attempts | integer | NO | 0 |

---

### `library_folders`
Personal and group library folder structure.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES | null |
| group_id | uuid | YES | null |
| name | text | NO | — |
| description | text | YES | '' |
| sort_order | integer | YES | 0 |
| created_at | timestamptz | YES | now() |

---

### `library_items`
Papers and documents saved to library folders.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| folder_id | uuid | YES | null |
| added_by | uuid | YES | null |
| title | text | NO | — |
| authors | text | YES | '' |
| journal | text | YES | '' |
| year | text | YES | '' |
| doi | text | YES | '' |
| pmid | text | YES | '' |
| epmc_id | text | YES | '' |
| abstract | text | YES | '' |
| cited_by_count | integer | YES | 0 |
| is_open_access | boolean | YES | false |
| full_text_url | text | YES | '' |
| pdf_url | text | YES | '' |
| pdf_name | text | YES | '' |
| notes | text | YES | '' |
| citation | text | YES | '' |
| is_group_publication | boolean | YES | false |
| added_at | timestamptz | YES | now() |

folder_id IS NULL means item is in the Unsorted inbox.

---

### `likes`
Likes on public posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| post_id | uuid | NO | — |
| created_at | timestamptz | YES | now() |

---

### `messages`
Direct messages within conversations.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| conversation_id | uuid | NO | — |
| sender_id | uuid | NO | — |
| content | text | NO | — |
| read_at | timestamptz | YES | null |
| created_at | timestamptz | YES | now() |

---

### `notifications`
In-app notification bell items.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| actor_id | uuid | YES | null |
| notif_type | text | NO | — |
| target_type | text | YES | null |
| target_id | text | YES | null |
| meta | jsonb | YES | {} |
| read | boolean | YES | false |
| created_at | timestamptz | YES | now() |

Known notif_type values: new_post, new_comment, paper_comment,
new_follower, group_post, group_announcement, group_member_added,
group_join_request, group_request_approved, group_alumni_granted,
group_member_joined, group_member_left, invite_redeemed, new_message

Meta patterns by type:
- Group types: { group_id, group_name }
- Paper types: { paper_doi, paper_title, comment_id }
- Invite: { code }
- Post types: { post_type }

---

### `orcid_pending`
Temporary ORCID OAuth data before profile creation.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| token | text | NO | — |
| orcid_id | text | NO | — |
| name | text | YES | '' |
| bio | text | YES | '' |
| institution | text | YES | '' |
| title | text | YES | '' |
| work_history | text | YES | '[]' |
| education | text | YES | '[]' |
| publications | text | YES | '[]' |
| keywords | text | YES | '[]' |
| expires_at | timestamptz | NO | — |
| created_at | timestamptz | YES | now() |

---

### `post_reports`
User reports on public or group posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | YES | null |
| group_post_id | uuid | YES | null |
| reporter_id | uuid | NO | — |
| reason | text | NO | — |
| note | text | YES | null |
| status | text | YES | 'pending' |
| created_at | timestamptz | YES | now() |

Constraint: exactly one of post_id or group_post_id must be set.
Status values: pending, dismissed, actioned

---

### `posts`
Public feed posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| content | text | NO | '' |
| post_type | text | YES | 'text' |
| paper_doi | text | YES | '' |
| paper_title | text | YES | '' |
| paper_journal | text | YES | '' |
| paper_authors | text | YES | '' |
| paper_abstract | text | YES | '' |
| paper_year | text | YES | '' |
| paper_citation | text | YES | '' |
| link_title | text | YES | '' |
| link_url | text | YES | '' |
| link_source | text | YES | '' |
| image_url | text | YES | '' |
| file_type | text | YES | '' |
| file_name | text | YES | '' |
| tags | text[] | YES | {} |
| tier1 | text | YES | '' |
| tier2 | text[] | YES | {} |
| visibility | text | YES | 'everyone' |
| group_id | uuid | YES | null |
| group_name | text | YES | '' |
| is_deep_dive | boolean | YES | false |
| is_featured | boolean | YES | false |
| featured_until | timestamptz | YES | null |
| featured_at | timestamptz | YES | null |
| is_hidden | boolean | YES | false |
| is_admin_post | boolean | YES | false |
| target_user_id | uuid | YES | null |
| bg_color | text | YES | null |
| created_at | timestamptz | YES | now() |

ACTIVE post types: text, paper only.
LEGACY post types in DB (not created by UI): link, upload, tip,
milestone, admin_nudge. is_deep_dive=true marks deep-dive text posts.
targeted posts filtered client-side in FeedScreen, not at DB RLS level.

---

### `profiles`
User profiles — one per authenticated user.

Core identity:
| column | type | default |
|---|---|---|
| id | uuid | FK to auth.users |
| name | text | '' |
| first_name / last_name / middle_name | text | '' |
| name_prefix / name_suffix | text | '' |
| title | text | '' |
| institution | text | '' |
| location | text | '' |
| bio | text | '' |
| profile_slug | text | null (unique, auto-generated) |
| signup_method | text | 'invite' |
| work_mode | text | 'researcher' |

work_mode values: researcher, clinician, industry, clinician_scientist

Scientific identity:
| column | type | default |
|---|---|---|
| identity_tier1 / identity_tier2 | text | '' |
| field_tags / topic_interests | text[] | {} |
| h_index / i10_index | integer | 0 |
| orcid / orcid_verified | text/bool | '' / false |
| twitter / website | text | '' |

Clinical fields (clinician/clinician_scientist only):
subspeciality, years_in_practice, primary_hospital,
patient_population, additional_quals[], clinical_highlight_label,
clinical_highlight_value

Gamification (NOT YET WIRED — decorative):
xp (integer, default 0), level (integer, default 1)

Profile sections (jsonb arrays):
work_history, education, certifications, volunteering,
organizations, honors, languages, skills, patents, grants,
li_publications

Visibility:
profile_visibility (jsonb), activation_milestones (jsonb)

Business card:
card_email, card_phone, card_linkedin, card_website, card_visible
card_show_email, card_show_phone, card_show_linkedin,
card_show_website, card_show_orcid, card_show_twitter
card_address / card_show_address — LEGACY, deferred DROP
work_phone, work_address — legacy address fields
work_street, work_city, work_postal_code, work_country — split (live)
location_city, location_country — split (live)
card_show_work_phone, card_show_work_address

Email preferences:
email_notifications (master toggle, default true)
email_notif_new_follower (default true)
email_notif_new_message (default true)
email_notif_group_request (default true)
email_notif_new_comment (default true)
email_notif_invite_redeemed (default true)
email_marketing (default false)
marketing_consent_at, analytics_consent_at
terms_accepted_at, privacy_accepted_at

Admin:
is_admin (boolean, default false)
admin_notes (text)
welcome_email_sent (boolean, default false)

Import tracking:
linkedin_imported_at, orcid_imported_at

Onboarding:
onboarding_completed (boolean, default false)

---

### `project_folders`
Folder structure within a project.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| project_id | uuid | NO | — |
| name | text | NO | — |
| sort_order | integer | YES | 0 |
| created_at | timestamptz | YES | now() |

---

### `project_members`
Project membership.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| project_id | uuid | NO | — |
| user_id | uuid | NO | — |
| role | text | YES | 'member' |
| joined_at | timestamptz | YES | now() |
| last_read_at | timestamptz | YES | now() |

---

### `project_post_comments`
Comments on project posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | NO | — |
| user_id | uuid | NO | — |
| content | text | NO | — |
| created_at | timestamptz | YES | now() |

---

### `project_post_likes`
Likes on project posts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | NO | — |
| user_id | uuid | NO | — |
| created_at | timestamptz | YES | now() |

---

### `project_posts`
Posts within a project folder.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| project_id | uuid | NO | — |
| folder_id | uuid | YES | null |
| user_id | uuid | NO | — |
| post_type | text | YES | 'text' |
| content | text | YES | '' |
| paper_doi / title / journal / authors / abstract / year / citation | text | YES | '' |
| image_url / file_type / file_name | text | YES | '' |
| tags | text[] | YES | {} |
| tier1 | text | YES | '' |
| tier2 | text[] | YES | {} |
| is_sticky | boolean | YES | false |
| is_starter | boolean | YES | false |
| content_iv | text | YES | '' |
| content_encrypted | boolean | YES | false |
| edited_at | timestamptz | YES | null |
| created_at | timestamptz | YES | now() |

content_iv and content_encrypted are Phase 6 encryption placeholders.

---

### `projects`
Personal and group projects.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES | null |
| group_id | uuid | YES | null |
| created_by | uuid | YES | null |
| name | text | NO | — |
| description | text | YES | '' |
| template_type | text | YES | 'blank' |
| cover_color | text | YES | '#6c63ff' |
| icon | text | YES | pencil emoji |
| status | text | YES | 'active' |
| is_pinned | boolean | YES | false |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

CONVENTION: created_by is always set (authoritative owner).
user_id is null for group projects. user_id = created_by for personal.

---

### `publications`
User publication records.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| title | text | NO | — |
| journal / venue | text | YES | '' |
| year | text | YES | '' |
| doi / pmid | text | YES | '' |
| authors | text | YES | '' |
| pub_type | text | YES | 'journal' |
| source | text | YES | 'manual' |
| citations | integer | YES | 0 |
| is_open_access | boolean | YES | false |
| full_text_url | text | YES | '' |
| tier1 | text | YES | '' |
| tier2 | text[] | YES | {} |
| tags | text[] | YES | {} |
| citation | text | YES | '' |
| created_at | timestamptz | YES | now() |

---

### `reposts`
Tracks public feed reposts.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| post_id | uuid | NO | — |
| created_at | timestamptz | NO | now() |

---

### `saved_posts`
Bookmarked posts (public and group).
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO | — |
| post_id | uuid | YES | null |
| group_post_id | uuid | YES | null |
| saved_at | timestamptz | YES | now() |

---

### `waitlist`
Early access waitlist signups from the landing page.
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| full_name | text | NO | — |
| email | text | NO | — |
| institution | text | YES | null |
| role_title | text | YES | null |
| referral_source | text | YES | null |
| is_priority | boolean | YES | false |
| created_at | timestamptz | YES | now() |

---

## 2. Views

### `posts_with_meta`
Public posts enriched with author info and engagement counts.
Computed additions: author_name, author_title, author_institution,
author_avatar (color), author_avatar_url, author_identity_tier1/2,
author_work_mode, author_slug, like_count, comment_count,
repost_count, user_liked, user_reposted, report_count (pending only)

### `group_posts_with_meta`
Group posts enriched with author and group role info.
Computed additions: author_name, author_title, author_institution,
author_avatar, author_avatar_url, author_identity_tier1/2,
author_group_role, author_display_role, like_count, comment_count

### `group_stats`
Per-group aggregated membership stats.
Columns: group_id, member_count, admin_count, alumni_count,
active_member_count, publication_count

### `project_posts_with_meta`
Project posts enriched with author, folder, and project context.
Computed additions: author_name, author_title, author_institution,
author_avatar, author_avatar_url, author_identity_tier2,
folder_name, project_name, project_icon, project_color,
project_group_id, like_count, comment_count

---

## 3. Functions / RPCs

### Admin-gated (SECURITY DEFINER, require is_admin = true)

| function | arguments | returns | purpose |
|---|---|---|---|
| get_admin_config | p_key text | jsonb | Read admin_config value |
| set_admin_config | p_key text, p_value jsonb | void | Write admin_config value |
| get_admin_posts | p_limit, p_offset, p_search, p_type, p_featured, p_hidden | jsonb | Paginated admin post list |
| get_admin_user_list | — | jsonb | All users with computed activation/ghost stats |
| get_activity_sparklines | — | jsonb | 30-day daily activity counts |
| get_at_risk_alerts | — | jsonb | Ghost users + quiet groups + pending templates |
| get_bot_conversation_messages | p_conversation_id, p_bot_user_id | jsonb | Bot inbox thread |
| get_bot_conversations | p_bot_user_id | jsonb | Bot inbox list |
| get_content_health | — | jsonb | Group + project health tables |
| get_ghost_users | — | jsonb | Stuck + almost ghost segments |
| get_invite_codes_with_stats | — | jsonb | All invite codes with computed status |
| get_invite_tree | p_code text | jsonb | Invite chain + conversion metrics per code |
| get_moderation_queue | p_status text | jsonb | Reported content queue |
| get_paper_health | — | jsonb | Paper discussion health metrics |
| get_platform_stats | — | jsonb | Overview dashboard totals |
| get_user_activation_stages | — | jsonb | Activation funnel counts |
| send_admin_nudge | p_target_user_ids, p_message, p_bot_user_id | jsonb | DM from bot to users |
| send_admin_post | p_mode, p_content, p_bot_user_id + paper/link fields | jsonb | Broadcast/targeted/group post as bot |
| send_bot_message | p_conversation_id, p_message, p_bot_user_id | jsonb | Reply in bot inbox thread |

### Auth / invite helpers (SECURITY DEFINER)

| function | arguments | returns | purpose |
|---|---|---|---|
| claim_invite_code | p_code, p_user_id | boolean | Claim a personal invite code at signup |
| check_and_increment_ip_rate_limit | p_ip, p_window_minutes, p_max | boolean | IP-based rate limiting |
| increment_invite_attempts | p_code | void | Track failed invite attempts |
| generate_user_invites | user_id, count (default 5) | void | Generate N personal codes for a user |
| delete_own_account | — | void | Hard-delete current user + all data |

### Group helpers (SECURITY DEFINER, return SETOF uuid)

| function | purpose |
|---|---|
| get_my_group_ids | All groups user is member or admin of |
| get_my_admin_group_ids | Groups where user is admin |
| get_my_member_group_ids | Groups where user is member or admin |
| get_my_member_post_ids | Group posts visible to current user |
| get_public_group_ids | All public groups |

### Public helpers (SECURITY INVOKER)

| function | arguments | returns | purpose |
|---|---|---|---|
| get_paper_stats_public | — | TABLE | Paper discussion stats for sidebar |
| get_top_tags | tag_limit | TABLE(tag, count) | Top hashtags |
| cleanup_orcid_pending | — | void | Remove expired ORCID pending rows |
| create_group_library_defaults | p_group_id | void | Create default library folders |

### Triggers (auto-fire)

| function | fires on | purpose |
|---|---|---|
| handle_new_user | auth.users INSERT | Creates profiles row |
| _auto_generate_invites | profiles INSERT | Generates 5 personal invite codes |
| generate_group_slug | groups INSERT | Auto-generates unique slug |
| notify_followers_of_new_post | posts INSERT | Notifies followers |
| notify_on_new_comment | comments INSERT | Notifies post author |
| notify_on_new_follow | follows INSERT | Notifies followed user |

---

## 4. RLS Policies Summary

Key patterns:
- Public read: follows, likes, reposts, comments — SELECT true
- Own-only write: most tables — auth.uid() = user_id
- Group-scoped: group_posts, comments, likes — get_my_member_group_ids()
- Admin override: invite_codes, admin_config, post_reports, community_templates
- Project RLS: delegated — if you can see the project, you see its children

Notable policies:
- groups_select: is_public OR created_by = auth.uid() OR in get_my_group_ids()
- posts_select: visibility = 'everyone' OR auth.uid() = user_id
  (targeted posts filtered client-side in FeedScreen, not at DB level)
- notifications: two INSERT policies — notifs_insert (any authed) +
  service role policy
- waitlist: anon_insert_waitlist allows INSERT without auth (landing page)
- orcid_pending: SELECT allowed without auth for non-expired rows

---

## 5. Key Indexes

| table | index | purpose |
|---|---|---|
| notifications | notifs_user_idx (user_id, created_at DESC) | Bell queries |
| messages | idx_messages_conversation (conversation_id, created_at) | Thread load |
| messages | idx_messages_unread WHERE read_at IS NULL | Unread counts |
| posts | idx_posts_featured WHERE is_featured | Featured posts |
| posts | idx_posts_target_user WHERE NOT NULL | Targeted delivery |
| posts | idx_posts_tier1 / idx_posts_tier2 (GIN) | Tag filtering |
| group_posts | idx_group_posts_group_id (group_id, created_at DESC) | Group feed |
| conversations | idx_conversations_user_a/b (user_id, last_message_at DESC) | DM list |
| library_items | idx_library_items_folder (folder_id, added_at DESC) | Library |
| library_items | idx_library_items_doi WHERE doi != '' | DOI dedup |
| invite_codes | idx_invite_codes_code | Code validation at signup |
| invite_codes | idx_invite_codes_created_by | Admin user code list |
| follows | follows_follower_idx / follows_target_idx | Follow queries |
| group_members | idx_group_members_group / _user | Membership checks |
| project_posts | idx_project_posts_project / _folder | Project feed |

---

## 6. Pending / Deferred Schema Items

- card_address / card_show_address on profiles — DROP deferred (still in DB)
- content_iv / content_encrypted on posts, group_posts, project_posts
  — Phase 6 encryption placeholders, not yet implemented
- profiles.xp / profiles.level — gamification columns exist, not wired
- groups.owner_id / groups.is_private — LEGACY, never use in new code
- migration_profile_v2.sql (partial) — additive columns applied;
  DROP of card_address/card_show_address still pending
