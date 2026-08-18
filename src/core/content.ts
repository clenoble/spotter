/**
 * The source a piece of content came from. Grows with each `SourceAdapter`.
 * `web` is what retrieval returns — a document at a URL, which since v0.7 is
 * the ordinary case rather than the exotic one.
 */
export type Platform = 'linkedin' | 'web';

/**
 * Host-agnostic content the engine scores. The platform layer maps its raw
 * post (which carries a DOM `element`) into this pure shape; nothing under
 * `core/` references the DOM or `chrome.*`, so the engine runs equally in the
 * extension and in a headless eval harness.
 */
export interface Content {
  id: string;
  platform: Platform;
  authorHandle: string;
  authorName: string;
  text: string;
  mediaTypes: ReadonlyArray<'image' | 'video' | 'link' | 'document'>;
  postedAt: string | null;
}
