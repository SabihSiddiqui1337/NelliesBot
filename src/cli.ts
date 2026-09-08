import { loadConfig } from './config.ts';
import { NellisClient } from './nellis/client.ts';
import { Store } from './store/db.ts';
import { DiscordWebhook } from './discord/webhook.ts';
import { candidateEmbed, digestHeader } from './discord/format.ts';
import { scan } from './jobs/digest.ts';

const command = process.argv[2] ?? 'scan';

async function main(): Promise<void> {
  const cfg = loadConfig();

  switch (command) {
    case 'ping': {
      const hook = new DiscordWebhook(cfg.webhookUrl);
      await hook.sendText(
        '✅ **NelliesBot connected.** This is a one-off test of the webhook — no listings in this message.',
      );
      console.log('sent test message to Discord');
      break;
    }

    // Posts a single listing so a format change can be eyeballed in Discord
    // without spamming the channel with twenty of them.
    case 'demo': {
      const client = new NellisClient();
      const store = new Store(cfg.dbPath);
      try {
        const result = await scan(cfg, client, store);
        const best = result.candidates[0];
        if (!best) {
          console.log('nothing cleared the filters — no demo to send');
          break;
        }
        const hook = new DiscordWebhook(cfg.webhookUrl);
        const confirmed = await hook.sendEmbeds(
          [candidateEmbed(best)],
          '**Format preview** — one listing only.',
        );
        console.log(
          confirmed === 1
            ? `sent demo: ${best.product.title}`
            : `WARNING: Discord confirmed ${confirmed} embeds, expected 1`,
        );
      } finally {
        store.close();
      }
      break;
    }

    case 'scan':
    case 'digest': {
      const dryRun = command === 'scan';
      const client = new NellisClient();
      const store = new Store(cfg.dbPath);
      try {
        const result = await scan(cfg, client, store);
        const top = result.candidates.slice(0, cfg.maxAlerts);
        const flagged = top.filter((c) => c.condition.verdict === 'flag').length;

        console.log(
          `\nscanned ${result.scanned} local lots · ${result.candidates.length} cleared filters · showing ${top.length}`,
        );
        for (const c of top) {
          console.log(
            `  ${String(c.economics.profitAtCurrentBid).padStart(8)} profit  ` +
              `bid ${String(c.product.currentPrice).padStart(6)} / max ${String(c.economics.maxBid).padStart(7)}  ` +
              `${c.product.title.slice(0, 60)}`,
          );
        }
        console.log('db:', store.stats());

        if (dryRun) {
          console.log('\n(dry run — nothing sent to Discord. Use `npm run digest` to post.)');
        } else if (top.length === 0) {
          const hook = new DiscordWebhook(cfg.webhookUrl);
          await hook.sendText(
            `🔨 **Nellis Houston** — scanned ${result.scanned.toLocaleString()} lots, nothing cleared the filters today.`,
          );
        } else {
          const hook = new DiscordWebhook(cfg.webhookUrl);
          const confirmed = await hook.sendEmbeds(
            top.map(candidateEmbed),
            digestHeader({
              scanned: result.scanned,
              candidates: result.candidates.length,
              shown: top.length,
              flagged,
            }),
          );
          // Discord can accept a webhook call and still deliver nothing, so
          // trust the echoed message rather than the HTTP status.
          if (confirmed < top.length) {
            console.warn(
              `WARNING: sent ${top.length} embeds but Discord confirmed only ${confirmed}`,
            );
            process.exitCode = 1;
          } else {
            console.log(`Discord confirmed ${confirmed}/${top.length} embeds delivered`);
          }
        }
      } finally {
        store.close();
      }
      break;
    }

    case 'settle': {
      console.log('settle: not implemented yet — see docs/ANALYSIS.md');
      break;
    }

    default:
      console.error(`unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
