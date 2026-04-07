import type { Post, Comment, SortMode, CommentSort, TimeFilter } from "./types";

/**
 * Relative time formatting: "just now", "2m ago", "3h ago", "5d ago", "2mo ago", "1y ago"
 */
export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${String(days)}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${String(months)}mo ago`;

  const years = Math.floor(months / 12);
  return `${String(years)}y ago`;
}

/**
 * Format date for cake day display (e.g. "March 15, 2025")
 */
export function formatCakeDay(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Calculate karma for a user (sum of post upvotes-downvotes + comment upvotes-downvotes)
 */
export function calculateKarma(posts: Post[], comments: Comment[], userId: string): number {
  let karma = 0;

  for (const post of posts) {
    if (post.authorId === userId) {
      karma += post.upvotes - post.downvotes;
    }
  }

  for (const comment of comments) {
    if (comment.authorId === userId) {
      karma += comment.upvotes - comment.downvotes;
    }
  }

  return karma;
}

/**
 * Hot ranking algorithm (based on Reddit's actual algorithm)
 * Score = log10(max(|score|, 1)) + sign(score) * seconds / 45000
 */
export function hotScore(upvotes: number, downvotes: number, createdAt: number): number {
  const score = upvotes - downvotes;
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  // Reddit epoch: December 8, 2005 7:46:43 AM UTC
  const redditEpoch = 1134028003;
  const seconds = createdAt / 1000 - redditEpoch;
  return order + (sign * seconds) / 45000;
}

/**
 * Controversial score: posts with similar up and down votes
 * Score = (upvotes + downvotes) * min(upvotes, downvotes) / max(upvotes, downvotes)
 */
export function controversialScore(upvotes: number, downvotes: number): number {
  const total = upvotes + downvotes;
  if (total === 0) return 0;
  const maxVotes = Math.max(upvotes, downvotes);
  if (maxVotes === 0) return 0;
  const minVotes = Math.min(upvotes, downvotes);
  return (total * minVotes) / maxVotes;
}

/**
 * Filter posts by time window
 */
export function filterByTime(posts: Post[], filter: TimeFilter): Post[] {
  if (filter === "all") return posts;

  const now = Date.now();
  let cutoff: number;

  switch (filter) {
    case "hour":
      cutoff = now - 60 * 60 * 1000;
      break;
    case "today":
      cutoff = now - 24 * 60 * 60 * 1000;
      break;
    case "week":
      cutoff = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case "month":
      cutoff = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case "year":
      cutoff = now - 365 * 24 * 60 * 60 * 1000;
      break;
  }

  return posts.filter((p) => p.createdAt >= cutoff);
}

/**
 * Sort posts by different modes
 */
export function sortPosts(posts: Post[], mode: SortMode, timeFilter: TimeFilter): Post[] {
  const filtered =
    mode === "top" || mode === "controversial" ? filterByTime(posts, timeFilter) : posts;
  const sorted = [...filtered];

  switch (mode) {
    case "hot":
      sorted.sort(
        (a, b) =>
          hotScore(b.upvotes, b.downvotes, b.createdAt) -
          hotScore(a.upvotes, a.downvotes, a.createdAt),
      );
      break;
    case "new":
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "top":
      sorted.sort((a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes));
      break;
    case "rising": {
      // Rising: newer posts with high velocity of upvotes
      // Approximation: score / age_in_hours, favoring newer posts
      const now = Date.now();
      sorted.sort((a, b) => {
        const ageA = Math.max((now - a.createdAt) / (1000 * 60 * 60), 0.1);
        const ageB = Math.max((now - b.createdAt) / (1000 * 60 * 60), 0.1);
        const rateA = (a.upvotes - a.downvotes) / ageA;
        const rateB = (b.upvotes - b.downvotes) / ageB;
        return rateB - rateA;
      });
      break;
    }
    case "controversial":
      sorted.sort(
        (a, b) =>
          controversialScore(b.upvotes, b.downvotes) - controversialScore(a.upvotes, a.downvotes),
      );
      break;
  }

  return sorted;
}

/**
 * Sort comments by different modes
 */
export function sortComments(comments: Comment[], mode: CommentSort): Comment[] {
  const sorted = [...comments];

  switch (mode) {
    case "best": {
      // Wilson score confidence interval lower bound
      // Simplified: considers ratio and volume
      sorted.sort((a, b) => {
        const totalA = a.upvotes + a.downvotes;
        const totalB = b.upvotes + b.downvotes;
        if (totalA === 0 && totalB === 0) return 0;
        if (totalA === 0) return 1;
        if (totalB === 0) return -1;
        const ratioA = a.upvotes / totalA;
        const ratioB = b.upvotes / totalB;
        // Wilson lower bound approximation
        const wilsonA = ratioA - 1.96 * Math.sqrt((ratioA * (1 - ratioA)) / totalA);
        const wilsonB = ratioB - 1.96 * Math.sqrt((ratioB * (1 - ratioB)) / totalB);
        return wilsonB - wilsonA;
      });
      break;
    }
    case "top":
      sorted.sort((a, b) => b.upvotes - b.downvotes - (a.upvotes - a.downvotes));
      break;
    case "new":
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "controversial":
      sorted.sort(
        (a, b) =>
          controversialScore(b.upvotes, b.downvotes) - controversialScore(a.upvotes, a.downvotes),
      );
      break;
    case "old":
      sorted.sort((a, b) => a.createdAt - b.createdAt);
      break;
  }

  return sorted;
}

/**
 * Escape HTML characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Simple markdown to HTML string renderer.
 * Handles: **bold**, *italic*, [links](url), `code`, ```code blocks```,
 * - lists, > quotes, # headings
 * Sanitizes HTML first to prevent XSS.
 */
export function renderMarkdown(text: string): string {
  // First escape HTML
  let html = escapeHtml(text);

  // Process fenced code blocks (```...```)
  html = html.replace(
    /```([^`]*?)```/g,
    (_match, code: string) => `<pre><code>${code}</code></pre>`,
  );

  // Process inline code (`...`)
  html = html.replace(/`([^`]+?)`/g, (_match, code: string) => `<code>${code}</code>`);

  // Process bold (**...**)
  html = html.replace(/\*\*(.+?)\*\*/g, (_match, content: string) => `<strong>${content}</strong>`);

  // Process italic (*...*)
  html = html.replace(/\*(.+?)\*/g, (_match, content: string) => `<em>${content}</em>`);

  // Process links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, linkText: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`,
  );

  // Process lines for blockquotes, lists, and headings
  const lines = html.split("\n");
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    // Headings
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1];
      const content = headingMatch[2];
      if (level !== undefined && content !== undefined) {
        if (inList) {
          processedLines.push("</ul>");
          inList = false;
        }
        processedLines.push(`<h${String(level.length)}>${content}</h${String(level.length)}>`);
        continue;
      }
    }

    // Blockquotes
    const quoteMatch = /^&gt;\s?(.*)$/.exec(line);
    if (quoteMatch) {
      const content = quoteMatch[1];
      if (content !== undefined) {
        if (inList) {
          processedLines.push("</ul>");
          inList = false;
        }
        processedLines.push(`<blockquote>${content}</blockquote>`);
        continue;
      }
    }

    // Unordered lists
    const listMatch = /^-\s+(.+)$/.exec(line);
    if (listMatch) {
      const content = listMatch[1];
      if (content !== undefined) {
        if (!inList) {
          processedLines.push("<ul>");
          inList = true;
        }
        processedLines.push(`<li>${content}</li>`);
        continue;
      }
    }

    // Close list if we're no longer in list items
    if (inList) {
      processedLines.push("</ul>");
      inList = false;
    }

    processedLines.push(line);
  }

  if (inList) {
    processedLines.push("</ul>");
  }

  html = processedLines.join("\n");

  // Convert double newlines to line breaks
  html = html.replace(/\n\n/g, "<br/><br/>");
  // Convert remaining single newlines to line breaks (within paragraphs)
  html = html.replace(/\n/g, "<br/>");

  return html;
}

/**
 * Generate a random color hex string for subreddit banners
 */
export function randomBannerColor(): string {
  const colors = [
    "#FF4500",
    "#0079D3",
    "#46D160",
    "#FF6B6B",
    "#7B68EE",
    "#FF8C00",
    "#2EBFA5",
    "#EA0027",
    "#CC3600",
    "#349E48",
    "#6B5CFF",
    "#0DD3BB",
  ];
  const index = Math.floor(Math.random() * colors.length);
  return colors[index] ?? "#0079D3";
}

/**
 * Truncate text to a maximum length, appending "..." if truncated
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Count total comments for a post (including nested)
 */
export function countComments(comments: Comment[], postId: string): number {
  let count = 0;
  for (const comment of comments) {
    if (comment.postId === postId) {
      count++;
    }
  }
  return count;
}
