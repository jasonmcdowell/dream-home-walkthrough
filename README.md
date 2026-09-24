# Placed and Spaces · Public Walkthroughs

This repository hosts the static GitHub Pages site for the Placed and Spaces
experiences. The repository name and Pages base URL remain unchanged.

## Published routes

- `/` — Placed and Spaces landing page.
- `/torus-home/` — Torus Home walkthrough.
- `/oneill/` — O’Neill Cylinder environment.
- `/oneill/?house=torus` — Torus Home inside the O’Neill Cylinder.

The two standalone experiences live in their own route folders. `/vendor/` is
the locally hosted Three.js runtime shared by both, and `houses/oneill-cylinder/`
contains the browser-side procedural generator and its configuration. The
repository contains only the files needed by the static browser builds, not the
editable Blender sources or development-only project files.

## Publishing updates

The source is maintained in the private Dream Home project. From that
repository, run `./publish-public-walkthrough.sh`. The publisher stages the
landing page and both experiences, synchronizing only the paths owned by each
site section. It does not sync-delete the public repository root or commit and
push automatically.

Review the changes here before publishing:

```sh
git status
git diff --stat
```

GitHub’s individual-file limit is 100 MiB. Large future assets should be
compressed or hosted separately.
