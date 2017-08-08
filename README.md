# wp2md

Convert WordPress exported posts to Markdown with front matter

This simple utility takes a nasty xml file that WordPress spits out and gives you a nice collection of markdown files for all your posts, with static site generator-friendly front matter with their meta-data.

It's written in TypeScript and requires node.

## Usage

- Install dependencies: `yarn install` or `npm install`
- Place your xml file in the root of the repo and name it `input.xml`
- `yarn convert`

Files should be placed in `output/`
