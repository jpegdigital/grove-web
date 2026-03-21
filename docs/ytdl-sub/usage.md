[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/usage.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/usage.rst)
- .pdf

LightDarkSystem Settings

# Usage

## Contents

# Usage

```
ytdl-sub [GENERAL OPTIONS] {sub,dl,view} [COMMAND OPTIONS]
```

Copy to clipboard

For Windows users, it would be `ytdl-sub.exe`

## General Options

CLI options common to all sub-commands. Must be specified before the sub-command, for
example `$ ytdl-sub --dry-run sub ...`:

```
-h, --help            show this help message and exit
-v, --version         show program's version number and exit
-c CONFIGPATH, --config CONFIGPATH
                      path to the config yaml, uses config.yaml if not provided
-d, --dry-run         preview what a download would output, does not perform any video downloads or writes to output directories
-l quiet|info|verbose|debug, --log-level quiet|info|verbose|debug
                      level of logs to print to console, defaults to verbose
-t TRANSACTIONPATH, --transaction-log TRANSACTIONPATH
                      path to store the transaction log output of all files added, modified, deleted
-st, --suppress-transaction-log
                      do not output transaction logs to console or file
-nc, --suppress-colors
                      do not use colors in ytdl-sub output
-m MATCH [MATCH ...], --match MATCH [MATCH ...]
                      match subscription names to one or more substrings, and only run those subscriptions
```

Copy to clipboard

## Subscriptions Options

Download all subscriptions specified in each [subscriptions file](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/subscriptions.html).

```
ytdl-sub [GENERAL OPTIONS] sub [SUBPATH ...]
```

Copy to clipboard

`SUBPATH` is one or more paths to subscription files and defaults to
`./subscriptions.yaml` if none are given. It will use the config specified by
`--config`, or `./config.yaml`, if not provided.

Additional Options

```
-u, --update-with-info-json
                      update all subscriptions with the current config using info.json files
-o DL_OVERRIDE, --dl-override DL_OVERRIDE
                      override all subscription config values using `dl` syntax, i.e. --dl-override='--ytdl_options.max_downloads 3'
```

Copy to clipboard

## Download Options

Download a single subscription in the form of CLI arguments instead of from [a\\
subscriptions file](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/subscriptions.html):

```
ytdl-sub [GENERAL OPTIONS] dl [SUBSCRIPTION ARGUMENTS]
```

Copy to clipboard

`SUBSCRIPTION ARGUMENTS` are the same as YAML arguments, but use periods (`.`)
instead of indents. For example, you can represent this subscription:

```
rick_a:
  preset:
    - "tv_show"
  overrides:
    tv_show_name: "Rick A"
    url: "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"
```

Copy to clipboard

Using the command:

```
ytdl-sub dl \
    --preset "tv_show" \
    --overrides.tv_show_name "Rick A" \
    --overrides.url: "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw"
```

Copy to clipboard

See how to shorten commands using [download aliases](https://ytdl-sub.readthedocs.io/en/latest/config_reference/config_yaml.html#dl-aliases).

## View Options

Preview the source variables for a given URL. Helpful to create new subscriptions:

```
ytdl-sub view [-sc] [URL]
```

Copy to clipboard

Additional Options

```
-sc, --split-chapters
                      View source variables after splitting by chapters
```

Copy to clipboard

## CLI to SUB Options

Convert yt-dlp cli arguments to ytdl-sub ytdl\_options arguments.

```
ytdl-sub cli-to-sub [YT-DLP ARGS]
```

Copy to clipboard

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/usage.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/usage.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)