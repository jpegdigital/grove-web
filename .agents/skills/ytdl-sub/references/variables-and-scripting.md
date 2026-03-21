# Variables and Scripting Reference

## Table of Contents

- [Variable Syntax](#variable-syntax)
- [Entry Variables](#entry-variables)
- [Playlist Variables](#playlist-variables)
- [Date Variables](#date-variables)
- [Source Variables](#source-variables)
- [Static Variables](#static-variables)
- [Metadata Variables](#metadata-variables)
- [Scripting Functions](#scripting-functions)
- [Custom Functions](#custom-functions)

## Variable Syntax

Use `{variable_name}` in any field supporting formatters. Append `_sanitized` for filesystem-safe values (replaces problematic characters).

Do not sanitize variables that intentionally contain directory paths — it will sanitize the `/` separators.

## Entry Variables

| Variable | Type | Description |
|----------|------|-------------|
| `title` | String | Entry title (falls back to unique ID) |
| `title_sanitized_plex` | String | Plex-safe title (numbers replaced with fixed-width to avoid misparse) |
| `channel` | String | Channel name (falls back to uploader) |
| `channel_id` | String | Channel ID |
| `creator` | String | Creator name (falls back to channel) |
| `description` | String | Description (empty string if missing) |
| `duration` | Integer | Duration in seconds (0 if missing) |
| `ext` | String | Downloaded file extension |
| `thumbnail_ext` | String | Thumbnail extension (always "jpg") |
| `info_json_ext` | String | "info.json" extension |
| `uid` | String | Unique ID |
| `uid_sanitized_plex` | String | Plex-safe UID |
| `webpage_url` | String | URL to the webpage |
| `uploader` | String | Uploader (falls back to uploader ID) |
| `uploader_id` | String | Uploader ID (falls back to UID) |
| `uploader_url` | String | Uploader URL (falls back to webpage_url) |
| `extractor` | String | yt-dlp extractor name |
| `extractor_key` | String | yt-dlp extractor key |
| `height` | Integer | Video height in pixels (0 for audio) |
| `width` | Integer | Video width in pixels (0 for audio) |
| `epoch` | Integer | Unix epoch of metadata scrape |
| `epoch_date` | String | Epoch date in YYYYMMDD format |
| `chapters` | Array | Chapters if they exist |
| `comments` | Array | Comments if requested |
| `requested_subtitles` | Map | Subtitles if requested and exist |
| `sponsorblock_chapters` | Array | SponsorBlock chapters if requested |

## Playlist Variables

| Variable | Type | Description |
|----------|------|-------------|
| `playlist_title` | String | Playlist/channel name |
| `playlist_uid` | String | Playlist unique ID |
| `playlist_index` | Integer | Index in playlist (changes if playlist modified) |
| `playlist_index_padded` | String | Padded two digits |
| `playlist_index_padded6` | String | Padded six digits |
| `playlist_index_reversed` | Integer | `playlist_count - playlist_index + 1` |
| `playlist_count` | Integer | Total playlist entries |
| `playlist_description` | String | Playlist description |
| `playlist_webpage_url` | String | Playlist webpage URL |
| `playlist_uploader` | String | Playlist uploader |
| `playlist_max_upload_year` | Integer | Max upload year across playlist entries |

## Date Variables

Both `upload_*` and `release_*` variants exist. Upload dates fall back to today; release dates fall back to upload date.

| Variable pattern | Type | Description |
|-----------------|------|-------------|
| `upload_date` / `release_date` | String | YYYYMMDD format |
| `upload_date_standardized` / `release_date_standardized` | String | YYYY-MM-DD format |
| `upload_year` / `release_year` | Integer | Year |
| `upload_month` / `release_month` | Integer | Month (no padding) |
| `upload_month_padded` / `release_month_padded` | String | Month padded to 2 digits |
| `upload_day` / `release_day` | Integer | Day (no padding) |
| `upload_day_padded` / `release_day_padded` | String | Day padded to 2 digits |
| `upload_day_of_year` / `release_day_of_year` | Integer | Day of year (Feb 1 = 32) |
| `*_reversed` variants | Integer | Reversed values for descending sort |
| `*_reversed_padded` variants | String | Reversed and padded |

## Source Variables

For multi-level hierarchies (channel > playlist > entry):

| Variable | Type | Description |
|----------|------|-------------|
| `source_title` | String | Source name (falls back to playlist_title) |
| `source_uid` | String | Source unique ID |
| `source_index` | Integer | Source index (use cautiously) |
| `source_count` | Integer | Source count |
| `source_description` | String | Source description |
| `source_webpage_url` | String | Source webpage URL |

## Static Variables

Set per-subscription, not per-entry:

| Variable | Description |
|----------|-------------|
| `subscription_name` | Name of the subscription (prefix stripped for ~, + modes) |
| `subscription_value` | Value for `"Name": "value"` subscriptions |
| `subscription_value_i` | `subscription_value_1`, `_2`, etc. for multi-URL |
| `subscription_indent_i` | Values from `= ...` ancestor keys (`subscription_indent_1`, `_2`, etc.) |
| `subscription_array` | All URLs as array for list-form subscriptions |
| `subscription_map` | Map contents for `+` mode subscriptions |
| `subscription_has_download_archive` | True if entries exist in download archive |

## Metadata Variables

| Variable | Type | Description |
|----------|------|-------------|
| `entry_metadata` | Map | Full info.json contents |
| `playlist_metadata` | Map | Parent playlist metadata |
| `source_metadata` | Map | Grandparent source metadata |
| `sibling_metadata` | Array | Metadata from sibling entries in same playlist |

## ytdl-sub Variables

| Variable | Type | Description |
|----------|------|-------------|
| `download_index` | Integer | The i'th entry downloaded (from download archive) |
| `download_index_padded6` | String | Padded six digits |
| `upload_date_index` | Integer | i'th entry with this upload date |
| `ytdl_sub_input_url` | String | Input URL used for this entry |
| `ytdl_sub_input_url_count` | Integer | Total input URLs |
| `ytdl_sub_input_url_index` | Integer | Index of input URL |

## Scripting Functions

Functions use `%function_name(args)` inside curly braces. Always use `>-` YAML directive for multi-line definitions.

### String functions

- `%replace(string, old, new)` — replace substring
- `%lower(string)` — lowercase
- `%slice(string, start, end)` — substring
- `%concat(str1, str2, ...)` — concatenate
- `%regex_sub(pattern, replacement, string)` — regex substitution
- `%regex_capture_many(string, [patterns], [defaults])` — regex capture with fallbacks
- `%split(string, delimiter, max_splits)` — split string into array

### Array functions

- `%array_at(array, index)` — get element (-1 for last)
- `%array_apply(array, function)` — apply function to each element

### Map functions

- `%map_get(map, key, default)` — get value from map

### Logic functions

- `%if(condition, then_value, else_value)`
- `%elif(cond1, val1, cond2, val2, ..., default)`
- `%not(value)`, `%bool(value)`
- `%eq(a, b)`, `%lt(a, b)`, `%gt(a, b)`
- `%is_string(value)`, `%is_numeric(value)`, `%is_array(value)`
- `%contains_any(string, array)`, `%contains_all(string, array)`

### Error functions

- `%assert_then(condition, value, error_message)` — assert condition, return value or error
- `%throw(message)` — raise error
- `%print(message, value)` — print message, return value

## Custom Functions

Define in `overrides` with `%` prefix. Use `$0`, `$1`, etc. for arguments:

```yaml
overrides:
  "%get_entry_metadata_field": >-
    { %map_get(entry_metadata, $0, null) }
  artist: >-
    { get_entry_metadata_field("artist") }
```
