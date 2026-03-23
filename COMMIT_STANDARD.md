# Commit Message Standard — Chibitek Labs

All commits across Chibitek repositories follow this convention.

## Format

```
<type>(<scope>): <short description>

[optional body — what changed and why]

[optional footer — issue references, breaking changes]
```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `chore` | Maintenance, dependency updates, config changes |
| `cost` | Cost or billing-related changes (model routing, token usage, API tiers) |
| `ai` | AI model changes, prompt updates, agent logic |
| `infra` | Infrastructure, CI/CD, deployment, environment changes |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `style` | Formatting, whitespace — no logic change |

## Scope (optional)

Use the affected area: `auth`, `api`, `ui`, `db`, `agent`, `webhook`, `billing`, etc.

## Examples

```
feat(agent): add Kira fallback routing for Gemini failures

fix(auth): resolve token refresh race condition on mobile

docs: update API integration guide for Mochii v2

cost(routing): switch low-priority tasks to Haiku 4.5

ai(kira): update system prompt for compliance-first tone

infra(ci): add staging deploy workflow on PR merge

chore(deps): upgrade Supabase client to 2.x
```

## Issue References

Reference issues in the footer to trigger auto-close on merge:

```
fix(billing): correct invoice total rounding error

Closes #42
Fixes #38
```

## Rules

1. Subject line: 72 characters max
2. Use imperative mood ("add" not "added", "fix" not "fixed")
3. No period at end of subject line
4. Separate subject from body with a blank line
5. Reference all related issues in footer
6. `cost` and `ai` types trigger special tracking — use them accurately

---

_Chibitek Labs — last updated 2026-03-23_
