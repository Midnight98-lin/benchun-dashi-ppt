# Bundled review skills

Bundled on 2026-09-09 from the user's installed copies. Original skill instructions, references, scripts and agent resources are retained without modification. Benchun's PPT-specific scope adapter is `../references/dual-review.md`; it is not an upstream feature or endorsement.

| Directory | Upstream | Snapshot | License |
|---|---|---|---|
| design-taste-frontend | https://github.com/Leonxlnx/taste-skill | Installed v2 instructions; LICENSE retrieved at ccbc15639c97057cbfcf32ecebc38ef716e4bb37 | MIT, see directory LICENSE |
| impeccable | https://github.com/pbakaus/impeccable | Installed 4.1.2; LICENSE and NOTICE from skill-v4.1.2 | Apache-2.0, see directory LICENSE and NOTICE.md |

SHA-256 of bundled entrypoints:

- Taste SKILL.md: `aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89`. Git blob `b72132fcd466da605623ffe96e370b3991fc5285` matches upstream `skills/taste-skill/SKILL.md` at the commit above.
- Impeccable SKILL.md: `dcf6bf768561b1e8ca145674c91e0c8cf53e9d5434086e3d4932660f191e96d4`. Git blob `df44404b0e5ac90b0d8f2c7ec9b4fd885e653e8d` matches upstream `.agents/skills/impeccable/SKILL.md` at `skill-v4.1.2`.

Impeccable's upstream notice attributes native platform guidance to https://github.com/ehmo/platform-design-skills (MIT); its full license is included as `impeccable/PLATFORM-DESIGN-LICENSE`. Its bundled modern-screenshot browser library is from https://github.com/qq15725/modern-screenshot (MIT), with license included as `impeccable/MODERN-SCREENSHOT-LICENSE`. These two license files were retrieved from their upstream main branches on the bundling date.

Licenses added during packaging do not relicense Benchun branding or other independent code. Review bundles do not contain private project context, user API keys, personal configuration or local installations. Optional browser automation, generation services and external npm packages are not automatically installed or authorized by bundling their helper scripts. External documentation URLs are references, not vendored software. Taste's Block Library section describes a future schema; it does not provide an implemented block library in this installed snapshot.
