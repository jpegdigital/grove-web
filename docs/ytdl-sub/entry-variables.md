[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/entry_variables.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/config_reference/scripting/entry_variables.rst)
- .pdf

LightDarkSystem Settings

# Entry Variables

## Contents

# Entry Variables

## Entry Variables

### channel

type:

`String`

description:

The channel name if it exists, otherwise returns the uploader.

### channel\_id

type:

`String`

description:

The channel id if it exists, otherwise returns the entry uploader ID.

### chapters

type:

`Array`

description:

Chapters if they exist

### comments

type:

`Array`

description:

Comments if they are requested

### creator

type:

`String`

description:

The creator name if it exists, otherwise returns the channel.

### description

type:

`String`

description:

The description if it exists. Otherwise, returns an emtpy string.

### duration

type:

`Integer`

description:

The duration of the entry in seconds if it exists. Defaults to zero otherwise.

### epoch

type:

`Integer`

description:

The unix epoch of when the metadata was scraped by yt-dlp.

### epoch\_date

type:

`String`

description:

The epoch’s date, in YYYYMMDD format.

### epoch\_hour

type:

`String`

description:

The epoch’s hour

### ext

type:

`String`

description:

The downloaded entry’s file extension

### extractor

type:

`String`

description:

The yt-dlp extractor name

### extractor\_key

type:

`String`

description:

The yt-dlp extractor key

### height

type:

`Integer`

description:

Height in pixels of the video. If this value is unavailable (i.e. audio download), it
will default to 0.

### ie\_key

type:

`String`

description:

The ie\_key, used in legacy yt-dlp things as the ‘info-extractor key’.
If it does not exist, return `extractor_key`

### info\_json\_ext

type:

`String`

description:

The “info.json” extension

### requested\_subtitles

type:

`Map`

description:

Subtitles if they are requested and exist

### sponsorblock\_chapters

type:

`Array`

description:

Sponsorblock Chapters if they are requested and exist

### thumbnail\_ext

type:

`String`

description:

The download entry’s thumbnail extension. Will always return ‘jpg’. Until there is a
need to support other image types, we always convert to jpg.

### title

type:

`String`

description:

The title of the entry. If a title does not exist, returns its unique ID.

### title\_sanitized\_plex

type:

`String`

description:

The sanitized title with additional sanitizing for Plex. It replaces numbers with
fixed-width numbers so Plex does not recognize them as season or episode numbers.

### uid

type:

`String`

description:

The entry’s unique ID

### uid\_sanitized\_plex

type:

`String`

description:

The sanitized uid with additional sanitizing for Plex. Replaces numbers with
fixed-width numbers so Plex does not recognize them as season or episode numbers.

### uploader

type:

`String`

description:

The uploader if it exists, otherwise return the uploader ID.

### uploader\_id

type:

`String`

description:

The uploader id if it exists, otherwise return the unique ID.

### uploader\_url

type:

`String`

description:

The uploader url if it exists, otherwise returns the webpage\_url.

### webpage\_url

type:

`String`

description:

The url to the webpage.

### width

type:

`Integer`

description:

Width in pixels of the video. If this value is unavailable (i.e. audio download), it
will default to 0.

* * *

## Metadata Variables

### entry\_metadata

type:

`Map`

description:

The entry’s info.json

### playlist\_metadata

type:

`Map`

description:

Metadata from the playlist (i.e. the parent metadata, like playlist -> entry)

### sibling\_metadata

type:

`Array`

description:

Metadata from any sibling entries that reside in the same playlist as this entry.

### source\_metadata

type:

`Map`

description:

Metadata from the source
(i.e. the grandparent metadata, like channel -> playlist -> entry)

* * *

## Playlist Variables

### playlist\_count

type:

`Integer`

description:

Playlist count if it exists, otherwise returns `1`.

Note that for channels/playlists, any change (i.e. adding or removing a video) will make
this value change. Use with caution.

### playlist\_description

type:

`String`

description:

The playlist description if it exists, otherwise returns the entry’s description.

### playlist\_index

type:

`Integer`

description:

Playlist index if it exists, otherwise returns `1`.

Note that for channels/playlists, any change (i.e. adding or removing a video) will make
this value change. Use with caution.

### playlist\_index\_padded

type:

`String`

description:

playlist\_index padded two digits

### playlist\_index\_padded6

type:

`String`

description:

playlist\_index padded six digits.

