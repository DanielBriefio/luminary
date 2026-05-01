-- One-shot: retroactively assign template starter posts to their folders.
--
-- Safe to run multiple times. Only updates posts that:
--   * are in a project (context_kind='project'),
--   * still have folder_id = NULL (so user-created content with a folder
--     already set is never touched),
--   * were authored by the project's creator (the starter-post insert),
--   * are within the template's starter_count for that project.
--
-- The mapping below mirrors src/lib/projectTemplates.js — each template
-- type is keyed to a list of folder names, where the i-th folder name is
-- the destination of the i-th starter post (matched by created_at order).

do $$
declare
  template_specs jsonb;
  v_template     text;
  v_folder_names jsonb;
  v_project      record;
  v_post_ids     uuid[];
  v_folder_id    uuid;
  v_folder_name  text;
  v_count        int := 0;
  i              int;
begin
  template_specs := jsonb_build_object(
    'conference',            jsonb_build_array('Planning', 'Key Sessions', 'Daily Notes', 'Action Items'),
    'journal_club',          jsonb_build_array('This Week''s Paper', 'Discussion', 'Discussion', 'Key Takeaways'),
    'publication',           jsonb_build_array('Drafts', 'Drafts', 'Reviews', 'Submission'),
    'weekly_team_meeting',   jsonb_build_array('Agenda', 'Agenda', 'Case Discussions', 'Action Items'),
    'clinical_training',     jsonb_build_array('Background Reading', 'Background Reading', 'Protocol & Steps', 'Training Log', 'Questions & Notes'),
    'research_project',      jsonb_build_array('Hypothesis & Background', 'Hypothesis & Background', 'Methods', 'Results & Data'),
    'grant_application',     jsonb_build_array('Specific Aims', 'Specific Aims', 'Research Strategy', 'Submission'),
    'advisory_board',        jsonb_build_array('Agenda', 'Agenda', 'Pre-reads', 'Action Items'),
    'literature_review',     jsonb_build_array('Search Strategy', 'Search Strategy', 'Included Papers', 'Summary'),
    'lab_onboarding',        jsonb_build_array('Welcome & Orientation', 'Welcome & Orientation', 'Key Papers', 'First Tasks'),
    'regulatory_submission', jsonb_build_array('Module 1: Administrative', 'Module 2: Summaries', 'Module 5: Clinical', 'Submission Checklist'),
    'product_launch',        jsonb_build_array('Scientific Platform', 'Scientific Platform', 'Key Messages', 'Launch Checklist')
  );

  for v_template, v_folder_names in select * from jsonb_each(template_specs)
  loop
    for v_project in
      select id, created_by from projects where template_type = v_template
    loop
      -- First N posts by created_at, still folder-less, authored by project creator.
      -- LIMIT N matches the template's starter count so we never pull user-authored content past the starters.
      select array_agg(id order by created_at)
        into v_post_ids
        from (
          select id, created_at
            from posts
           where context_kind = 'project'
             and context_id  = v_project.id
             and folder_id   is null
             and user_id     = v_project.created_by
           order by created_at
           limit jsonb_array_length(v_folder_names)
        ) first_n;

      if v_post_ids is null then continue; end if;

      for i in 0..(coalesce(array_length(v_post_ids, 1), 0) - 1) loop
        v_folder_name := v_folder_names->>i;
        if v_folder_name is null then continue; end if;

        select id into v_folder_id
          from project_folders
         where project_id = v_project.id
           and name       = v_folder_name;

        if v_folder_id is not null then
          update posts set folder_id = v_folder_id where id = v_post_ids[i + 1];
          v_count := v_count + 1;
        end if;
      end loop;
    end loop;
  end loop;

  raise notice 'Remapped % starter posts across all template projects.', v_count;
end $$;
