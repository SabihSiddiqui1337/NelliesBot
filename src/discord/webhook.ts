import type { Embed } from './format.ts';

const MAX_EMBEDS_PER_MESSAGE = 10;

/** Posts to a Discord incoming webhook, respecting its rate limits. */
export class DiscordWebhook {
  private readonly url: string;

  constructor(url: string) {
    if (!url || !/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
      throw new Error('DISCORD_WEBHOOK_URL is missing or is not a Discord webhook URL');
    }
    this.url = url;
  }

  private async post(payload: unknown, attempt = 0): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429 && attempt < 4) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
      await new Promise((r) => setTimeout(r, waitMs));
      return this.post(payload, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`Discord webhook failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }
  }

  async sendText(content: string): Promise<void> {
    await this.post({ content: content.slice(0, 2000), allowed_mentions: { parse: [] } });
  }

  /** Discord caps a message at 10 embeds, so batches are chunked. */
  async sendEmbeds(embeds: Embed[], leadContent?: string): Promise<void> {
    for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
      const chunk = embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE);
      await this.post({
        ...(i === 0 && leadContent ? { content: leadContent.slice(0, 2000) } : {}),
        embeds: chunk,
        allowed_mentions: { parse: [] },
      });
      if (i + MAX_EMBEDS_PER_MESSAGE < embeds.length) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
}
