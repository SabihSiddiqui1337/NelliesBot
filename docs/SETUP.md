# Setup — and moving between machines

## What transfers, and what doesn't

| Thing | Where it lives | Moves with a clone? |
| --- | --- | --- |
| Source code | git | **Yes** |
| All research and decisions (`docs/`) | git | **Yes** |
| `.env` — Discord webhook, API keys | local disk, git-ignored | **No — recreate it** |
| `data/nellies.db` — price history | local disk, git-ignored | **No — rebuilds itself** |
| The Claude Code chat session | the machine it ran on | **No** |

The chat itself does not transfer, which is why every finding has been written
into `docs/` as it was discovered. A fresh session on any machine can read
`docs/RECON.md`, `docs/REQUIREMENTS.md` and `docs/ANALYSIS.md` and pick up cold
without re-deriving anything.

**The thing that actually loses work is uncommitted code**, not the chat. Push
before switching machines.

## On a new machine

```bash
git clone git@github-personal:SabihSiddiqui1337/NelliesBot.git
cd NelliesBot
npm install
cp .env.example .env    # then fill in DISCORD_WEBHOOK_URL
```

Requires **Node 22.5+** (24.x is what this is developed against) for built-in
`node:sqlite` and TypeScript type-stripping. No build step, no transpiler.

> On this setup, plain `git@github.com:` URLs fail with *Permission denied
> (publickey)* — there is no `Host github.com` entry in `~/.ssh/config`. Use the
> `github-personal` alias as above.

## Commands

| Command | What it does |
| --- | --- |
| `npm run ping` | Posts one test message to Discord. Verifies the webhook. |
| `npm run scan` | Full scan, prints the shortlist to the terminal. **Sends nothing.** |
| `npm run digest` | Same scan, posts the shortlist to Discord. |
| `npm test` | Cost-model tests. |
| `npm run typecheck` | Type check. |

Start with `npm run scan` after any change — it is the dry run.

## Tuning

Everything below is an env var, so no code change is needed to adjust:

| Var | Default | Meaning |
| --- | --- | --- |
| `MIN_RETAIL_PRICE` | `80` | Ignore lots under this suggested retail |
| `TARGET_MARGIN` | `2` | Profit as a multiple of cost. `2` = sell for 3x |
| `MIN_PROFIT` | `30` | Absolute floor, whatever the ratio says |
| `MAX_ALERTS` | `20` | Items per digest |
| `PAGES_PER_CATEGORY` | `3` | Scan depth. Higher = more coverage, slower |
| `NELLIS_SHOPPING_LOCATION_ID` | `5` | 5 = Houston. See `docs/RECON.md` for the rest |
| `NELLIS_WAREHOUSES` | `SW Houston,Katy` | Pickup locations to include |

## Scheduling (Windows)

Once the digest looks right, run it on a timer with Task Scheduler:

```powershell
$action  = New-ScheduledTaskAction -Execute "npm" -Argument "run digest" -WorkingDirectory "C:\Users\sabih.siddiqui\Desktop\Repo\NelliesBot"
$trigger = New-ScheduledTaskTrigger -Daily -At 9am
Register-ScheduledTask -TaskName "NelliesBot digest" -Action $action -Trigger $trigger
```

The machine has to be awake at that time. If that becomes a problem, a $5/mo
VPS or a GitHub Actions cron is the usual next step — Actions is free on a
public repo, with the webhook held as a repository secret.
