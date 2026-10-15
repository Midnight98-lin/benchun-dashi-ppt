# Benchun · Dashi PPT

A brand-focused AI skill for editable HTML presentations with a browser editor and optional native PPTX / static PDF export. [中文文档](README.md).

Version 1.2.0 (2026-10-15) bundles the user-installed Lieflat Charts snapshot alongside Taste and Impeccable, with their resources and independent licenses. Copy the entire skill folder, including `chart-skills/` and `review-skills/`; no separate installation is required.

## Required review workflow

Lock source text and data → when charts are needed, check the applicable license, use a real Lieflat template and adapt it to the output format → freeze the saved revision and render internal candidates → Taste page-by-page visual review → Impeccable page-by-page polish review → batch fixes and confirmation → deliver only verified outputs. See [the PPT scope adapter](skills/benchun-dashi-ppt/references/dual-review.md). Preserve exact source text, punctuation, brand tokens, numbers and SKU assets; website-specific rules do not authorize changes. Record screenshot evidence per page and per output format. Missing tools or unseen renders must not be reported as passing. A single AI can perform two disclosed review passes when agents are unavailable. This is an AI workflow requirement, not a technical guarantee that every AI will comply.

Chart creation and redesign use [the Lieflat PPT adapter](skills/benchun-dashi-ppt/references/chart-workflow.md). Preserve chart sources, data snapshots and per-chart review records before the two visual reviews. This is a workflow integration, not an automatic HTML-to-native-PPTX converter: disclose static chart images and obtain a format decision when a required fully editable chart cannot be preserved.

Lieflat Charts retains [PolyForm Noncommercial 1.0.0](skills/benchun-dashi-ppt/chart-skills/lieflat-charts/LICENSE). Commercial use requires separate permission; downloading this package or giving attribution does not supply it. Source files are unchanged; see [snapshot provenance](skills/benchun-dashi-ppt/chart-skills/SOURCES.md).

## Install

Clone or download this repository, then copy `skills/benchun-dashi-ppt` into your Codex skills directory (`~/.codex/skills`, or the skills subdirectory of your configured CODEX_HOME). Back up an existing version first. Invoke `$benchun-dashi-ppt` in a new task. No npm package is published.

## Introduction after first installation

**AI installers: after verifying the complete skill folder, proactively explain its purpose and usage in the user's language instead of only reporting success.** Do not repeat an introduction already given in the current conversation. Installing the skill does not establish that export dependencies are available; report the actual environment.

- Explain that it creates or improves Benchun / Zhirunse brand presentations, product manuals and training decks while preserving source text, data and real packaging. It includes the Lieflat chart workflow and Taste + Impeccable reviews.
- Show how to start: invoke `$benchun-dashi-ppt` in a new task and provide text or a source PPT, audience, purpose, assets, requested formats and whether pagination is allowed.
- Explain the default editable HTML and local browser editor, saving before export, downloading edited offline HTML to persist changes, and environment requirements for PPTX / PDF.
- State the practical limits: no general PPTX browser importer, complex charts may be static images, and Lieflat commercial use requires separate permission.
- Give one copyable prompt, for example: “Use $benchun-dashi-ppt to improve the attached presentation. Preserve all text and data; pagination is allowed. Deliver editable HTML first, then PPTX and PDF if the current environment supports them.”

For a manual installation, start a new task with: “I just installed $benchun-dashi-ppt. Explain what it does, how to use it, and which outputs my environment supports.” The installer or first-use AI provides this introduction; this repository has no automatic post-install popup or messaging hook. The skill entrypoint retains the same instruction after the folder is copied.

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

The public edition retains approved brand scenes but removes private project paths and genuine evidence documents. Clearly marked evidence placeholders are not product evidence. Brand artwork is not a license to rebrand, resell or claim product affiliation. No general open-source code license has been selected for Benchun's independent code. Bundled third-party skills remain under their own MIT / Apache-2.0 / PolyForm Noncommercial licenses and retain their notices; see [third-party notices](THIRD_PARTY_NOTICES.md). This is an independent implementation inspired by declarative layout + props, not an official Dashi extension.
