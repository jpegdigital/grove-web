[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/deprecation_notices.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/deprecation_notices.rst)
- .pdf

LightDarkSystem Settings

# Deprecation Notices

## Contents

# Deprecation Notices

## Dec 2025

Override variables names can no longer be plugin names, to avoid the common pitfall of
defining a plugin underneath `overrides`.

In the past, there was usage of a `date_range` override variable in a few example configs
that complimented the `Only Recent` preset. This overrride variable usage needs to be
replaced with `only_recent_date_range`.

## Sep 2024

### regex plugin

Regex plugin has been removed in favor of scripting. The function
[regex\_capture\_many](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/scripting_functions.html#regex-capture-many) has been
created to replicate the plugin’s behavior. See the following converted example:

regex plugin

```
  regex:
    from:
      title:
        match:
          - ".*? - (.*)"  # Captures 'Some - Song' from 'Emily Hopkins - Some - Song'
        capture_group_names:
          - "captured_track_title"
        capture_group_defaults:
          - "{title}"
  overrides:
    track_title: "{captured_track_title}"
```

Copy to clipboard

scripting

```
  overrides:
    # Captures 'Some - Song' from 'Emily Hopkins - Some - Song'
    captured_track_title: >-
      {
        %regex_capture_many(
          title,
          [ ".*? - (.*)" ],
          [ title ]
        )
      }
    track_title: "{%array_at(captured_track_title, 1)}"
```

Copy to clipboard

## Oct 2023

### subscription preset and value

The use of `__value__` will go away in Dec 2023 in favor of the method found in
[Subscription File](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html#subscription-file). `__preset__` will still
be supported for the time being.

## July 2023

### music\_tags

Music tags are getting simplified. `tags` will now reside directly under music\_tags,
and `embed_thumbnail` is getting moved to its own plugin (supports video files as
well). Convert from:

```
my_example_preset:
  music_tags:
    embed_thumbnail: True
    tags:
      artist: "Elvis Presley"
```

Copy to clipboard

To the following:

```
my_example_preset:
  embed_thumbnail: True
  music_tags:
    artist: "Elvis Presley"
```

Copy to clipboard

The old format will be removed in October 2023.

### video\_tags

Video tags are getting simplified as well. `tags` will now reside directly under
video\_tags. Convert from:

```
my_example_preset:
  video_tags:
    tags:
      title: "Elvis Presley Documentary"
```

Copy to clipboard

To the following:

```
my_example_preset:
  video_tags:
    title: "Elvis Presley Documentary"
```

Copy to clipboard

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/deprecation_notices.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/deprecation_notices.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)