import type { RawPost, EngagementEvent, Platform } from '$shared/types';

export interface FeedAdapter {
  readonly platform: Platform;

  matches(url: string): boolean;

  observe(onPost: (post: RawPost) => void): () => void;

  reorder(postIds: readonly string[]): void;

  observeEngagement(onEvent: (event: EngagementEvent) => void): () => void;
}

const registry: FeedAdapter[] = [];

export function register(adapter: FeedAdapter): void {
  registry.push(adapter);
}

export function adapterFor(url: string): FeedAdapter | null {
  return registry.find(a => a.matches(url)) ?? null;
}

export function registered(): readonly FeedAdapter[] {
  return registry;
}
