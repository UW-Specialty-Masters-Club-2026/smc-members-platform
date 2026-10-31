import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Markdown from the admin editor → HTML safe to put on a public page. */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'strong',
      'em',
      'a',
      'blockquote',
      'figure',
      'figcaption',
      'img',
      'br',
      'hr',
      'code',
      'pre',
    ],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'loading'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Local paths (/content/…, /api/uploads/…) are allowed for images.
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: /^https?:/.test(attribs.href ?? '')
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
          : attribs,
      }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    },
  });
}
