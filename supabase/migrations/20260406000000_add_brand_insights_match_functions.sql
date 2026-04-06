-- Match functions for parallel vector retrieval across all brand embedding tables

CREATE OR REPLACE FUNCTION public.match_brand_insights_trends(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_brand_id text
)
RETURNS TABLE(id uuid, title text, description text, relevance_to_brand text, similarity double precision)
LANGUAGE plpgsql
AS $$
begin
  return query
  select
    t.id,
    t.title,
    t.description,
    t.relevance_to_brand,
    1 - (t.embedding <=> query_embedding) as similarity
  from public.brand_insights_trends t
  where t.embedding is not null
  and 1 - (t.embedding <=> query_embedding) > match_threshold
  and t.brand_id = filter_brand_id
  order by t.embedding <=> query_embedding
  limit match_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.match_brand_insights_events(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_brand_id text
)
RETURNS TABLE(id uuid, title text, description text, opportunity text, event_date date, similarity double precision)
LANGUAGE plpgsql
AS $$
begin
  return query
  select
    e.id,
    e.title,
    e.description,
    e.opportunity,
    e.event_date,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.brand_insights_events e
  where e.embedding is not null
  and 1 - (e.embedding <=> query_embedding) > match_threshold
  and e.brand_id = filter_brand_id
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.match_brand_insights_questions(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_brand_id text
)
RETURNS TABLE(id uuid, question_text text, why_relevant text, niche text, social_platform text, similarity double precision)
LANGUAGE plpgsql
AS $$
begin
  return query
  select
    q.id,
    q.question_text,
    q.why_relevant,
    q.niche,
    q.social_platform,
    1 - (q.embedding <=> query_embedding) as similarity
  from public.brand_insights_questions q
  where q.embedding is not null
  and 1 - (q.embedding <=> query_embedding) > match_threshold
  and q.brand_id = filter_brand_id
  order by q.embedding <=> query_embedding
  limit match_count;
end;
$$;

CREATE OR REPLACE FUNCTION public.match_strategic_analysis_embeddings(
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
  filter_brand_id uuid
)
RETURNS TABLE(id uuid, section text, label text, embedding_text text, similarity double precision)
LANGUAGE plpgsql
AS $$
begin
  return query
  select
    s.id,
    s.section,
    s.label,
    s.embedding_text,
    1 - (s.embedding <=> query_embedding) as similarity
  from brand_profiles.strategic_analysis_embeddings s
  where s.embedding is not null
  and 1 - (s.embedding <=> query_embedding) > match_threshold
  and s.brand_id = filter_brand_id
  order by s.embedding <=> query_embedding
  limit match_count;
end;
$$;
