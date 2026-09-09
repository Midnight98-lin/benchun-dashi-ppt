# Benchun · Dashi PPT

A brand-focused AI skill for editable HTML presentations with a browser editor and optional native PPTX / static PDF export. [中文文档](README.md).

Version 1.1.0 bundles the complete installed Taste and Impeccable review skills, including their supporting resources and licenses. Copy the entire skill folder, including `review-skills/`; no separate installation is required.

## Required review workflow

Build to the brief → freeze the saved revision and render internal candidates → Taste page-by-page visual review → Impeccable page-by-page polish review → batch fixes and confirmation → deliver only verified outputs. See [the PPT scope adapter](skills/benchun-dashi-ppt/references/dual-review.md). Preserve exact source text, punctuation, brand tokens, numbers and SKU assets; website-specific rules do not authorize changes. Record screenshot evidence per page and per output format. Missing tools or unseen renders must not be reported as passing. A single AI can perform two disclosed review passes when agents are unavailable. This is an AI workflow requirement, not a technical guarantee that every AI will comply.

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

The public edition retains approved brand scenes but removes private project paths and genuine evidence documents. Clearly marked evidence placeholders are not product evidence. Brand artwork is not a license to rebrand, resell or claim product affiliation. No general open-source code license has been selected for Benchun's independent code. Bundled third-party skills remain under their own MIT / Apache-2.0 licenses and retain their notices; see [third-party notices](THIRD_PARTY_NOTICES.md). This is an independent implementation inspired by declarative layout + props, not an official Dashi extension.