### playlist\_index\_reversed

type:

`Integer`

description:

Playlist index reversed via `playlist_count - playlist_index + 1`

### playlist\_index\_reversed\_padded

type:

`String`

description:

playlist\_index\_reversed padded two digits

### playlist\_index\_reversed\_padded6

type:

`String`

description:

playlist\_index\_reversed padded six digits.

### playlist\_max\_upload\_date

type:

`String`

description:

Max upload\_date for all entries in this entry’s playlist if it exists, otherwise returns
`upload_date`

### playlist\_max\_upload\_year

type:

`Integer`

description:

Max upload\_year for all entries in this entry’s playlist if it exists, otherwise returns
`upload_year`

### playlist\_max\_upload\_year\_truncated

type:

`Integer`

description:

The max playlist truncated upload year for all entries in this entry’s playlist if it
exists, otherwise returns `upload_year_truncated`.

### playlist\_title

type:

`String`

description:

Name of its parent playlist/channel if it exists, otherwise returns its title.

### playlist\_uid

type:

`String`

description:

The playlist unique ID if it exists, otherwise return the entry unique ID.

### playlist\_uploader

type:

`String`

description:

The playlist uploader if it exists, otherwise return the entry uploader.

### playlist\_uploader\_id

type:

`String`

description:

The playlist uploader id if it exists, otherwise returns the entry uploader ID.

### playlist\_uploader\_url

type:

`String`

description:

The playlist uploader url if it exists, otherwise returns the playlist webpage\_url.

### playlist\_webpage\_url

type:

`String`

description:

The playlist webpage url if it exists. Otherwise, returns the entry webpage url.

* * *

## Release Date Variables

### release\_date

type:

`String`

description:

The entry’s release date, in YYYYMMDD format. If not present, return the upload date.

### release\_date\_standardized

type:

`String`

description:

The uploaded date formatted as YYYY-MM-DD

### release\_day

type:

`Integer`

description:

The upload day as an integer (no padding).

### release\_day\_of\_year

type:

`Integer`

description:

The day of the year, i.e. February 1st returns `32`

### release\_day\_of\_year\_padded

type:

`String`

description:

The upload day of year, but padded i.e. February 1st returns “032”

### release\_day\_of\_year\_reversed

type:

`Integer`

description:

The upload day, but reversed using `{total_days_in_year} + 1 - {release_day}`,
i.e. February 2nd would have release\_day\_of\_year\_reversed of `365 + 1 - 32` = `334`

### release\_day\_of\_year\_reversed\_padded

type:

`String`

description:

The reversed upload day of year, but padded i.e. December 31st returns “001”

### release\_day\_padded

type:

`String`

description:

The entry’s upload day padded to two digits, i.e. the fifth returns “05”

### release\_day\_reversed

type:

`Integer`

description:

The upload day, but reversed using `{total_days_in_month} + 1 - {release_day}`,
i.e. August 8th would have release\_day\_reversed of `31 + 1 - 8` = `24`

### release\_day\_reversed\_padded

type:

`String`

description:

The reversed upload day, but padded. i.e. August 30th returns “02”.

### release\_month

type:

`Integer`

description:

The upload month as an integer (no padding).

### release\_month\_padded

type:

`String`

description:

The entry’s upload month padded to two digits, i.e. March returns “03”

### release\_month\_reversed

type:

`Integer`

description:

The upload month, but reversed using `13 - {release_month}`, i.e. March returns `10`

### release\_month\_reversed\_padded

type:

`String`

description:

The reversed upload month, but padded. i.e. November returns “02”

### release\_year

type:

`Integer`

description:

The entry’s upload year

### release\_year\_truncated

type:

`Integer`

description:

The last two digits of the upload year, i.e. 22 in 2022

### release\_year\_truncated\_reversed

type:

`Integer`

description:

The upload year truncated, but reversed using `100 - {release_year_truncated}`, i.e.
2022 returns `100 - 22` = `78`

* * *

## Source Variables

### source\_count

type:

`Integer`

description:

The source count if it exists, otherwise returns `1`.

### source\_description

type:

`String`

description:

The source description if it exists, otherwise returns the playlist description.

### source\_index

type:

`Integer`

description:

Source index if it exists, otherwise returns `1`.

It is recommended to not use this unless you know the source will never add new content
(it is easy for this value to change).

### source\_index\_padded

type:

`String`

description:

