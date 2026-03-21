[Skip to main content](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/automating_downloads.html#main-content)

Back to top`Ctrl` + `K`

[ytdl-sub documentation](https://ytdl-sub.readthedocs.io/en/latest/index.html)

- [GitHub](https://github.com/jmbannon/ytdl-sub)
- [![Discord](https://img.shields.io/discord/994270357957648404?logo=Discord)](https://discord.gg/v8j9RAHb4k)

Search`Ctrl` + `K`

- [.rst](https://ytdl-sub.readthedocs.io/en/latest/_sources/guides/getting_started/automating_downloads.rst)
- .pdf

LightDarkSystem Settings

# Automating

## Contents

# Automating

Automate downloading your subscriptions by running the [‘sub’ sub-command](https://ytdl-sub.readthedocs.io/en/latest/usage.html#subscriptions-options) periodically. There are various tools that can run
commands on a schedule you may use any of them that work with your installation
method. Most users use [cron](https://en.wikipedia.org/wiki/Cron) in [Docker containers](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/automating_downloads.html#docker-and-unraid).

## Docker and Unraid

[The ‘ytdl-sub’ Docker container images](https://ytdl-sub.readthedocs.io/en/latest/guides/install/docker.html) provide optional cron
support. Enable cron support by setting [a cron schedule](https://crontab.cronhub.io/) in the `CRON_SCHEDULE`
environment variable:

./compose.yaml

```
services:
  ytdl-sub:
    environment:
      CRON_SCHEDULE: "0 */6 * * *"
      # WARNING: See "Getting Started" -> "Automating" docs regarding throttles/bans:
      # CRON_RUN_ON_START: false
```

Copy to clipboard

Then recreate the container to apply the change and start it to generate the default
`/config/ytdl-sub-configs/cron` script. Read the comments in that script and edit as
appropriate.

The container cron wrapper script will write output from the cron job to
`/config/ytdl-sub-configs/.cron.log`. The default image `ENTRYPOINT` will `$ tail
...` that file so you can monitor the cron job in the container’s output and thus also
in the Docker logs.

You may also set the `CRON_RUN_ON_START` environment variable to `true` to have the
image run your cron script whenever the container starts in addition to the cron
schedule.

Warning

Using `CRON_RUN_ON_START` may cause your cron script to run too often and may
trigger throttles and bans. When enabled, your cron script will run _whenever_ the
container starts including when the host reboots, when `# dockerd` restarts such as
when upgrading Docker itself, when a new image is pulled, when something applies
Compose changes, etc.. This may result in running `ytdl-sub` right before or after
the next cron scheduled run.

## Linux, Mac OS X, BSD, or other UNIX’s

For installations on systems already running `# crond`, you can also use cron to run
`ytdl-sub` periodically. Write a script to run `ytdl-sub` in the cron job. Be sure
the script changes to the same directory as your configuration and uses the full path to
`ytdl-sub`:

~/.local/bin/ytdl-sub-cron

```
#!/bin/bash
cd "~/.config/ytdl-sub/"
~/.local/bin/ytdl-sub --dry-run sub -o '--ytdl_options.max_downloads 3' |&
    tee -a "~/.local/state/ytdl-sub/.cron.log"
```

Copy to clipboard

Then tell `# crond` when to run the script:

```
echo "0 */6 * * * ${HOME}/.local/bin/ytdl-sub-cron" | crontab "-"
```

Copy to clipboard

Remove the `--dry-run` and `-o ...` CLI options from your cron script when you’ve
tested your configuration and you’re ready to download entries unattended.

## Windows

For most Windows users, the best way to run commands periodically is [the Task\\
Scheduler](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page):

Attention

These instructions are untested. Use at your own risk. If you use them, whether they
work or not, please let us know how it went in [a support post in Discord](https://discord.com/channels/994270357957648404/1084886228266127460) or [a new\\
GitHub issue](https://github.com/jmbannon/ytdl-sub/issues/new).

1. Open the Task Scheduler app.

2. Click `Create Basic Task` at the top of the right sidebar.

3. Set all the fields as appropriate until you get to the `Action`…

4. For the `Action`, select `Start a program`…

5. Click `Browse...` to the installed `ytdl-sub.exe` executable…

6. Add CLI arguments to `Add arguments (optional):`, for example `--dry-run sub -o
'--ytdl_options.max_downloads 3'`…

7. Set `Start in (optional):` to the directory containing your configuration.

8. Finish the rest of the `Create Basic Task` wizard.


## Next Steps

At this point, `ytdl-sub` should run periodically and keep your subscriptions current
in your media library without your intervention. As your [subscriptions file](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/subscriptions.html) grows or you discover new use cases, it becomes worth while to
simplify things by [defining your own custom presets](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/first_config.html).

Contents


Versions**[latest](https://ytdl-sub.readthedocs.io/en/latest/guides/getting_started/automating_downloads.html)**[v0.2.0](https://ytdl-sub.readthedocs.io/en/v0.2.0/guides/getting_started/automating_downloads.html)On Read the Docs[Project Home](https://app.readthedocs.org/projects/ytdl-sub/?utm_source=ytdl-sub&utm_content=flyout)[Builds](https://app.readthedocs.org/projects/ytdl-sub/builds/?utm_source=ytdl-sub&utm_content=flyout)Search

* * *

[Addons documentation](https://docs.readthedocs.io/page/addons.html?utm_source=ytdl-sub&utm_content=flyout) ― Hosted by
[Read the Docs](https://about.readthedocs.com/?utm_source=ytdl-sub&utm_content=flyout)