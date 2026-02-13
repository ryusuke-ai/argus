# Third-Party Licenses

This document lists third-party dependencies and assets used in Argus that have notable licensing terms beyond the standard MIT/ISC/Apache-2.0 ecosystem.

## Dependencies

### Remotion (Video Rendering)

- **Packages**: `remotion`, `@remotion/bundler`, `@remotion/cli`, `@remotion/renderer`
- **License**: [Remotion License](https://www.remotion.dev/docs/license)
- **Summary**: Free for individuals, companies with 3 or fewer employees, non-profits, and evaluation purposes. Companies with 4+ employees require a [Company License](https://www.remotion.dev/docs/license).
- **Usage in Argus**: Video rendering for content generation (video-explainer skill).

### Claude Agent SDK

- **Package**: `@anthropic-ai/claude-agent-sdk`
- **License**: Proprietary — subject to [Anthropic's Terms of Service](https://www.anthropic.com/legal/terms)
- **Summary**: Usage requires a valid Claude subscription or Anthropic API key. See Anthropic's legal agreements for redistribution terms.
- **Usage in Argus**: Core agent execution engine.

## Fonts

### keifont

- **Location**: `.claude/skills/video-explainer/assets/font/keifont.ttf`
- **License**: Apache License 2.0
- **Based on**: Source Han Sans (SIL Open Font License 1.1) + M+ OUTLINE FONTS (M+ FONTS LICENSE)
- **License file**: `.claude/skills/video-explainer/assets/font/LICENSE.txt`

## Media Assets (Not Included in Repository)

The following media assets are required for the video generation features but are **not distributed** with this repository due to licensing constraints. You must obtain them separately.

### Character Images

- **Tsukuyomi-chan (つくよみちゃん)**: Free character for commercial use. Obtain from [official site](https://tyc.rei-yumesaki.net/). Follow the [terms of use](https://tyc.rei-yumesaki.net/about/terms/).
- **AI Voice Actor Ginga (AI声優 銀芽)**: Character from [COEIROINK](https://coeiroink.com/). Credit is required. Follow the usage guidelines at [AI声優 official site](https://aisei-yu.hp.peraichi.com).

### Audio Assets

- **BGM, Sound Effects, Transition Sounds**: Must be sourced separately. Place files in `.claude/skills/video-explainer/assets/` following the directory structure documented in the video-explainer skill.
- **TTS Audio**: Generated at runtime by COEIROINK/VOICEVOX. Not stored in the repository.

### Background Videos

- Must be sourced separately. Place `.mp4` files in `.claude/skills/video-explainer/assets/backgrounds/`.
