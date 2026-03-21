[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/common.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/config_reference/prebuilt_presets/common.rst)
- .pdf

LightDarkSystem Settings

# Common

## Contents

# Common

## Filter Keywords

```
presets:

  #############################################################################
  # Include Keywords
  #   Include or exclude media with any of the listed keywords in their titles
  #   Keywords will check a lower-cased title or description
  Filter Keywords:
    overrides:
      # default filter lists to be empty
      title_include_keywords: "{ [] }"
      title_exclude_keywords: "{ [] }"
      description_include_keywords: "{ [] }"
      description_exclude_keywords: "{ [] }"

      title_include_eval: "ANY"
      title_exclude_eval: "ANY"
      description_include_eval: "ANY"
      description_exclude_eval: "ANY"

      "%ensure_string": >-
        {
          %assert_then(
            %is_string($0),
            %lower($0),
            "filter keywords must be strings"
          )
        }
      "%ensure_lower_array": >-
        {
          %assert_then(
            %is_array($0),
            %array_apply(
              $0,
              %ensure_string
            ),
            %concat($1," must be an array")
          )
        }

      # $0 - var to evaluate
      # $1 - keyword list
      # $2 - eval type
      "%contains_keywords_inner": >-
        {
          %elif(
            %eq(%ensure_string($2), 'any'),
            %contains_any( $0, $1 ),
            %eq(%ensure_string($2), 'all'),
            %contains_all( $0, $1 ),
            %throw('Keyword eval must be either ANY or ALL')
          )
        }

      # $0 - var to evaluate
      # $1 - keyword list
      # $2 - variable name for error messages
      # $3 - keyword eval
      # $4 - default return if keyword list is empty
      "%contains_keywords": >-
        {
          %if(
            %bool( $1 ),
            %contains_keywords_inner( %lower($0), %ensure_lower_array($1, $2), $3 ),
            $4
          )
        }

    filter_exclude:
        - "{ %not( %contains_keywords(title, title_include_keywords, 'title_include_keywords', title_include_eval, true) ) }"
        - "{ %not( %contains_keywords(description, description_include_keywords, 'description_include_keywords', description_include_eval, true) ) }"
        - "{ %contains_keywords(title, title_exclude_keywords, 'title_exclude_keywords', title_exclude_eval, false) }"
        - "{ %contains_keywords(description, description_exclude_keywords, 'description_exclude_keywords', description_exclude_eval, false) }"
```

Copy to clipboard

## Filter Duration

```
presets:

  #############################################################################
  # Filter Duration
  #   Include or exclude media based on its play time duration
  Filter Duration:
    overrides:
      filter_duration_min_s: 0
      filter_duration_max_s: 4294967296

      "%filter_duration_ensure_numeric": >-
        {
          %assert_then(
            %is_numeric($0),
            $0,
            "filter_duration args must be numeric"
          )
        }

      filter_duration_zero_msg: "Duration metadata for {title} is missing, cannot perform filter."

      "%filter_duration_eval": >-
        {
          %if(
            %eq(duration, 0),
            %print(filter_duration_zero_msg, False)
            $0
          )
        }

    filter_exclude:
        - "{ %filter_duration_eval( %lt(duration, %filter_duration_ensure_numeric(filter_duration_min_s)) ) }"
        - "{ %filter_duration_eval( %gt(duration, %filter_duration_ensure_numeric(filter_duration_max_s)) ) }"
```

Copy to clipboard

## Media Quality

```
presets:

  #############################################################################
  # Best Video Quality
  #   Gets the best available quality

  best_video_quality:
    format: "bestvideo+bestaudio/best"
    ytdl_options:
      merge_output_format: "mp4"

  "Best Video Quality":
    preset:
      - best_video_quality

  "Max Video Quality":
    preset:
      - best_video_quality

  #############################################################################
  # Max 2160p

  "Max 2160p":
    format: "(bv*[height<=2160]+bestaudio/best[height<=2160])"
    ytdl_options:
      merge_output_format: "mp4"

  #############################################################################
  # Max 1440p

  "Max 1440p":
    format: "(bv*[height<=1440]+bestaudio/best[height<=1440])"
    ytdl_options:
      merge_output_format: "mp4"

  #############################################################################
  # Max 1080p

  max_1080p:  # legacy name
    format: "(bv*[height<=1080]+bestaudio/best[height<=1080])"
    ytdl_options:
      merge_output_format: "mp4"

  "Max 1080p":
    preset:
      - max_1080p

  #############################################################################
  # Max 720p

  "Max 720p":
    format: "(bv*[height<=720]+bestaudio/best[height<=720])"
    ytdl_options:
      merge_output_format: "mp4"

  #############################################################################
  # Max 480p

  "Max 480p":
    format: "(bv*[height<=480]+bestaudio/best[height<=480])"
    ytdl_options:
      merge_output_format: "mp4"

  #############################################################################
  # Audio Quality Presets

  "Max Audio Quality":
    audio_extract:
      codec: "best"
      quality: 0

  "Max MP3 Quality":
    audio_extract:
      codec: "mp3"
      quality: 0

  "Max Opus Quality":
    audio_extract:
      codec: "opus"
      quality: 0

  "MP3 320k":
    audio_extract:
      codec: "mp3"
      quality: 320

  "MP3 128k":
    audio_extract:
      codec: "mp3"
      quality: 128
```

Copy to clipboard

## Only Recent Videos

```
presets:

  #############################################################################
  # Only Recent Archive
  #   Downloads only `date_range` amount of videos (no deletion)

  "Only Recent Archive":
    # Only fetch videos after today minus date_range
    date_range:
      after: "today-{only_recent_date_range}"

    # Set the default date_range to 2 months
    overrides:
      only_recent_date_range: "2months"

  #############################################################################
  # Only Recent
  #   Downloads only `date_range` amount of videos and deletes older videos
  #   that fall out of that range

  "Only Recent":
    preset:
      - "Only Recent Archive"

    output_options:
      keep_files_after: "today-{only_recent_date_range}"
      keep_max_files: "{only_recent_max_files}"

    overrides:
      only_recent_max_files: 0

  #############################################################################
  # Download in Chunks
  #   Will only download 20 videos per invocation of ytdl-sub, starting
  #   at the very beginning of the channel

  chunk_initial_download:  # legacy preset name
    ytdl_options:
      max_downloads: "{chunk_max_downloads}"
      playlistreverse: True
      break_on_existing: False
    overrides:
      chunk_max_downloads: 20

  "Chunk Downloads":
    preset:
      - chunk_initial_download
```

Copy to clipboard

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/common.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/config_reference/prebuilt_presets/common.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)