The source index, padded two digits.

### source\_title

type:

`String`

description:

Name of the source (i.e. channel with multiple playlists) if it exists, otherwise
returns its playlist\_title.

### source\_uid

type:

`String`

description:

The source unique id if it exists, otherwise returns the playlist unique ID.

### source\_uploader

type:

`String`

description:

The source uploader if it exists, otherwise return the playlist\_uploader

### source\_uploader\_id

type:

`String`

description:

The source uploader id if it exists, otherwise returns the playlist\_uploader\_id

### source\_uploader\_url

type:

`String`

description:

The source uploader url if it exists, otherwise returns the source webpage\_url.

### source\_webpage\_url

type:

`String`

description:

The source webpage url if it exists, otherwise returns the playlist webpage url.

* * *

## Upload Date Variables

### upload\_date

type:

`String`

description:

The entry’s uploaded date, in YYYYMMDD format. If not present, return today’s date.

### upload\_date\_standardized

type:

`String`

description:

The uploaded date formatted as YYYY-MM-DD

### upload\_day

type:

`Integer`

description:

The upload day as an integer (no padding).

### upload\_day\_of\_year

type:

`Integer`

description:

The day of the year, i.e. February 1st returns `32`

### upload\_day\_of\_year\_padded

type:

`String`

description:

The upload day of year, but padded i.e. February 1st returns “032”

### upload\_day\_of\_year\_reversed

type:

`Integer`

description:

The upload day, but reversed using `{total_days_in_year} + 1 - {upload_day}`,
i.e. February 2nd would have upload\_day\_of\_year\_reversed of `365 + 1 - 32` = `334`

### upload\_day\_of\_year\_reversed\_padded

type:

`String`

description:

The reversed upload day of year, but padded i.e. December 31st returns “001”

### upload\_day\_padded

type:

`String`

description:

The entry’s upload day padded to two digits, i.e. the fifth returns “05”

### upload\_day\_reversed

type:

`Integer`

description:

The upload day, but reversed using `{total_days_in_month} + 1 - {upload_day}`,
i.e. August 8th would have upload\_day\_reversed of `31 + 1 - 8` = `24`

### upload\_day\_reversed\_padded

type:

`String`

description:

The reversed upload day, but padded. i.e. August 30th returns “02”.

### upload\_month

type:

`Integer`

description:

The upload month as an integer (no padding).

### upload\_month\_padded

type:

`String`

description:

The entry’s upload month padded to two digits, i.e. March returns “03”

### upload\_month\_reversed

type:

`Integer`

description:

The upload month, but reversed using `13 - {upload_month}`, i.e. March returns `10`

### upload\_month\_reversed\_padded

type:

`String`

description:

The reversed upload month, but padded. i.e. November returns “02”

### upload\_year

type:

`Integer`

description:

The entry’s upload year

### upload\_year\_truncated

type:

`Integer`

description:

The last two digits of the upload year, i.e. 22 in 2022

### upload\_year\_truncated\_reversed

type:

`Integer`

description:

The upload year truncated, but reversed using `100 - {upload_year_truncated}`, i.e.
2022 returns `100 - 22` = `78`

* * *

## Ytdl-Sub Variables

### download\_index

type:

`Integer`

description:

The i’th entry downloaded. NOTE that this is fetched dynamically from the download
archive.

### download\_index\_padded6

type:

`String`

description:

The download\_index padded six digits

### upload\_date\_index

type:

`Integer`

description:

The i’th entry downloaded with this upload date.

### upload\_date\_index\_padded

type:

`String`

description:

The upload\_date\_index padded two digits

### upload\_date\_index\_reversed

type:

`Integer`

description:

100 - upload\_date\_index

### upload\_date\_index\_reversed\_padded

type:

`String`

description:

The upload\_date\_index padded two digits

### ytdl\_sub\_input\_url

type:

`String`

description:

The input URL used in ytdl-sub to create this entry.

### ytdl\_sub\_input\_url\_count

type:

`Integer`

description:

The total number of input URLs as defined in the subscription.

### ytdl\_sub\_input\_url\_index

type:

`Integer`

description:

The index of the input URL as defined in the subscription, top-most being the 0th index.

### ytdl\_sub\_keep\_files\_date\_eval

type:

`String`

description:

The standardized date variable supplied in `output_options.keep_files_date_eval`.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/entry_variables.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/config_reference/scripting/entry_variables.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)