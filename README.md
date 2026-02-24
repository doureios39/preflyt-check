# preflyt-check

Pre-deployment security scanner for your deploy pipeline. Scans your live site for exposed `.env` files, open database ports, missing security headers, and other misconfigurations -- in under 30 seconds, with zero dependencies.

## Quick start

```bash
npx preflyt-check https://mysite.com
```

No install needed. No signup needed. 3 free scans.

## With a Pro API key

```bash
npx preflyt-check https://mysite.com --key sk_live_xxx
```

Get your Pro key at [preflyt.dev/pricing](https://preflyt.dev/pricing) for unlimited scans.

## Options

| Flag | Description |
|---|---|
| `--key`, `-k` | Pro API key for unlimited scans |
| `--fail` | Exit code 1 if issues found (default: off) |
| `--fail-on <level>` | Minimum severity to fail on: `high`, `medium`, `low` (default: `high`) |
| `--quiet`, `-q` | Minimal output, just pass/fail |
| `--json` | Output raw JSON instead of formatted text |
| `--share` | Generate a shareable report link (valid 30 days) |
| `--timeout <sec>` | Scan timeout in seconds (default: 60) |
| `--help`, `-h` | Show usage |

## Exit codes

Preflyt will never block your deploy due to our own errors. Exit code 1 only occurs when you explicitly use `--fail` and real issues are confirmed.

| Exit code | When |
|---|---|
| `0` | Scan clean, scan errored, timed out, API unreachable, limit reached, or `--fail` not set |
| `1` | `--fail` set AND scan succeeded AND findings match `--fail-on` severity |

## Integration

### AI coding agents (recommended)

Add the skill file to your project and your agent runs a scan after every deploy:

```bash
curl -o SKILL.md https://preflyt.dev/skill.md
```

Or tell your agent directly: "After deploying, run `npx preflyt-check <deployed-url>`"

### Git hook (auto-scan on push)

```bash
#!/bin/bash
# .git/hooks/post-receive
cd /home/myapp
git checkout -f
npm run build
pm2 restart app
sleep 5
npx preflyt-check https://mysite.com
```

### GitHub Actions

```yaml
# .github/workflows/preflyt.yml
name: Preflyt Scan
on:
  deployment_status:
jobs:
  scan:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - run: npx preflyt-check ${{ vars.PRODUCTION_URL }}
```

### Shareable reports

```bash
npx preflyt-check https://mysite.com --share
```

Generates a public report URL you can share with your team or post anywhere. Reports expire after 30 days.

For detailed setup instructions, see the [integration guide](https://preflyt.dev/integrate).

## Programmatic usage

```javascript
const { scan } = require("preflyt-check");

const result = await scan("https://mysite.com", {
  apiKey: "sk_live_xxx", // optional
  timeout: 60,           // optional, seconds
});

console.log(result.status);       // "clean" | "issues_found" | "error"
console.log(result.total_issues); // number
console.log(result.findings);     // array of { title, severity, category }
```

## What it checks

- Exposed .env, .git, backup files, source maps, phpinfo
- Open database ports (MySQL, PostgreSQL, MongoDB, Redis)
- Exposed dev servers and admin tools
- Missing security headers (HSTS, CSP, X-Frame-Options)
- CORS misconfiguration
- Insecure cookies
- Server version leakage

## Zero dependencies

This package uses only Node.js built-in modules. No `node_modules` tree, no supply chain risk, instant install.

## Links

- Website: [preflyt.dev](https://preflyt.dev)
- Pricing: [preflyt.dev/pricing](https://preflyt.dev/pricing)
- Integration guide: [preflyt.dev/integrate](https://preflyt.dev/integrate)
- Command checker: [preflyt.dev/terminal](https://preflyt.dev/terminal)
