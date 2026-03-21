[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/faq/index.rst)
- .pdf

LightDarkSystem Settings

# FAQ

## Contents

# [FAQ](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id4)

Since ytdl-sub is relatively new to the public, there has not been many question asked
yet. We will update this as more questions get asked.

## [How do I…](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id5)

### […remove the date in the video title?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id6)

The [TV Show](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/tv_show.html#tv-show) presets by default include
the upload date in the `episode_title` override variable. This variable is used to set
the title in things like the video metadata, NFO file, etc, which is subsequently read
by media players. This can be overwritten as you see fit by redefining it:

```
overrides:
  episode_title: "{title}"  # Only sets the video title
```

Copy to clipboard

### […download age-restricted YouTube videos?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id7)

See [yt-dl’s recommended way](https://github.com/ytdl-org/youtube-dl#how-do-i-pass-cookies-to-youtube-dl) to
download your YouTube cookie, then add it to your [ytdl options](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#ytdl-options) section of your config:

```
ytdl_options:
  cookiefile: "/path/to/cookies/file.txt"
```

Copy to clipboard

### […automate my downloads?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id8)

[This page](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/automating_downloads.html) shows how to set up
`ytdl-sub` to run automatically on various platforms.

### […download large channels?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id9)

See the prebuilt preset [chunk\_initial\_download](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/helpers.html).

### […filter to include or exclude based on certain keywords?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id10)

See the prebuilt preset [Filter Keywords](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/helpers.html).

### […prevent creation of NFO file](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id11)

Creation of NFO files is done by the NFO tags plugin. It, as any other plugin, can be
disabled:

```
nfo_tags:
  enabled: False
```

Copy to clipboard

### […prevent download of images](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id12)

The [TV Show](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/tv_show.html#tv-show) presets by default
downloads images corresponding to show and each episode. This can be prevented by
overriding following variables:

```
overrides:
  tv_show_fanart_file_name: ""  # to stop creation of fanart.jpg in subscription
  tv_show_poster_file_name: ""  # to stop creation of poster.jpg in subscription
  thumbnail_name: ""            # to stop creation of episode thumbnails
```

Copy to clipboard

### […use only part of the media’s title](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id13)

ytdl-sub offers a range of functions that can be used to parse a subset of a title for
use in your media player. Consider the example:

- I want to remove “NOVA PBS - “ from the title `NOVA PBS - Hidden Cities All Around
Us`.


There are several solutions using ytdl-sub’s scripting capabilities to override
`episode_title` by manipulating the original media’s `title`.

Replace exclusion with empty string

```
"~Nova PBS":
  url: "https://www.youtube.com/@novapbs"
  episode_title: >-
    {
      %replace( title, "NOVA PBS - ", "" )
    }
```

Copy to clipboard

Split once using delimiter, grab last value in the split array.

```
"~Nova PBS":
  url: "https://www.youtube.com/@novapbs"
  episode_title: >-
    {
      %array_at( %split(title, " - ", 1), -1 )
    }
```

Copy to clipboard

Regex capture. Supports multiple capture strings and default values if captures
are unsuccessful.

```
"~Nova PBS":
  url: "https://www.youtube.com/@novapbs"
  captured_episode_title: >-
    {
      %regex_capture_many(
        title,
        [ "NOVA PBS - (.*)" ],
        [ title ]
      )
    }
  episode_title: >-
     { %array_at( captured_episode_title, 1 ) }
```

Copy to clipboard

There is no single solution to this problem - it will vary case-by-case. See our full
suite of [scripting functions](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/scripting_functions.html#scripting-functions) to create your own
clever scraping mechanisms.

### […force ytdl-sub to re-download a file](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id14)

Sometimes users may wish to replace a file already in the archive, for example, if the
current file is a lower resolution than desired, missing subtitles, corrupt, etc..

`ytdl-sub` decides what files have already been downloaded by entries in [the\\
download archive file](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#output-options),
`./.ytdl-sub-...-download-archive.json`, at the top of the subscription/series/show
[output directory](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#output-options) in the appropriate
`overrides: / ..._directory:` library path, _and_ the presence of the corresponding
downloaded files under the same path. To force `ytdl-sub` to re-download an entry both
need to be removed:

- Move aside the downloaded files:

Rename or move the downloaded files, including the associated files with the same
base/stem name, such as `./*.nfo`, `./*.info-json`, etc..

- Ensure `ytdl-sub` is not running and won’t run, such as by cron:

`ytdl-sub` loads the `./.ytdl-sub-...-download-archive.json` file early, keeps it
in memory, and writes it back out late. If it’s running or starts running while you’re
modifying that file, then your changes will be overwritten when it exits.

- Remove the `./.ytdl-sub-...-download-archive.json` JSON array item:

Search for the stem name, the basename without any extension or suffix, common to all
the downloaded files in this file and delete that whole entry, from the YouTube ID
string to the closing curly braces. Be ware of JSON traling commas.

- Run `$ ytdl-sub sub` again with the appropriate CLI plugin options:

In normal operation, [yt-dlp minimizes requests and the files considered for\\
download](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/index.html#minimize-the-work-to-only-what-s-necessary). To re-download, those options must be disabled or modified. Disable
[the ‘break\_on\_existing’ option](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#ytdl-options), set
[the ‘date\_range:’ plugin](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#date-range), and [limit\\
the subscriptions](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/downloading.html#preview) to
download only the files that you’ve renamed in the steps above.

Set the appropriate dates, [including a sufficient margin](https://ytdl-sub.readthedocs.io/en/latest/config_reference/plugins.html#date-range), and subscription name to include only the
files you’ve renamed, and re-run. For example, if you’ve renamed all the files from
2024 in the `NOVA PBS` subscription:


> ```
> ytdl-sub --match="NOVA PBS" sub -o "\
> --ytdl_options.break_on_existing False \
> --date_range.after 20240101 \
> --date_range.before 20250101 \
> "
> ```
>
> Copy to clipboard


### […download a file missing from the archive](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id15)

The root causes are unknown, but sometimes even after successful, complete runs, some
files will be missing from the archive. To attempt to download those missing files,
use [the same CLI options as re-downloading a file](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html#force-ytdl-sub-to-re-download-a-file)

### […get support?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id16)

See [the debugging documentation](https://ytdl-sub.readthedocs.io/en/latest/debugging.html).

### […reach out to contribute?](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id17)

If you would like to contribute, we’re happy to accept any help, including from
non-coders! To find out how you can help this project, you can:

- [Join our Discord](https://discord.gg/v8j9RAHb4k) and leave a comment in
#development with where you think you can assist or what skills you would like to
contribute.

- If you just want to fix one thing, you’re welcome to [submit a pull\\
request](https://github.com/jmbannon/ytdl-sub/compare) with information on what issue you’re resolving and it will be
reviewed as soon as possible.


## [There is a bug where…](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id18)

### […ytdl-sub is not downloading](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id19)

### […ytdl-sub is downloading at 360p or other lower quality](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id20)

### […ytdl-sub downloads 2-4 videos and then fails](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id21)

These are often just limits imposed by the external services that are not bugs. There
may be little that can be done about them, but see [the ‘\_throttle\_protection’\\
preset](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/helpers.html#throttle-protection) for more information.

### […date\_range is not downloading older videos after I changed the range](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id22)

Your preset most likely has `break_on_existing` set to True, which will stop
downloading additional metadata/videos if the video exists in your download archive. Set
the following in your config to skip downloading videos that exist instead of stopping
altogether.

```
ytdl_options:
  break_on_existing: False
```

Copy to clipboard

After you download your new date\_range duration, re-enable `break_on_existing` to
speed up successive downloads.

### […it is downloading non-English title and description metadata](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id23)

Most likely the video has a non-English language set to its ‘native’ language. You can
tell yt-dlp to explicitly download English metadata using.

```
ytdl_options:
  extractor_args:
    youtube:
      lang:
        - "en"
```

Copy to clipboard

### […Plex is not showing my TV shows correctly](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id24)

1. Set the following for your ytdl-sub library that has been added to Plex.


![The Plex library editor, under the advanced settings, showing the required options for Plex to show the TV shows correctly.](https://ytdl-sub.readthedocs.io/en/latest/_images/plex_scanner_agent.png)

- **Scanner:** Plex Series Scanner

- **Agent:** Personal Media shows

- **Visibility:** Exclude from home screen and global search

- **Episode sorting:** Library default

- **YES** Enable video preview thumbnails


2. Under **Settings** \> **Agents**, confirm Plex Personal Media Shows/Movies scanner has
**Local Media Assets** enabled.


![The Plex Agents settings page has Local Media Assets enabled for Personal Media Shows and Movies tabs.](https://ytdl-sub.readthedocs.io/en/latest/_images/plex_agent_sources.png)

### […ytdl-sub errors when downloading a 360p video with resolution assert](https://ytdl-sub.readthedocs.io/en/latest/faq/index.html\#id25)

[See how to either ignore this specific video or disable resolution assertion entirely here.](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/helpers.html#resolution-assert-handling)

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/faq/)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/faq/)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)