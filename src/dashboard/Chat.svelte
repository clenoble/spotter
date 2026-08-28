<script lang="ts">
  import { tick } from 'svelte';
  import { putPreferences } from '$lib/store/db';
  import { applyOps } from '$lib/preference/schema';
  import type { PreferenceDoc, PrefOp, PrefListField } from '$shared/types';
  import type { ChatRequest, ChatResponse } from '$shared/messages';

  type Message = {
    role: 'user' | 'assistant';
    content: string;
    proposal?: {
      ops: PrefOp[];
      basis: PreferenceDoc;
      status: 'pending' | 'accepted' | 'rejected';
    };
  };

  let messages = $state<Message[]>([]);
  let input = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let scroller: HTMLElement;

  const FIELD_LABEL: Record<PrefListField, string> = {
    topicsMore: 'Topics I want more of',
    topicsLess: 'Topics I want less of',
    tonePreferences: 'Tone preferences',
    authorsBoost: 'Authors to boost',
    authorsMute: 'Authors to mute',
    customRules: 'Custom rules'
  };

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    input = '';
    error = null;
    messages = [...messages, { role: 'user', content: text }];
    sending = true;
    await tick();
    scrollDown();

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const req: ChatRequest = { type: 'spotter:chat', history };
      const res = (await chrome.runtime.sendMessage(req)) as ChatResponse | undefined;
      if (!res) throw new Error('no response from background');
      if (!res.ok) {
        error = res.error;
        return;
      }
      const reply: Message = {
        role: 'assistant',
        content: res.reply,
        proposal:
          res.ops.length > 0
            ? { ops: res.ops, basis: res.currentPrefs, status: 'pending' }
            : undefined
      };
      messages = [...messages, reply];
      await tick();
      scrollDown();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      sending = false;
    }
  }

  async function accept(idx: number) {
    const msg = messages[idx];
    if (!msg.proposal || msg.proposal.status !== 'pending') return;
    const next = applyOps(msg.proposal.basis, msg.proposal.ops);
    await putPreferences(next);
    messages = messages.map((m, i) =>
      i === idx && m.proposal
        ? { ...m, proposal: { ...m.proposal, status: 'accepted' as const } }
        : m
    );
  }

  function reject(idx: number) {
    const msg = messages[idx];
    if (!msg.proposal || msg.proposal.status !== 'pending') return;
    messages = messages.map((m, i) =>
      i === idx && m.proposal
        ? { ...m, proposal: { ...m.proposal, status: 'rejected' as const } }
        : m
    );
  }

  function scrollDown() {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function groupOps(ops: PrefOp[]) {
    const by = new Map<PrefListField, { adds: string[]; removes: string[] }>();
    for (const op of ops) {
      if (!by.has(op.field)) by.set(op.field, { adds: [], removes: [] });
      const entry = by.get(op.field)!;
      if (op.op === 'add') entry.adds.push(op.value);
      else entry.removes.push(op.value);
    }
    return [...by.entries()];
  }
</script>

<div class="chat">
  <div class="messages" bind:this={scroller}>
    {#if messages.length === 0}
      <div class="empty">
        <p>Tell Spotter what you want more or less of in your feed.</p>
        <ul>
          <li>"Less motivational posts, more long-form technical writing."</li>
          <li>"I want fewer recruitment pitches."</li>
          <li>"Boost posts from Marcel Salathé."</li>
        </ul>
        <p class="small">
          Every proposed change to your preference document is yours to accept
          or reject — nothing is saved silently.
        </p>
      </div>
    {/if}

    {#each messages as m, i (i)}
      <div class="msg {m.role}">
        <div class="bubble">{m.content}</div>
        {#if m.proposal}
          <div class="proposal" data-status={m.proposal.status}>
            <div class="proposal-header">
              <strong>Proposed changes</strong>
              {#if m.proposal.status === 'accepted'}
                <span class="status accepted">accepted</span>
              {:else if m.proposal.status === 'rejected'}
                <span class="status rejected">rejected</span>
              {/if}
            </div>
            <ul class="ops">
              {#each groupOps(m.proposal.ops) as [field, entry] (field)}
                <li>
                  <div class="field">{FIELD_LABEL[field]}</div>
                  {#each entry.adds as v (v)}
                    <div class="op add">+ {v}</div>
                  {/each}
                  {#each entry.removes as v (v)}
                    <div class="op remove">− {v}</div>
                  {/each}
                </li>
              {/each}
            </ul>
            {#if m.proposal.status === 'pending'}
              <div class="actions">
                <button class="accept" onclick={() => accept(i)}>Accept</button>
                <button class="reject" onclick={() => reject(i)}>Reject</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if sending}
      <div class="msg assistant">
        <div class="bubble thinking">Thinking…</div>
      </div>
    {/if}

    {#if error}
      <div class="error">
        <strong>Error:</strong> {error}
      </div>
    {/if}
  </div>

  <div class="composer">
    <textarea
      bind:value={input}
      onkeydown={onKeydown}
      placeholder="Tell Spotter what to show more or less of…"
      rows="2"
      disabled={sending}
    ></textarea>
    <button onclick={send} disabled={sending || !input.trim()}>Send</button>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 230px);
    min-height: 400px;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .empty {
    color: color-mix(in srgb, CanvasText 70%, transparent);
    font-size: 0.9rem;
    padding: 1rem 1.25rem;
    border: 1px dashed color-mix(in srgb, CanvasText 15%, transparent);
    border-radius: 8px;
  }
  .empty ul {
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  .empty li {
    margin: 0.25rem 0;
  }
  .empty .small {
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 55%, transparent);
  }

  .msg {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 85%;
  }
  .msg.user {
    align-self: flex-end;
    align-items: flex-end;
  }
  .msg.assistant {
    align-self: flex-start;
  }
  .bubble {
    padding: 0.55rem 0.9rem;
    border-radius: 12px;
    font-size: 0.92rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .msg.user .bubble {
    background: var(--spotter-accent);
    color: white;
    border-bottom-right-radius: 4px;
  }
  .msg.assistant .bubble {
    background: color-mix(in srgb, CanvasText 8%, transparent);
    border-bottom-left-radius: 4px;
  }
  .bubble.thinking {
    font-style: italic;
    opacity: 0.7;
  }

  .proposal {
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, CanvasText 4%, transparent);
    font-size: 0.88rem;
    min-width: 320px;
  }
  .proposal[data-status='accepted'] {
    border-color: color-mix(in srgb, #22c55e 60%, transparent);
    background: color-mix(in srgb, #22c55e 10%, transparent);
  }
  .proposal[data-status='rejected'] {
    opacity: 0.55;
  }
  .proposal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
  }
  .status {
    font-size: 0.72rem;
    padding: 0.12rem 0.55rem;
    border-radius: 4px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .status.accepted {
    background: #22c55e;
    color: white;
  }
  .status.rejected {
    background: color-mix(in srgb, CanvasText 20%, transparent);
    color: inherit;
  }
  .ops {
    list-style: none;
    padding: 0;
    margin: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .field {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: color-mix(in srgb, CanvasText 60%, transparent);
    margin-bottom: 0.3rem;
  }
  .op {
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.84rem;
    line-height: 1.4;
    margin: 0.15rem 0;
  }
  .op.add {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    color: #14532d;
  }
  .op.remove {
    background: color-mix(in srgb, #ef4444 15%, transparent);
    color: #7f1d1d;
    text-decoration: line-through;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .actions button {
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .actions .accept {
    background: #22c55e;
    border-color: #22c55e;
    color: white;
  }
  .actions .reject:hover {
    background: color-mix(in srgb, CanvasText 8%, transparent);
  }

  .error {
    padding: 0.75rem 1rem;
    border: 1px solid #ef4444;
    border-radius: 6px;
    color: #b91c1c;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    font-size: 0.9rem;
  }

  .composer {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
  }
  .composer textarea {
    flex: 1;
    font: inherit;
    resize: vertical;
    padding: 0.55rem 0.75rem;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 6px;
    background: Canvas;
    color: inherit;
    min-height: 2.5rem;
  }
  .composer textarea:focus {
    outline: 2px solid var(--spotter-accent);
    outline-offset: -1px;
    border-color: transparent;
  }
  .composer button {
    padding: 0 1.5rem;
    border: none;
    border-radius: 6px;
    background: var(--spotter-accent);
    color: white;
    font: inherit;
    cursor: pointer;
    min-width: 80px;
  }
  .composer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
