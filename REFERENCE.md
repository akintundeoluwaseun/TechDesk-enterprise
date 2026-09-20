# Reference implementations

The merge plan says to keep the old projects until the merged build has proved
itself. It does **not** need a `legacy/` folder to do that: the seven original
repositories already are the backup, with their full history, and copying
40,000 lines of them in here would only create a second thing to keep in sync.

So this file is the `legacy/` directory. These are the exact commits the merge
started from. Any "did the merged build change behaviour?" question is answered
by diffing against one of them.

| Product | Repository | Branch | Commit | Version |
|---|---|---|---|---|
| Solo (and the Android app) | `techdesk-solo` | `main` | `721cd53f` | 1.4.2 / android 1.2.0 |
| Business | `TechDesk-version-2-build-2026-11608-567` | `claude/project-github-upload-uymhia` | `083bfd22` | 2.3.4 |
| **Enterprise — the foundation** | `techdesk-version-2-build-2026-74215-902` | `enterprise` | `5aef23c6` | 3.3.4 |
| Web App | `techdesk-webaapp-` | `main` | `a5759f17` | 1.0.0 |
| Website + HQ Web + Supabase functions | `techdesk-website-` | `main` | `e7e9e48c` | — |
| Monitor | in the Enterprise repo, `monitor/` | `enterprise` | `5aef23c6` | 1.1.0 |

This repository's history *is* Enterprise's history — it was cloned, not
copied, so all 81 commits up to `5aef23c6` are below the restructure commit and
`git log --follow` works through the move.

**Do not delete any of these repositories** until the merged build has run a
month in real shops without a rollback. Deleting the reference while still
finding bugs in the replacement is how a two-week project becomes a two-month
one.

## Checking for drift

    git diff 5aef23c6:src apps/desktop/src        # against Enterprise at the freeze
    diff -r ../techdesk-solo/src apps/desktop/src # against another edition

## What was dropped in the move

`website/` — two files, last touched 9 September, a stale early draft of the
marketing site. The real one is `techdesk-website-`, which has twelve generated
pages and its own test suite. Recoverable from history if ever wanted.
