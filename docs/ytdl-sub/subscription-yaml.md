[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/config_reference/subscription_yaml.rst)
- .pdf

LightDarkSystem Settings

# Subscription File

## Contents

# Subscription File [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#subscription-file "Link to this heading")

A subscription file is designed to both define and organize many things to download in
condensed YAML.

Hint

Read the [getting started guide](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/index.html#getting-started)
first before reviewing this section.

## File Preset [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#file-preset "Link to this heading")

Many examples show `__preset__` at the top. This is known as the _subscription file_
_preset_. It is where a single [preset](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/first_config.html#custom-preset-definition) can be defined that gets applied to each subscription within the
file.

This is a good place to apply file-wide variables such as `tv_show_directory` or
supply a cookies file path.

```
__preset__:
  # Variables that override defaults from `overrides:` for presets in YAML keys:
  overrides:
    tv_show_directory: "/tv_shows"

  # Directly set plugin options:
  ytdl_options:
    cookiefile: "/config/ytdl-sub-configs/cookie.txt"
```

Copy to clipboard

## Layout [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#layout "Link to this heading")

A subscription file is comprised of YAML keys and values. Keys can be either

- a preset

- an override value

- a subscription name


Take the following example:

```
Jellyfin TV Show by Date:
  = News:
    "Breaking News": "https://www.youtube.com/@SomeBreakingNews"
    "BBC News": "https://www.youtube.com/@BBCNews"
```

Copy to clipboard

All three types of keys are used for the following:

- `Jellyfin TV Show by Date` \- a prebuilt preset

- `= News` \- an override value for genre

- `Breaking News`, `BBC News` \- The subscription names


The lowest level, most indented keys should always be the subscription name. It is good
practice to put subscription names in quotes to differentiate between preset names and
subscription names.

Values should always be the subscription itself. The simplest form is just the
URL. Further sections will show more exotic examples that go beyond a single URL.

## Inheritance [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#inheritance "Link to this heading")

A subscription inherits every key above it. In the above example, both `Breaking News`
and `BBC News` inherits the `Jellyfin TV Show by Date` preset and the `= News`
override value.

Note

There are no limits or boundaries on how one structures their presets. This
flexibility is intended for subscription authors to organize their downloads as they
see fit.

## Multi Keys [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#multi-keys "Link to this heading")

Subscription keys support pipe syntax, or `|`, which allows multiple keys to be
defined on a single line. The following is equivalent to the above example:

```
Jellyfin TV Show by Date | = News:
  "Breaking News": "https://www.youtube.com/@SomeBreakingNews"
  "BBC News": "https://www.youtube.com/@BBCNews"
```

Copy to clipboard

## Override Mode [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#override-mode "Link to this heading")

Often times, it is convenient to set multiple override values for a single
subscription. We can put a preset in _override mode_ by using tilda syntax, or `~`.

Suppose we want to apply the [Only Recent](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/helpers.html#only-recent)
preset to the above examples. But for `BBC News` specifically, we want to set the date
range to be different than the default `2months` value to `2weeks`.

We can change it as follows:

```
Jellyfin TV Show by Date
  = News | Only Recent:
    "Breaking News": "https://www.youtube.com/@SomeBreakingNews"
    "~BBC News":
      url: "https://www.youtube.com/@BBCNews"
      only_recent_date_range: "2weeks"
```

Copy to clipboard

Important

When using override mode, we need to set the `url` variable since we are no longer
using the simplified _subscription\_value_. For more info on how this works, read about
[subscription variables](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/static_variables.html#subscription-variables).

## Map Mode [\#](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html\#map-mode "Link to this heading")

Map mode is for highly advanced presets that benefit from a more complex subscription
definition. TODO: Show music video example here.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/config_reference/subscription_yaml.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/config_reference/subscription_yaml.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)