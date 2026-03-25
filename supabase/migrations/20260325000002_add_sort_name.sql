-- Generated column that strips "The " prefix for natural alphabetical sorting
alter table creators
  add column sort_name text
  generated always as (regexp_replace(name, '^The\s+', '', 'i')) stored;

create index idx_creators_sort_name on creators(sort_name);
