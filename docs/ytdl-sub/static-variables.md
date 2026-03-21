[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/static_variables.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/config_reference/scripting/static_variables.rst)
- .pdf

LightDarkSystem Settings

# Static Variables

## Contents

# Static Variables

## Subscription Variables

### subscription\_array

For subscriptions in the form of

```
"Subscription Name":
  - "https://url1.com/..."
  - "https://url2.com/..."
```

Copy to clipboard

Store all values into an array named `subscription_array`.

### subscription\_has\_download\_archive

Returns True if the subscription has any entries recorded in a download archive. False
otherwise.

### subscription\_indent\_i

For subscriptions where the ancestor keys contain the `= ...` prefix, the
variables `subscription_indent_1`, `subscription_indent_2`, and so on get
set to each subsequent value. For example, given the following subscriptions
file snippet:

```
Preset 1 | = Indent Value 1 | Preset 2:
  Preset 3 | = Indent Value 2 | Preset 4:
    "Subscription Name": "https://..."
```

Copy to clipboard

The `{subscription_indent_1}` variable will be `Indent Value 1` and
`{subscription_indent_2}` will be `Indent Value 2`. The most common use of
these variables is to [set the genre and rating for subscriptions from the\\
YAML keys](https://ytdl-sub.readthedocs.io/en/latest/config_reference/prebuilt_presets/tv_show.html).

### subscription\_map

For subscriptions in the form of

```
+ Subscription Name:
  Music Videos:
    - "https://url1.com/..."
  Concerts:
    - "https://url2.com/..."
```

Copy to clipboard

Stores all the contents under the subscription name into the override variable
`subscription_map` as a Map value. The above example is stored as:

```
{
  "Music Videos": [\
    "https://url1.com/..."\
  ],
  "Concerts: [\
    "https://url2.com/..."\
  ]
}
```

Copy to clipboard

### subscription\_name

Name of the subscription. For subscriptions types that use a prefix (`~`, `+`),
the prefix and all whitespace afterwards is stripped from the subscription name.

### subscription\_value

For subscriptions in the form of

```
"Subscription Name": "https://..."
```

Copy to clipboard

`subscription_value` gets set to `https://...`.

### subscription\_value\_i

For subscriptions in the form of

```
"Subscription Name":
  - "https://url1.com/..."
  - "https://url2.com/..."
```

Copy to clipboard

`subscription_value_1` and `subscription_value_2` get set to `https://url1.com/...`
and `https://url2.com/...`. Note that `subscription_value_1` also gets set to
`subscription_value`.

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/config_reference/scripting/static_variables.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/config_reference/scripting/static_variables.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)