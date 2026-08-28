import type { FeedAdapter } from '$lib/feed-adapter';
import { register } from '$lib/feed-adapter';
import type { RawPost, EngagementEvent } from '$shared/types';
import { LINKEDIN } from './selectors';

function pickFeedList(): Element | null {
  // The feed is the role="list" under <main> with the most descendant listitems.
  const candidates = [...document.querySelectorAll(LINKEDIN.feedList)];
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) =>
      b.querySelectorAll(LINKEDIN.post).length - a.querySelectorAll(LINKEDIN.post).length
  );
  return candidates[0] ?? null;
}

function extractId(el: Element): string | null {
  // Scan every attribute on every descendant for an activity URN. LinkedIn
  // embeds these in tracking attributes, aria-labels, and deep URLs even
  // when no obvious `data-urn` is present.
  const scan = (target: Element): string | null => {
    for (const attr of target.attributes) {
      const m = attr.value.match(LINKEDIN.activityIdRegex);
      if (m) return `urn:li:activity:${m[1]}`;
    }
    return null;
  };
  const selfHit = scan(el);
  if (selfHit) return selfHit;
  for (const d of el.querySelectorAll('*')) {
    const hit = scan(d);
    if (hit) return hit;
  }

  // Content-hash fallback: author handle + first 200 chars of normalized text.
  // Stable across refreshes as long as the post text doesn't change.
  const { handle } = extractAuthor(el);
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return null;
  return `sp:${handle || 'unknown'}:${djb2(text)}`;
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function extractAuthor(el: Element): { handle: string; name: string } {
  // Prefer /in/ (people) links; fall back to /company/ for corporate/promoted posts.
  const inLinks = [...el.querySelectorAll('a[href*="/in/"]')] as HTMLAnchorElement[];
  const companyLinks = [...el.querySelectorAll('a[href*="/company/"]')] as HTMLAnchorElement[];
  const kind: 'in' | 'company' = inLinks.length > 0 ? 'in' : 'company';
  const links = inLinks.length > 0 ? inLinks : companyLinks;

  const primary = links[0];
  if (!primary) return { handle: '', name: '' };

  const rawHandle =
    primary.href.split(`/${kind}/`).pop()?.split('/')[0]?.split('?')[0] ?? '';
  const handle = decodeUriSafe(rawHandle);

  let name = '';
  for (const link of links) {
    const candidates = [
      link.textContent ?? '',
      link.getAttribute('aria-label') ?? '',
      link.querySelector('img[alt]')?.getAttribute('alt') ?? ''
    ];
    for (const raw of candidates) {
      const cleaned = cleanAuthorName(raw.replace(/\s+/g, ' ').trim());
      if (isPlausibleName(cleaned)) {
        name = cleaned;
        break;
      }
    }
    if (name) break;
  }

  return { handle, name };
}

function cleanAuthorName(s: string): string {
  // LinkedIn wraps author links in accessibility text. Strip the wrappers we've seen:
  //   "View <name>'s profile"           (ascii or typographic apostrophe)
  //   "View <name>' profile"            (name ends in s, e.g. "Marques'")
  //   "View <name>'s profile, hiring"   (trailing metadata)
  //   "View company: <name>"
  const profileMatch = s.match(/^View\s+(.+?)['\u2019]s?\s+profile(?:,.*)?$/i);
  if (profileMatch?.[1]) return profileMatch[1].trim();

  const companyMatch = s.match(/^View\s+company:\s+(.+)$/i);
  if (companyMatch?.[1]) return companyMatch[1].trim();

  return s;
}

function isPlausibleName(s: string): boolean {
  return s.length >= 2 && !/^(•|1st|2nd|3rd|3rd\+|Follow|Following)$/i.test(s);
}

function decodeUriSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function extractText(el: Element): string {
  // v1 heuristic: concatenate text nodes under the post, excluding button/link chrome.
  // Refine when we have real data to look at.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const chunks: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node.textContent?.trim();
    if (!t) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    if (tag === 'BUTTON' || tag === 'SCRIPT' || tag === 'STYLE') continue;
    chunks.push(t);
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function extractMedia(el: Element): RawPost['mediaTypes'] {
  const types: Array<'image' | 'video' | 'link' | 'document'> = [];
  if (el.querySelector('img[alt]:not([alt=""])')) types.push('image');
  if (el.querySelector('video')) types.push('video');
  if (el.querySelector('a[href*="/document/"], a[href*=".pdf"]')) types.push('document');
  if (el.querySelector('a[href^="http"]:not([href*="linkedin.com"])')) types.push('link');
  return types;
}

function isPostLike(el: Element): boolean {
  // Filter out listitems that aren't feed posts (nav items, reaction lists, etc.):
  // a real post has either an author link or a /posts/ URL, and some text content.
  const hasPostUrl = !!el.querySelector(LINKEDIN.postUrlLink);
  const hasAuthor = !!el.querySelector(LINKEDIN.authorLink);
  const textLen = (el.textContent ?? '').trim().length;
  return (hasPostUrl || hasAuthor) && textLen > 20;
}

function extractPost(el: Element): RawPost | null {
  if (!isPostLike(el)) return null;
  const id = extractId(el);
  if (!id) return null;
  const { handle, name } = extractAuthor(el);
  return {
    id,
    platform: 'linkedin',
    authorHandle: handle,
    authorName: name,
    text: extractText(el),
    mediaTypes: extractMedia(el),
    postedAt: null,
    element: el
  };
}

export const linkedinAdapter: FeedAdapter = {
  platform: 'linkedin',

  matches(url) {
    return /^https:\/\/(www\.)?linkedin\.com\/feed/.test(url);
  },

  observe(onPost) {
    const seen = new Set<string>();

    const handle = (el: Element) => {
      const post = extractPost(el);
      if (!post || seen.has(post.id)) return;
      seen.add(post.id);
      onPost(post);
    };

    const scan = (root: ParentNode) => {
      root.querySelectorAll(LINKEDIN.post).forEach(handle);
    };

    // Scan current feed, and anything that gets added later.
    scan(document);

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.(LINKEDIN.post)) handle(node);
          node.querySelectorAll?.(LINKEDIN.post).forEach(handle);
        }
      }
    });

    // Watch the whole document — the feed container can remount under
    // <main> as the SPA navigates.
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  },

  reorder(postIds) {
    const list = pickFeedList();
    if (!list) return;

    const elementsById = new Map<string, Element>();
    list.querySelectorAll(LINKEDIN.post).forEach(el => {
      const id = extractId(el);
      if (id) elementsById.set(id, el);
    });

    // Move matching listitems to the top of their parent, in order.
    // LinkedIn wraps each listitem in its own container; we reorder those wrappers.
    for (const id of postIds) {
      const el = elementsById.get(id);
      if (!el) continue;
      const wrapper = el.closest('[role="listitem"]') ?? el;
      if (wrapper.parentElement) wrapper.parentElement.appendChild(wrapper);
    }
  },

  observeEngagement(onEvent) {
    const click = (e: Event) => {
      const target = e.target as Element | null;
      const postEl = target?.closest(LINKEDIN.post);
      if (!postEl) return;
      const id = extractId(postEl);
      if (!id) return;
      const event: EngagementEvent = {
        postId: id,
        kind: 'click',
        at: new Date().toISOString()
      };
      onEvent(event);
    };
    document.addEventListener('click', click, true);
    return () => document.removeEventListener('click', click, true);
  }
};

register(linkedinAdapter);
