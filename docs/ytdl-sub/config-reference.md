[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/config_reference/config_yaml.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/config_reference/config_yaml.rst)
- .pdf

LightDarkSystem Settings

# Configuration File

## Contents

# Configuration File

ytdl-sub is configured using a `config.yaml` file.

The `config.yaml` is made up of two sections:

```
configuration:
presets:
```

Copy to clipboard

Note for Windows users, paths can be represented with `C:/forward/slashes/like/linux`.
If you prefer to use a Windows backslash, note that it must have
`C:\\double\\bashslash\\paths` in order to escape the backslash character. This is due
to it being a YAML escape character.

```
configuration:
  dl_aliases:
    mv: "--preset music_video"
    u: "--download.url"

  experimental:
    enable_update_with_info_json: True

  ffmpeg_path: "/usr/bin/ffmpeg"
  ffprobe_path: "/usr/bin/ffprobe"

  file_name_max_bytes: 255
  lock_directory: "/tmp"

  persist_logs:
    keep_successful_logs: True
    logs_directory: "/var/log/ytdl-sub-logs"

  umask: "022"
  working_directory: ".ytdl-sub-working-directory"
```

Copy to clipboard

## dl\_aliases

Alias definitions to shorten [dl arguments](https://ytdl-sub.readthedocs.io/en/latest/usage.html#download-options). For example,

```
configuration:
  dl_aliases:
    mv: "--preset music_video"
    u: "--download.url"
```

Copy to clipboard

Simplifies

```
ytdl-sub dl --preset "Jellyfin Music Videos" --download.url "youtube.com/watch?v=a1b2c3"
```

Copy to clipboard

to

```
ytdl-sub dl --mv --u "youtube.com/watch?v=a1b2c3"
```

Copy to clipboard

## experimental

Experimental flags reside under the `experimental` key.

`enable_update_with_info_json`

Enables modifying subscription files using info.json files using the argument
`--update-with-info-json`. This feature is still being tested and has the ability to
destroy files. Ensure you have a full backup before usage. You have been warned!

## ffmpeg\_path

Path to ffmpeg executable. Defaults to `/usr/bin/ffmpeg` for Linux,
`./ffmpeg.exe` in the same directory as ytdl-sub for Windows.

## ffprobe\_path

Path to ffprobe executable. Defaults to `/usr/bin/ffprobe` for Linux,
`./ffprobe.exe` in the same directory as ytdl-sub for Windows.

## file\_name\_max\_bytes

Max file name size in bytes. Most OS’s typically default to 255 bytes.

## lock\_directory

The directory to temporarily store file locks, which prevents multiple instances
of `ytdl-sub` from running. Note that file locks do not work on
network-mounted directories. Ensure that this directory resides on the host
machine. Defaults to `/tmp`.

## persist\_logs

By default, no logs are persisted. Specifying this key will enable persisted logs. The following
options are available.

`keep_successful_logs`

Defaults to `True`. When this key is `False`, only write log files for failed
subscriptions.

`logs_directory`

Required field. Write log files to this directory with names like
`YYYY-mm-dd-HHMMSS.subscription_name.(success|error).log`.

## umask

Umask in octal format to apply to every created file. Defaults to `022`.

## working\_directory

The directory to temporarily store downloaded files before moving them into their final
directory. Defaults to `.ytdl-sub-working-directory`, created in the same directory
that ytdl-sub is invoked from.

# Presets

Custom presets are defined in this section. Refer to the
[Getting Started Guide](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/first_config.html#basic-configuration)
on how to configure.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/config_reference/config_yaml.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/config_reference/config_yaml.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)