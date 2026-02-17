# Third-Party Licenses

This project uses the following third-party dependencies and assets.

## Core Dependencies

| Package                                                                                                                    | License                                                   | Usage                                |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sdk) (`@anthropic-ai/claude-agent-sdk`) | [Anthropic ToS](https://www.anthropic.com/legal/terms)    | AI agent execution engine            |
| [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (`@anthropic-ai/sdk`)                              | MIT                                                       | Direct API access for classification |
| [Next.js](https://nextjs.org/)                                                                                             | MIT                                                       | Dashboard web framework              |
| [React](https://react.dev/)                                                                                                | MIT                                                       | UI library                           |
| [Drizzle ORM](https://orm.drizzle.team/)                                                                                   | Apache-2.0                                                | Type-safe database ORM               |
| [Slack Bolt](https://slack.dev/bolt-js/) (`@slack/bolt`)                                                                   | MIT                                                       | Slack app framework                  |
| [Express](https://expressjs.com/)                                                                                          | MIT                                                       | REST API server                      |
| [Zod](https://zod.dev/)                                                                                                    | MIT                                                       | Runtime schema validation            |
| [Playwright](https://playwright.dev/)                                                                                      | Apache-2.0                                                | Browser automation for web scraping  |
| [jose](https://github.com/panva/jose)                                                                                      | MIT                                                       | JWT verification (Cloudflare Access) |
| [Remotion](https://www.remotion.dev/)                                                                                      | [Remotion License](https://www.remotion.dev/docs/license) | Video rendering (see note below)     |

## Remotion License Notice

Remotion is **free for individuals and companies with up to 3 employees**. Organizations with 4+ employees must purchase a [Company License](https://www.remotion.dev/docs/license) before using Remotion commercially. If you fork this project, ensure you comply with Remotion's licensing terms.

## Media Assets (Not Included)

The following media assets are required for video/audio generation but are **not included** in this repository due to licensing restrictions:

| Asset Type          | Expected Location       | How to Obtain                                                     |
| ------------------- | ----------------------- | ----------------------------------------------------------------- |
| Character images    | `.claude/agent-output/` | Create your own or use licensed assets                            |
| Background videos   | `.claude/agent-output/` | Stock footage services (Pexels, Pixabay)                          |
| BGM / Sound effects | `.claude/agent-output/` | Royalty-free audio libraries                                      |
| TTS voice models    | COEIROINK local server  | [COEIROINK](https://coeiroink.com/) (free for non-commercial use) |

## Development Dependencies

All development dependencies (ESLint, Prettier, Vitest, TypeScript, etc.) are licensed under MIT or compatible open-source licenses. Run `pnpm licenses list` for a complete listing.

## Claude Agent SDK Usage

Usage of the Claude Agent SDK requires a valid [Claude subscription](https://claude.ai/) (Max Plan for local execution) or an [Anthropic API key](https://console.anthropic.com/) (for server deployment). This project supports both modes via automatic detection.
