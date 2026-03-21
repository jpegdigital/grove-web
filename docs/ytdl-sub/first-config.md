[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/first_config.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/guides/getting_started/first_config.rst)
- .pdf

LightDarkSystem Settings

# Basic Configuration

## Contents

# Basic Configuration

A configuration file serves two purposes:

1. Set application-level functionality that is not specifiable in a subscription file.


> Note
>
> ytdl-sub does not require a configuration file. However,
> certain application settings may be desirable for tweak, such as setting
> `working_directory` to make ytdl-sub perform the initial download
> to an SSD drive.

2. Create custom presets.


> Note
>
> In the prior Initial Subscription examples, we leveraged the prebuilt preset
> `Jellyfin TV Show by Date`. This preset is entirely built using the same
> YAML configuration system offered to users by using a configuration file.

The following section attempts to demystify and explain how to…

- Set an application setting

- Know whether or not custom presets are actually needed

- How to create a custom preset

- How to use a custom preset on subscriptions


* * *

how this works, and show-case how

```
 1configuration:
 2  working_directory: ".ytdl-sub-working-directory"
 3
 4presets:
 5  TV Show:
 6    preset:
 7      - "Jellyfin TV Show by Date"
 8      - "Max 1080p"
 9
10    embed_thumbnail: True
11
12    throttle_protection:
13       sleep_per_download_s:
14         min: 2.2
15         max: 10.8
16       sleep_per_subscription_s:
17         min: 9.0
18         max: 14.1
19       max_downloads_per_subscription:
20         min: 10
21         max: 36
22
23    overrides:
24      tv_show_directory: "/tv_shows"
25
26  TV Show Only Recent:
27    preset:
28      - "TV Show"
29      - "Only Recent"
```

Copy to clipboard

## Configuration Section

The [configuration](https://ytdl-sub.readthedocs.io/en/latest/config_reference/config_yaml.html#configuration-file) section sets
options for ytdl-sub execution. Most users should set the path where `ytdl-sub`
temporarily stores downloaded data before assembling it and moving it into your
library. To avoid unnecessarily long large file renames, use a path on the same
filesystem as your library in the `overrides: / *_directory:` paths:

```
1configuration:
2  working_directory: ".ytdl-sub-working-directory"
```

Copy to clipboard

## Preset Section

Underneath `presets`, we define two custom presets with the names `TV Show` and `TV
Show Only Recent`.

```
presets:
  TV Show:
    ...
  TV Show Only Recent:
    ...
```

Copy to clipboard

The indentation example above shows how to define multiple presets.

## Custom Preset Definition

Before we break down the above `TV Show` preset, lets first outline a preset layout:

```
Preset Name:
  preset:
    ...

  plugin(s):
    ...

  overrides:
    ...
```

Copy to clipboard

Presets can contain three important things:

1. `preset` section, which can inherit [prebuilt presets](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/index.html#prebuilt-preset-reference) or other presets
defined in your config.

2. [Plugin definitions](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#plugins)

3. [overrides](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#overrides), which can override inherited
preset variables


Presets do not have to define all of these, as we’ll see in the `TV Show Only Recent`
preset.

### Inheriting Presets

```
5  TV Show:
6    preset:
7      - "Jellyfin TV Show by Date"
8      - "Max 1080p"
```

Copy to clipboard

The following snippet shows that the `TV Show` preset will inherit all properties of
the prebuilt presets `Jellyfin TV Show by Date` and `Max 1080p` in that order.

Order matters for preset inheritance. Bottom-most presets will override ones above them.

It is highly advisable to use [prebuilt presets](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/index.html#prebuilt-preset-reference) as a starting point
for custom preset building, as they do the work of preset building to ensure things show
as expected in their respective media players. Read on to see how to override prebuilt
preset specifics such as title.

### Defining Plugins

```
10    embed_thumbnail: True
11
12    throttle_protection:
13       sleep_per_download_s:
14         min: 2.2
15         max: 10.8
16       sleep_per_subscription_s:
17         min: 9.0
18         max: 14.1
19       max_downloads_per_subscription:
20         min: 10
21         max: 36
```

Copy to clipboard

Our `TV Show` sets two plugins, [throttle\_protection](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#throttle-protection) and [embed\_thumbnail](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#embed-thumbnail). Each plugin’s documentation shows the
respective fields that they support.

If an inherited preset defines the same plugin, the custom preset will use
‘merge-and-append’ strategy to combine their definitions. What this means is:

1. If the field is a map (i.e. has sub-params like `sleep_per_download_s` above) or
array, it will try to merge them

2. If both the inherited preset and custom preset set the same exact field and value
(i.e. `embed_thumbnail`) the custom preset will overwrite it


### Setting Override Variables

```
23    overrides:
24      tv_show_directory: "/ytdl_sub_tv_shows"
```

Copy to clipboard

All override variables reside underneath the [overrides](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#overrides) section.

It is important to remember that individual subscriptions can override specific override
variables. When defining variables in a preset, it is best practice to define them with
the intention that

1. All subscriptions will use its value them

2. Use them as placeholders to perform other logic, then have subscriptions or child
presets define their specific value


For simplicity, we’ll focus on (1) for now. The above snippet sets the
`tv_show_directory` variable to a file path. This variable name is specific to the
prebuilt TV show presets.

See the [prebuilt preset reference](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/index.html#prebuilt-preset-reference) to see all
available variables that are overridable.

## Using Custom Presets in Subscriptions

Subscription files can use custom presets just like any other prebuilt preset. Below
shows a complete subscription file using the above two custom presets.

```
TV Show:
  = Documentaries:
    "NOVA PBS": "https://www.youtube.com/@novapbs"

  = Kids | = TV-Y:
    "Jake Trains": "https://www.youtube.com/@JakeTrains"

TV Show Only Recent:
  = News:
    "BBC News": "https://www.youtube.com/@BBCNews"
```

Copy to clipboard

Notice how we do not need to define `tv_show_directory` in the `__preset__` section
like in prior examples. This is because our custom presets do the work of defining it.

## Reference Custom Config in the CLI

Be sure to tell ytdl-sub to use your config by using the argument `--config
/path/to/config.yaml`.

If you run ytdl-sub in the same directory, and the config file is named `config.yaml`,
it will use it by default.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/first_config.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/guides/getting_started/first_config.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)