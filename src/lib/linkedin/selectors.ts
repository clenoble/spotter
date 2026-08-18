// LinkedIn's CSS classes are content-hashed and rotate constantly (e.g. `_0fa019c7`).
// ARIA roles are preserved for accessibility — they are our stable anchors.
export const LINKEDIN = {
  // The feed is a role="list" inside <main>. LinkedIn has other role="list" nodes
  // (nav, reactions, etc.); the feed is the largest one by descendant listitem count.
  feedList: 'main div[role="list"]',

  // Each post wraps in role="listitem" somewhere inside the feed list (not a direct child).
  post: 'div[role="listitem"]',

  // Post canonical URL: LinkedIn renders a /posts/HANDLE_SLUG-activity-NNNN-XXXX link.
  postUrlLink: 'a[href*="/posts/"]',

  // Author: link to /in/HANDLE/ for people, or /company/HANDLE/ for corporate posts.
  authorLink: 'a[href*="/in/"], a[href*="/company/"]',

  // Pattern to extract numeric activity ID from various LinkedIn URL shapes.
  // Matches: activity-1234567890123456789-XXXX | urn:li:activity:1234 | urn%3Ali%3Aactivity%3A1234
  activityIdRegex: /activity[-:%3A]+(\d+)/i
} as const;
