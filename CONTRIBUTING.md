# Contributing

Thank you for helping improve Ultrapowers.

This repository is source-available, not open source. The code is public so you can see what you install, but every right in it belongs to the owner. Read [LICENSE](LICENSE): you may install the plugin in your AI agent or coding tool and use it, and nothing else.

## How you can help

- **Report a bug.** Open an issue with the bug report template.
- **Request a feature or a change.** Open an issue with the feature request template. Describe the problem you hit, not a patch.
- **Ask a question or start a discussion.** Use [Discussions](https://github.com/raoofaltaher/ultrapowers/discussions): Q&A for help, Ideas for suggestions.

Ideas and reports submitted in issues and discussions may be used by the owner freely, as section 3 of the license sets out.

## What is not accepted

- Pull requests, patches or code from anyone other than the owner. They are closed without review.
- Forks, copies, mirrors or modified versions of the plugin published elsewhere.

## Reporting problems

Include the plugin version, the harness and its version, the message you sent, which skill triggered (or did not), and a transcript excerpt with anything confidential removed. Search open and closed issues first.

## Maintainer workflow

These rules apply to the owner's own work. [AGENTS.md](AGENTS.md) holds the full detail: the repository layout, the rules, and the offline test suite.

- `main` is the released branch. Every merge into it is a release with a version bump and release notes.
- `dev` is the integration branch. All work lands there first through a pull request that fills in the template.
- Versions change only through `scripts/bump-version.sh <x.y.z>`, and `scripts/bump-version.sh --audit` must end with "All clear".

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
