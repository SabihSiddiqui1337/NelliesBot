import type { Embed } from './format.ts';

/**
 * Discord's documented ceiling is 10 embeds per message, but it returns a 500
 * consistently on batches of 10 of these embeds — each one carries an external
 * thumbnail — while accepting the very same embeds one at a time. Measured
 * against the live webhook, 4 is reliable. This is below the documented limit
 * on purpose; raising it back to 10 reintroduces the failure.
 */
const MAX_EMBEDS_PER_MESSAGE = 4;
const MAX_ATTEMPTS = 4;

/** The subset of Discord's message object we care about confirming. */
interface DeliveredMessage {
  id: string;
  channel_id: string;
  content: string;
  embeds?: unknown[];
}

/** Posts to a Discord incoming webhook, respecting its rate limits. */
export class DiscordWebhook {
  private readonly url: string;

  constructor(url: string) {
    if (!url || !/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
      throw new Error('DISCORD_WEBHOOK_URL is missing or is not a Discord webhook URL');
    }
    this.url = url;
  }

  /**
   * Posts with `?wait=true` so Discord returns the created message instead of a
   * bare 204. Without it a webhook call can be accepted and still deliver
   * nothing visible, and the caller happily reports success — which is exactly
   * what happened on the first digest run. The echoed message is the only
   * proof the content actually landed.
   */
  private async post(payload: unknown, attempt = 0): Promise<DeliveredMessage | null> {
    const res = await fetch(`${this.url}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
      await new Promise((r) => setTimeout(r, waitMs));
      return this.post(payload, attempt + 1);
    }

    // Discord returns 500 intermittently on embed-heavy payloads. Retrying
    // usually clears it; the digest should not die because one call blipped.
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, Math.min(6000, 800 * 2 ** attempt)));
      return this.post(payload, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`Discord webhook failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }

    return (await res.json().catch(() => null)) as DeliveredMessage | null;
  }

  async sendText(content: string): Promise<void> {
    await this.post({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } });
  }

  /** Discord's hard limits. Exceeding them is rejected, not truncated. */
  private static readonly MAX_TOTAL_CHARS = 6000;

  /** Rough character weight of an embed, matching how Discord counts it. */
  private static embedSize(e: Embed): number {
    const fields = e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    return e.title.length + (e.description?.length ?? 0) + (e.footer?.text.length ?? 0) + fields;
  }

  /**
   * Sends embeds in batches, chunked by BOTH of Discord's limits: at most 10
   * embeds per message, and at most 6000 characters across them. The character
   * cap is the one that bites — these embeds carry a long provenance footer, so
   * ten of them can blow the limit even though the count is legal.
   *
   * Returns the number of embeds Discord confirmed back, which the caller
   * should compare against what it sent.
   */
  async sendEmbeds(embeds: Embed[], leadContent?: string): Promise<number> {
    const batches: Embed[][] = [];
    let batch: Embed[] = [];
    let chars = 0;

    for (const e of embeds) {
      const size = DiscordWebhook.embedSize(e);
      const wouldOverflow =
        batch.length >= MAX_EMBEDS_PER_MESSAGE ||
        chars + size > DiscordWebhook.MAX_TOTAL_CHARS;
      if (batch.length && wouldOverflow) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(e);
      chars += size;
    }
    if (batch.length) batches.push(batch);

    let confirmed = 0;
    for (const [i, chunk] of batches.entries()) {
      const content = i === 0 && leadContent ? leadContent.slice(0, 2000) : undefined;
      try {
        const msg = await this.post({
          ...(content ? { content } : {}),
          embeds: chunk,
          allowed_mentions: { parse: [] },
        });
        confirmed += msg?.embeds?.length ?? 0;
      } catch (err) {
        // A whole batch failing should not cost every listing in it. Fall back
        // to one embed per message so a single unpalatable item is the only
        // thing lost, and say which one.
        console.warn(
          `batch of ${chunk.length} rejected (${(err as Error).message}) — retrying individually`,
        );
        if (content) await this.sendText(content).catch(() => {});
        for (const e of chunk) {
          try {
            const msg = await this.post({ embeds: [e], allowed_mentions: { parse: [] } });
            confirmed += msg?.embeds?.length ?? 0;
          } catch (inner) {
            console.warn(`  dropped embed "${e.title}": ${(inner as Error).message}`);
          }
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 1200));
    }
    return confirmed;
  }
}
