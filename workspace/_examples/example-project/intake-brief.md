# Intake Brief — example-tools-cli

**Date:** 2025-09-15T10:18:00Z
**Intake interviewer:** intake (invoked via /team)
**Conversation log:** `workspace/example-tools-cli/conversation-log.md`
**Seed:** `workspace/example-tools-cli/seed.md` (verbatim user prompt)

---

## 1. Problem Clarity

| Item | Tag | Content |
|---|---|---|
| Specific problem | `[clarified]` | Indie devs and writers waste minutes per day looking up "how do I convert X to Y" — Pandoc is powerful but has a learning curve, online converters are slow, opening an IDE for one-off conversions is overkill. |
| Current solutions | `[clarified]` | Pandoc (high friction, esoteric flags), online converters (slow, privacy-sketchy), copy-pasting then manually fixing. |
| Cost of not solving | `[clarified]` | ~5 min × ~3 conversions/week = 15 min/week of friction; not painful enough to motivate finding a solution, but pleasant when one exists. |
| Why now | `[clarified]` | Bun + esbuild make single-binary distribution trivial in 2025; previously CLI distribution was painful enough that this kind of tool didn't exist. |

## 2. Scope Discipline

| Item | Tag | Content |
|---|---|---|
| Smallest viable version | `[clarified]` | One binary, four conversions: pdf→md, docx→md, csv→json, json→csv. Run as `convert input output`. No flags. |
| Explicit cuts (NOT in v1) | `[clarified]` | No bulk operations, no presets, no history, no settings, no GUI, no auth, no telemetry, no auto-update. |
| 2-week test | `[clarified]` | Hard 2-week timeline; user committed. |
| Must-haves vs nice-to-haves | `[clarified]` | Must: 4 conversions work reliably. Nice: more formats, better error messages. Cuts: bulk, presets, settings. |

## 3. Success Definition

| Item | Tag | Content |
|---|---|---|
| Concrete success metric | `[clarified]` | 50 paying users at $5/month within 60 days of launch. |
| Leading indicator | `[clarified]` | Day-7 retention >40% (used at least 2x in week 1). |
| Lagging indicator | `[clarified]` | Conversion rate from try-once → paying user >5%. |
| Threshold for "continue vs kill" | `[clarified]` | <20 paying at 60 days = pivot or kill; >50 = double down. |

## 4. Users and Distribution

| Item | Tag | Content |
|---|---|---|
| First 10 users (named) | `[clarified]` | User's network of ~3000 dev followers on Twitter; specifically mentioning `@<friend1>`, `@<friend2>`, `@<friend3>` as guaranteed early users. |
| Discovery mechanism | `[clarified]` | Twitter launch post + Hacker News Show HN + ProductHunt (in that order, days apart). |
| Try-once trigger | `[clarified]` | "I needed to convert a PDF last week" reaction; demo video showing 4-second conversion. |
| Return trigger | `[clarified]` | Saved them time on the conversion they actually do; reliable enough to keep installed. |

## 5. Technical Assumptions

| Item | Tag | Content |
|---|---|---|
| Riskiest technical bet | `[clarified]` | PDF parsing — pdf-parse or pdfjs reliability on diverse real-world PDFs. |
| Hidden complexity | `[clarified]` | Edge cases in real-world docx and pdf files; Markdown output quality depends on input cleanliness. |
| Required data access | `[clarified]` | None — fully local, no API, no cloud. Privacy is a feature. |
| In/out scope | `[clarified]` | No auth, no payments in v1 (donation link or "pay what you want" via Lemonsqueezy in v1.5). |

## 6. Constraints

| Item | Tag | Content |
|---|---|---|
| Time budget | `[clarified]` | 2 weeks (hard) |
| Money budget | `[clarified]` | <$50/month operating; ideally $0 (no servers — local CLI) |
| Team | `[clarified]` | Solo |
| Platform | `[clarified]` | macOS first; Linux + Windows nice-to-have for v1 if Bun's cross-compilation is easy |
| Compliance / licensing | `[clarified]` | None — all local processing |

## 7. Existing State

| Item | Tag | Content |
|---|---|---|
| Existing assets | `[clarified]` | None — greenfield |
| Replacing prior work? | `[clarified]` | No |
| Prior attempt lessons | `[clarified]` | User has shipped 2 prior CLI tools — knows distribution pattern works |

## 8. Decision Rights

| Item | Tag | Content |
|---|---|---|
| Final approver | `[clarified]` | Just user (solo project) |
| Reversible vs one-way doors | `[clarified]` | Naming and distribution channels are one-way; stack and feature scope are reversible |
| Non-negotiables | `[clarified]` | Single binary, no setup, no telemetry, no cloud — these are the brand promise |

## Open Questions / Pushback Notes

None. Brief is clear across all dimensions.

## Intake's Self-Assessment

- Critical dimensions clear: yes (Problem Clarity, Scope Discipline, Success Definition all `[clarified]`)
- Total dimensions clear/clarified: 8/8
- Recommended next step: ready for Strategist

## Sign-off

User confirmed brief is correct: yes, 2025-09-15T10:18:00Z, "looks right"
