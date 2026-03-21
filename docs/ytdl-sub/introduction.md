[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/introduction.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/introduction.rst)
- .pdf

LightDarkSystem Settings

# What is ytdl-sub?

## Contents

# What is ytdl-sub?

`ytdl-sub` is a command-line tool that builds on and orchestrates [yt-dlp](https://github.com/yt-dlp/yt-dlp) to
download media from YouTube and/or other online services. It provides a declarative,
expressive YAML configuration system that allows you to describe which media to download
and how it should appear in your media library servers and applications such as
[Jellyfin](https://github.com/jellyfin/jellyfin), [Plex](https://github.com/plexinc/pms-docker), [Emby](https://github.com/plexinc/pms-docker), [Kodi](https://github.com/xbmc/xbmc), modern music players, etc..

To these ends, `ytdl-sub`:

- wraps and runs [yt-dlp](https://github.com/yt-dlp/yt-dlp), per your configuration to:

  - download the media, remux and/or optionally transcode it
- prepares additional metadata both embedded and in external files

- renames the resulting files

- places them in your library


![The Jellyfin web interface, showing the thumbnails of various YouTube shows.](https://user-images.githubusercontent.com/10107080/182677243-b4184e51-9780-4094-bd40-ea4ff58555d0.PNG)

Youtube channels as TV shows in Jellyfin

![The Jellyfin web interace, showing the thumbnails of various music videos starring the Red Hot Chili Peppers](https://user-images.githubusercontent.com/10107080/182677256-43aeb029-0c3f-4648-9fd2-352b9666b262.PNG)

Music videos and concerts in Jellyfin

![The Kodi app interface, showing a list of artists available to watch under the "Music videos" heading](https://user-images.githubusercontent.com/10107080/182677268-d1bf2ff0-9b9c-4a04-98ec-443a67ada734.png)

Music videos and concerts in Kodi

![The MusicBee app interface, showing a list of album artists and the thumbnails of all downloaded songs produced by the currently selected artist](https://user-images.githubusercontent.com/10107080/182685415-06adf477-3dd3-475d-bbcd-53b0152b9f0a.PNG)

SoundCloud albums and singles in MusicBee

## Motivation

[yt-dlp](https://github.com/yt-dlp/yt-dlp) has grown into a well maintained, central repository of the intricate,
inscrutable, and extensive technical knowledge required to automate downloading media
from online services. When those services change their APIs or otherwise change
behavior, [yt-dlp](https://github.com/yt-dlp/yt-dlp) is the central, low-level tool to update. It does a best-in-class
job at that task, and it does that job more effectively by narrowing focus to just that.
As much knowledge as it encapsulates and as well as it does that, it still requires a
great deal of additional knowledge to make its output accessible to end-users. Mostly
this gap is about extracting and formatting metadata and correctly placing the resulting
output files in a media library.

A number of tools, applications, and other projects have grown up around that central
[yt-dlp](https://github.com/yt-dlp/yt-dlp) pillar to fill in those gaps, and this project was one of the early
entrants. Many are [full-featured services that provide web UIs](https://github.com/kieraneglin/pinchflat) including some that
[provide media player web UIs](https://www.tubearchivist.com/). Most of those other projects necessarily narrow their
scope to provide a more polished and integrated user experience.

Similarly, `ytdl-sub` can run automatically to accomplish the same goals, but aims to
serve users that need lower-level control and/or have use cases not covered by the more
narrow scope of those other projects. To some degree, this makes this project
intrinsically less user friendly and requires more technical experience or learning.

Want something that “Just Works”, try one of the other projects; we recommend
[Pinchflat](https://github.com/kieraneglin/pinchflat) as the next step towards that end. Want to download from more than just
YouTube? Don’t like the other restrictions inherent in the goals of those other
projects? Have unique use cases? Then dig in, learn, and we hope `ytdl-sub` gives you
enough rope and [a foot-gun](https://en.wiktionary.org/wiki/footgun) to get you there.

## Why download instead of stream?

Most of the tools in this [yt-dlp](https://github.com/yt-dlp/yt-dlp) ecosystem serve a similar set of larger, more
general use cases, and so does `ytdl-sub`:

- Don’t rely on profit-driven corporate persons to keep more obscure content available.

- Even if they do, don’t depend on them to make it possible to use it in different ways.

- Even when you pay, don’t count on them not inserting ads later.

- Regardless, don’t depend on them to curate content for yourself and/or your family.

- Free yourself and/or your family from what the algorithm would feed them next.


Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/introduction.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/introduction.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)