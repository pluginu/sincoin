# SIN

**DISCOVER • FOLLOW • SUPPORT**

SIN is a planned suite of tools that helps people discover adult entertainers and creators faster, wherever they browse or search. Browser extensions, plugins for AI agents, and other search integrations will connect people with relevant creators across platforms, including OnlyFans.

For creators, SIN aims to make it easier to be found through searchable profiles, relevant keywords, and paid visibility. The proposed $SIN token connects creator participation to the discovery ecosystem.

**Status:** The Chrome name-highlighting extension is implemented. The directory, token features, and other integrations below remain planned.

## Install the Chrome extension

1. Download or clone this repository into a folder you will keep on your computer.
2. Open `chrome://extensions` in Chrome 120 or later and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder containing `manifest.json`.
4. Pin **sin69** from Chrome’s extensions menu, then refresh any already-open website tabs.
5. Click the extension to toggle highlighting or add your own rules.

Names are highlighted in gold. The popup shows the number of highlights in the main page; matching frames are highlighted too. Turning the extension off removes highlights from open tabs. You can separately disable the entertainer list and enable, edit, or delete individual custom rules. Changes apply to open pages automatically.

### Runtime entertainer file

The extension loads [the hosted entertainer list](https://pluginu.github.io/sincoin/entertainers.txt) on first use and checks for updates every **15 minutes** while Chrome is running. Conditional requests use the server’s ETag and Last-Modified headers so unchanged files need no body download. All tabs share a locally saved list, including across browser restarts. If the site is unavailable, the last saved list remains available; a fresh installation can fall back to the bundled file and retry after 15 minutes. Chrome may delay checks while the device is asleep; overdue checks run when the extension resumes.

Update the hosted `entertainers.txt` to distribute additions and removals to installed extensions automatically. Open pages re-scan when the saved names change. The popup’s name count refreshes when it opens. Each line represents a full name: `Angela, White` becomes `Angela White`, and `Kagney, Linn, Karter` becomes `Kagney Linn Karter`. Matching is case-insensitive and respects word boundaries.

### Custom matching

| Mode | Behavior | Example |
| --- | --- | --- |
| Exact word / phrase | Full word or phrase with word boundaries | `Ann` matches `Ann`, not `Anna` |
| Contains | Text anywhere, including inside a word | `ann` matches part of `Joanna` |
| Starts with | Text at the beginning of a word | `Ang` highlights `Ang` in `Angela` |
| Ends with | Text at the end of a word | `ley` highlights `ley` in `Riley` |
| Regular expression | JavaScript regex, entered without `/` delimiters | `(?:Angela|Riley)\s+\w+` |

All modes default to case-insensitive matching; each custom rule can enable case sensitivity. Literal phrases allow variable whitespace. Regex uses global and Unicode flags, plus the case-insensitive flag unless you enable case sensitivity. Empty regex matches are skipped, and overlapping highlights merge. Regex anchors apply to each block of page text, not the whole website. Full names can span inline formatting, such as `Angela <b>White</b>`.

Up to 100 custom rules are stored locally. Regex runs in a terminable worker; a scan taking over 1.5 seconds is stopped and reported in the popup. Simplify or disable the problematic expression to resume highlighting.

### Scope and privacy

The extension reads ordinary HTTP/HTTPS page text and keeps all processing on your device. It sends no browsing content to any server. Chrome’s website-access permission is needed to highlight pages automatically. The extension requests the public entertainer list from GitHub Pages every 15 minutes without sending page text. Storage holds your preferences, custom rules, and cached list; an offscreen document hosts the matching worker.

Chrome internal pages, the Chrome Web Store, the built-in PDF viewer, images, canvas text, and shadow DOM content are not supported. Form fields, editable regions, scripts, and hidden elements are excluded. Highlights use the CSS Custom Highlight API without replacing website text or links. Very large pages are limited to the first 200,000 characters and 5,000 raw matches per frame per scan; the popup reports when the limit is reached.

### Development and checks

```sh
npm install
npm test
npx playwright install chromium
npm run test:browser
```

Unit tests cover list parsing, matching modes, Unicode boundaries, case sensitivity, regex validation, overlap handling, and match limits. Browser checks load an isolated copy of the real extension and exercise highlighting, inline text, dynamic pages, excluded fields, toggle behavior, rule editing and persistence, hosted list updates, and regex timeout recovery. No build step is required to load the extension.

## Entertainer list and requests

[entertainers.txt](entertainers.txt) is the main file to check whether your name is listed. It contains one entertainer per line, with name parts separated by commas.

If your name is missing, you can request to have it added by submitting a repository issue or pull request with your name and wallet address. The current requirements are:

- Your wallet must hold at least **200,000 SIN69 coins**.
- A **0.25 SOL** payment on Solana is required as a processing fee to add your name.

These requirements apply for the time being, unless stated otherwise. Submission and payment instructions, including the receiving wallet address, have not yet been published in this repository.

## Why SIN?

Discovering creators often means jumping between social networks, creator platforms, and search engines. SIN aims to bring that discovery into the tools people already use, helping them find creators by name, niche, category, interests, or content type.

The experience should be simple: discover someone relevant, visit their profile, and choose where to follow or support them.

## Planned tools

| Tool | Purpose |
| --- | --- |
| Browser extension | Help people discover relevant entertainers while browsing. |
| AI agent plugins | Let people find creators through natural-language requests in compatible AI tools. |
| Search integrations | Make creator discovery available through other search tools and interfaces. |
| Creator directory and search | Provide a searchable home for creator profiles and links to their platforms. |
| Creator tools | Let creators register profiles and manage the keywords associated with their presence. |

These tools are intended to share a common discovery layer so that a creator's presence can reach people through multiple interfaces.

## How discovery would work

1. A creator registers a profile with links to their platforms and relevant discovery terms.
2. A person searches for a name, category, niche, or interest through a SIN tool.
3. SIN surfaces relevant creator profiles and links.
4. The person follows those links to discover more, follow, or support the creator on their chosen platform.

Example searches could include “cosplay creators” or “fitness creators.” Over time, SIN aims to support more conversational requests and personalized recommendations.

## Creator visibility and keywords

The proposed keyword marketplace would let creators purchase visibility associated with relevant search terms, such as their name, category, or niche.

The details of keyword allocation, pricing, ranking, and placement are still to be designed. Paid placements should be clearly identified so people can understand why a result appears.

Potential revenue sources include creator registration, keyword purchases, and advertising.

## The role of $SIN

$SIN is the proposed economic layer of the ecosystem. The initial concept is for creators to use $SIN to register their name or profile and become discoverable across SIN tools.

Registration costs are also intended to discourage mass spam submissions. Payment alone does not establish a creator's identity or prevent impersonation; profile trust and moderation will need their own mechanisms.

The current entertainer-list requirements are described above. Token integration and any additional utility remain design decisions. This repository does not currently provide a token implementation or a verified contract address.

## Roadmap

- [ ] Define the creator profile model and registration flow.
- [ ] Build a searchable creator directory.
- [x] Bring discovery into a browser extension.
- [ ] Add integrations for AI agents and other search tools.
- [ ] Develop keyword purchasing and clearly labeled paid placements.
- [ ] Implement the proposed $SIN registration integration.
- [ ] Explore creator onboarding and outreach automation.
- [ ] Expand into recommendations and natural-language discovery.

The longer-term vision is **SIN AI**: a specialized search and recommendation system for adult-entertainment discovery. The intended progression is directory → search → recommendations → specialized AI discovery.

## Building in public

SIN is intended to be built openly, from the first idea to working tools. The original launch concept pairs a $SIN launch on Pump.fun with a livestream of the product being built.

**One person. One idea. One token. Building a real business live.**

The community identity is the **Community of Sinners**. The brand direction is playful and premium, with a minimal visual style and the emphasis on discovery, creators, and community.

## Development and contributions

The Chrome extension uses Manifest V3 and plain JavaScript, with no build step or production dependencies. See the setup and testing instructions above.

Ideas, feedback, and contributions are welcome through repository issues and pull requests. Useful early topics include creator search, browser workflows, AI agent integrations, profile quality, and creator onboarding.
