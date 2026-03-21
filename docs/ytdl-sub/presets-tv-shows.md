[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/tv_shows.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/prebuilt_presets/tv_shows.rst)
- .pdf

LightDarkSystem Settings

# TV Show Presets

## Contents

# TV Show Presets

## Player-Specific Presets

`ytdl-sub` provides player-specific versions of certain presets, which apply settings
to optimize the downloads for that player.

The following actions are taken based on the indicated player:

### Kodi

- Everything that the Jellyfin version does

- Enables `kodi_safe` NFOs, replacing 4-byte unicode characters that break kodi with
`□`


### Jellyfin

- Places any season-specific poster art in the main show folder

- Generates NFO tags


### Emby

- Places any season-specific poster art in the main show folder

- Generates NFO tags

  - For named seasons, creates a `season.nfo` file per season

### Plex

- [Special sanitization](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/entry_variables.html#title-sanitized-plex) of numbers so Plex
doesn’t recognize numbers that are part of the title as the episode number

- Converts all downloaded videos to the mp4 format

- Places any season-specific poster art into the season folder


* * *

## TV Show by Date

TV Show by Date will organize something like a YouTube channel or playlist into a tv
show, where seasons and episodes are organized using upload date.

### Example

Must define `tv_show_directory`. Available presets:

- `Kodi TV Show by Date`

- `Jellyfin TV Show by Date`

- `Emby TV Show by Date`

- `Plex TV Show by Date`


```
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"

Plex TV Show by Date:

  # Sets genre tag to "Documentaries"
  = Documentaries:
    "NOVA PBS": "https://www.youtube.com/@novapbs"
    "National Geographic": "https://www.youtube.com/@NatGeo"
    "Cosmos - What If": "https://www.youtube.com/playlist?list=PLZdXRHYAVxTJno6oFF9nLGuwXNGYHmE8U"

  # Sets genre tag to "Kids", "TV-Y" for content rating
  = Kids | = TV-Y:
    "Jake Trains": "https://www.youtube.com/@JakeTrains"
    "Kids Toys Play": "https://www.youtube.com/@KidsToysPlayChannel"

  = Music:
    # TV show subscriptions can support multiple urls and store in the same TV Show
    "Rick Beato":
      - "https://www.youtube.com/@RickBeato"
      - "https://www.youtube.com/@rickbeato240"
```

Copy to clipboard

### Advanced Usage

If you prefer a different season/episode organization method, you can set the following
override variables.

```
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"
    tv_show_by_date_season_ordering: "upload-year-month"
    tv_show_by_date_episode_ordering: "upload-day"
```

Copy to clipboard

Or for a specific preset

```
"~Kids Toys Play":
   url: "https://www.youtube.com/@KidsToysPlayChannel"
   tv_show_by_date_season_ordering: "upload-year-month"
   tv_show_by_date_episode_ordering: "upload-day"
```

Copy to clipboard

The following are supported. Be sure the combined season + episode ordering include the
year, month, day, i.e. upload-year + upload-month-day.

#### Season Ordering

`tv_show_by_date_season_ordering` supports one of the following:

- `upload-year` (default)

- `upload-year-month`

- `release-year`

- `release-year-month`


#### Episode Ordering

`tv_show_by_date_episode_ordering` supports one of the following:

- `upload-month-day` (default)

- `upload-month-day-reversed`

  - Reversed means more recent episodes appear at the top of a season by having a lower
    value.
- `upload-day`

- `release-day`

- `release-month-day`

- `release-month-day-reversed`

- `download-index`

  - Episodes are numbered by the download order. **NOTE**: this is fetched using the
    length of the download archive. Do not use if you intend to remove old videos.

TV Show by Date presets use the following for defaults:

```
tv_show_by_date_season_ordering: "upload-year"
tv_show_by_date_episode_ordering: "upload-month-day"
```

Copy to clipboard

## TV Show Collection

TV Show Collections set each URL as its own season. If a video belongs to multiple URLs
(i.e. a channel and a channel’s playlist), the video will only download once and reside
in the higher-numbered season.

Two main use cases of a collection are:

1. Organize a YouTube channel TV show where Season 1 contains any video not in a
‘season playlist’, Season 2 for ‘Playlist A’, Season 3 for ‘Playlist B’, etc.

2. Organize one or more YouTube channels/playlists, where each season represents a
separate channel/playlist.


Today, ytdl-supports up to 40 seasons with 11 URLs per season.

### Example

Must define `tv_show_directory`. Available presets:

- `Kodi TV Show Collection`

- `Jellyfin TV Show Collection`

- `Emby TV Show Collection`

- `Plex TV Show Collection`


```
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"

Plex TV Show Collection:
  = Music:
    # Prefix with ~ to set specific override variables
    "~Beyond the Guitar":
      s01_name: "Videos"
      s01_url: "https://www.youtube.com/c/BeyondTheGuitar"
      s02_name: "Covers"
      s02_url: "https://www.youtube.com/playlist?list=PLE62gWlWZk5NWVAVuf0Lm9jdv_-_KXs0W"
```

Copy to clipboard

Other notable features include:

- TV show poster info is pulled from the first URL in s01.

- Duplicate videos in different URLs (channel /videos vs playlist) will not download twice.

  - The video will attributed to the season with the highest number.
- Individual seasons support both single and multi URL.

- s00 is supported for specials.


```
"~Beyond the Guitar":
  s00_name: "Specials"
  s00_url:
    - "https://www.youtube.com/watch?v=vXzguOdulAI"
    - "https://www.youtube.com/watch?v=IGwYDvaGAz0"
  s01_name: "Videos"
  s01_url:
    - "https://www.youtube.com/c/BeyondTheGuitar"
    - "https://www.youtube.com/@BeyondTheGuitarAcademy"
  s02_name: "Covers"
  s02_url: "https://www.youtube.com/playlist?list=PLE62gWlWZk5NWVAVuf0Lm9jdv_-_KXs0W"
```

Copy to clipboard

### Advanced Usage

If you prefer a different episode organization method, you can set the following
override variables.

```
__preset__:
  overrides:
    tv_show_directory: "/tv_shows"
    tv_show_collection_episode_ordering: "release-year-month-day"
```

Copy to clipboard

Or for a specific preset

```
"~Beyond the Guitar":
  tv_show_collection_episode_ordering: "release-year-month-day"
  s01_name: "Videos"
  s01_url: "https://www.youtube.com/c/BeyondTheGuitar"
  s02_name: "Covers"
  s02_url: "https://www.youtube.com/playlist?list=PLE62gWlWZk5NWVAVuf0Lm9jdv_-_KXs0W"
```

Copy to clipboard

The following are supported.

#### Episode Ordering

`tv_show_collection_episode_ordering` supports one of the following:

- `upload-year-month-day` (default)

- `upload-year-month-day-reversed`

- `release-year-month-day`

- `release-year-month-day-reversed`

- `playlist-index`

  - Only use `playlist-index` episode formatting for playlists that will be fully
    downloaded once and never again. Otherwise, indices can change.
- `playlist-index-reversed`


TV Show Collection presets use upload-year-month-day as the default.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/prebuilt_presets/tv_shows.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/prebuilt_presets/tv_shows.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)