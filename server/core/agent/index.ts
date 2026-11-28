import type { Card } from '../../../shared/cards.js';
import { getConfig } from '../config.js';
import { instamartFor, type InstamartService, type RequestCtx } from '../instamart.js';
import { log } from '../log.js';
import { McpAuthError, McpToolError } from '../mcp/client.js';
import { NotFoundError } from '../lists.js';
import { OrderError } from '../order.js';
import { runLlmAgent } from './llm.js';
import { runRulesAgent } from './rules.js';
import { ToolUserError, type ToolEnv } from './tools.js';

export async function runAgent(
  ctx: RequestCtx,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }>,
): Promise<{ reply: string; cards: Card[] }> {
  let svc: InstamartService | null = null;
  const env: ToolEnv = { ctx, cards: [], svc: async () => (svc ??= await instamartFor(ctx)) };
  const cfg = getConfig();
  try {
    if (cfg.anthropicApiKey) {
      try {
        const reply = await runLlmAgent(env, message, history);
        return { reply, cards: env.cards };
      } catch (e) {
        if (e instanceof McpAuthError) throw e;
        log.error('agent.llm_failed', { message: (e as Error).message, requestId: ctx.requestId });
        env.cards.length = 0;
      }
    }
    const reply = await runRulesAgent(env, message);
    return { reply, cards: env.cards };
  } catch (e) {
    if (e instanceof McpAuthError) throw e;
    if (e instanceof ToolUserError || e instanceof NotFoundError || e instanceof OrderError || e instanceof McpToolError) {
      return { reply: e.message, cards: [...env.cards, { type: 'error', message: e.message }] };
    }
    throw e;
  }
}
