/** Claude-powered agent loop (server-side only). */
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';
import { getLists } from '../lists.js';
import { log } from '../log.js';
import { TOOL_SCHEMAS, toolImpls, ToolUserError, type ToolEnv, type ToolName } from './tools.js';
import { McpAuthError, McpToolError } from '../mcp/client.js';
import { OrderError } from '../order.js';

const MAX_TURNS = 8;

const SYSTEM = `You are "Lists Assistant", a grocery list helper inside Instamart Lists, an independent app that uses Swiggy Instamart's service. You are not an official Swiggy app.

What you can do: create named grocery lists, edit them, show them, and prepare an order for a list (bill preview). You CANNOT place orders: only the user can, by tapping "Confirm order" on the bill card. Never say an order was placed.

Rules:
- Use tools. For "create/make a list" call draft_list with each item as a separate entry (query, quantity, size if stated). For edits call edit_list. To order call prepare_order.
- Lists are referred to by badge (L1, L2) or name. Budgets are in ₹ ("keep it under ₹150" -> budget 150).
- Only state prices, availability, fees and delivery estimates that came from a tool result in this conversation. Never invent or estimate them. If unsure, say so.
- The UI shows cards for tool results, so keep replies to one or two short sentences and do not list items, prices or bill lines again.
- If a request is unrelated to groceries, answer briefly and steer back.
- Always write "Instamart" and "Swiggy" with that exact spelling.`;

export async function runLlmAgent(env: ToolEnv, message: string, history: Array<{ role: 'user' | 'assistant'; text: string }>): Promise<string> {
  const cfg = getConfig();
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey! });
  const lists = await getLists(env.ctx.storage, env.ctx.uid);
  const listSummary = lists.length
    ? lists.map((l) => `${l.badge} "${l.name}" (${l.items.length} items${l.budget ? `, budget ₹${l.budget}` : ''})`).join('; ')
    : 'none yet';

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.MessageParam),
    { role: 'user', content: `${message}\n\n[context: saved lists: ${listSummary}]` },
  ];
  // The API requires the first message to be from the user.
  while (messages.length && messages[0].role !== 'user') messages.shift();

  let finalText = '';
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model: cfg.anthropicModel,
      max_tokens: 1024,
      system: SYSTEM,
      tools: TOOL_SCHEMAS as unknown as Anthropic.Tool[],
      messages,
    });
    const texts = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text);
    if (texts.length) finalText = texts.join('\n').trim();
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) break;

    messages.push({ role: 'assistant', content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const impl = (toolImpls as Record<string, (env: ToolEnv, a: any) => Promise<unknown>>)[use.name as ToolName];
      try {
        if (!impl) throw new ToolUserError(`Unknown tool ${use.name}`);
        const out = await impl(env, use.input ?? {});
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(out).slice(0, 8000) });
      } catch (e) {
        if (e instanceof McpAuthError) throw e;
        const msg = e instanceof ToolUserError || e instanceof McpToolError || e instanceof OrderError ? e.message : 'Tool failed';
        if (!(e instanceof ToolUserError)) log.warn('agent.tool_error', { tool: use.name, message: (e as Error).message, requestId: env.ctx.requestId });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return finalText || 'Done.';
}
