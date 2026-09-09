# Benchun · Dashi PPT

A brand-focused AI skill for editable HTML presentations with a browser editor and optional native PPTX / static PDF export. [中文文档](README.md).

## Install

Clone or download this repository, then copy `skills/benchun-dashi-ppt` into your Codex skills directory (`~/.codex/skills`, or the skills subdirectory of your configured CODEX_HOME). Back up an existing version first. Invoke `$benchun-dashi-ppt` in a new task. No npm package is published.

## Run the sample

```sh
node skills/benchun-dashi-ppt/scripts/render.mjs skills/benchun-dashi-ppt/assets/example.goal.json work/demo
node skills/benchun-dashi-ppt/scripts/serve.mjs work/demo --port 5368
```

Requires Node 20+. Open the loopback address printed by the server. Edit, save, and then export; saved scene.json is the source of truth after browser edits. Offline HTML edits must be downloaded to persist.

## Features

12 brand layouts; text/font/italic/underline controls; page background; shapes and image insertion; stroke and fill; adjustable rounded corners; scaling, rotation and flip in a transform popover; undo/redo and revision-aware saves.

## Dependencies and limits

Basic HTML generation and editing use built-in Node modules. PDF export requires Playwright and a compatible browser. Native PPTX export requires the Codex-provided @oai/artifact-tool and presentations validation runtime, which are not bundled. It is not a general PPTX importer. No per-character rich text, page insertion or perspective distortion. Fonts and cross-platform rendering require verification.

The public edition retains approved brand scenes but removes private project paths and genuine evidence documents. Clearly marked evidence placeholders are not product evidence. Brand artwork is not a license to rebrand, resell or claim product affiliation. No general open-source code license has been selected; third-party icon licenses are retained separately. This is an independent implementation inspired by declarative layout + props, not an official Dashi extension.
