# Dream Home Walkthrough

This public repository contains the static GitHub Pages site for the interactive Dream Home walkthrough.

Live site: [jasonmcdowell.github.io/dream-home-walkthrough](https://jasonmcdowell.github.io/dream-home-walkthrough/)

## Project structure

- **index.html**, **style.css**, and **app.js** make up the browser walkthrough.
- **assets/** contains the published model, data, and image assets.
- **vendor/** contains the locally hosted Three.js build and addons.
- **.nojekyll** keeps GitHub Pages from rewriting the static site.

The design files, Blender sources, scripts, tests, and other working material remain in the private Dream Home project. This repository contains only the files needed to run the public walkthrough.

## Publishing updates

From the private Dream Home project, run:

    ./publish-public-walkthrough.sh

The script updates a sibling checkout at ../Dream Home Walkthrough by default. Review the changes, commit them, and push to main to publish the next version.

## Contributions

Pull requests are welcome for changes to the public walkthrough site. Please keep contributions self-contained in this repository and do not add private design files, credentials, or generated test output.

GitHub’s individual-file limit is 100 MiB. The published model is currently below that limit; large future assets should be compressed or hosted separately.
