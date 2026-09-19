import { templatePath } from './schema.js';

/**
 * Builds a model of the **site** rather than of a page.
 *
 * Everything else in this directory probes one URL. A crawl produces the link
 * graph, which answers questions no per-page scan can: how many pages exist (so
 * a coverage figure stops being a guess), which pages nothing links to, which
 * ones you can enter but not leave, and — most usefully — which pages are the
 * same template wearing different data.
 *
 * That last one is the point. Two hundred product pages are one template, and
 * testing one properly beats testing two hundred shallowly. What distinguishes a
 * cluster is its **variant axes**: clothing varies on size and colour, laptops on
 * memory and storage, and those axes are exactly what a boundary probe should
 * work on.
 *
 * Order of preference, deliberately: **ask the site first.** `robots.txt` is the
 * owner's own rules of engagement and outranks our defaults; `sitemap.xml` is a
 * declared list of what exists. Only when those are absent do we discover the
 * site ourselves.
 *
 * Crawling is read-only and can still cause harm, because the harm is load. The
 * bounds here are not rabbit-hole guards like the rest of the harness — they are
 * politeness, and they default to cautious.
 */

/** Identifies us honestly, so an owner can recognise or block this traffic. */
export const USER_AGENT =
  'qa-context-overlay/0.1 (+https://github.com/altlv/qa-context-overlay) Playwright';

export interface RobotsRules {
  present: boolean;
  /** Path prefixes disallowed for our user-agent. */
  disallow: string[];
  /** Explicit allows, which win over a longer disallow per the usual convention. */
  allow: string[];
  /** Delay the owner asked for, in milliseconds. */
  crawlDelayMs: number | null;
  /** Sitemaps the file points at. */
  sitemaps: string[];
}

export interface SitemapResult {
  present: boolean;
  urls: string[];
  /** True when the document was an index pointing at further sitemaps. */
  fromIndex: boolean;
}

export interface CrawledPage {
  url: string;
  status: number | null;
  title: string;
  /** Clicks from the seed. */
  depth: number;
  /** Same-origin links found on this page, normalised. */
  links: string[];
  /** How many links leave the origin. Not followed. */
  offOrigin: number;
  /** URL shape, e.g. `/product/{id}` — the first clustering signal. */
  template: string;
  /** Structural fingerprint, so pages with one shape group even across templates. */
  signature: string;
  forms: number;
  controls: number;
  /** Names of select/radio inputs: the candidate variant axes for a cluster. */
  variantAxes: string[];
  /** True when plain fetch saw a shell and a browser was used instead. */
  rendered: boolean;
}

export interface Cluster {
  template: string;
  signature: string;
  members: string[];
  /** Axes the pages in this cluster vary on. What to boundary-test. */
  variantAxes: string[];
}

export interface CrawlResult {
  seed: string;
  robots: RobotsRules;
  sitemap: SitemapResult;
  pages: CrawledPage[];
  /** Links that did not resolve, with the pages that pointed at them. */
  broken: { url: string; status: number | null; linkedFrom: string[] }[];
  /** Reached, but gated behind credentials. Not a defect — a different fact. */
  authRequired: { url: string; status: number; linkedFrom: string[] }[];
  /** In the sitemap, never reached by following links. */
  orphans: string[];
  /** Reached, but offering no way onward. */
  deadEnds: string[];
  clusters: Cluster[];
  /** Which bound ended the crawl, or 'completed'. */
  stoppedBy: string;
  /** URLs skipped because robots.txt disallowed them. */
  disallowed: string[];
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Minimum gap between requests. Overridden upward by robots Crawl-delay. */
  delayMs?: number;
  timeoutMs?: number;
  /** Fetch implementation, so tests need no network. */
  fetchImpl?: typeof fetch;
  /**
   * Renders a URL in a real browser and reports what it found.
   *
   * Returns links separately from HTML on purpose: `page.content()` serialises
   * the light DOM only, so on a Web Components app every link inside a shadow
   * root is missing from the markup even after rendering. The fourth browser API
   * in this codebase that needs shadow roots walked by hand.
   *
   * Injected rather than imported so this module stays browser-free and testable
   * without one.
   */
  render?: (url: string) => Promise<{ html: string; hrefs: string[]; axes: string[] } | null>;
}

// --- robots.txt -------------------------------------------------------------

/**
 * Parses the rules that apply to us.
 *
 * Only the `*` group and any group naming this harness are read; a directive
 * aimed at Googlebot is not aimed at us, and obeying it would be superstition
 * rather than politeness.
 */
export function parseRobots(text: string): Omit<RobotsRules, 'present'> {
  const disallow: string[] = [];
  const allow: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelayMs: number | null = null;
  let applies = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    // Sitemap is global: it belongs to no user-agent group.
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      applies = value === '*' || value.toLowerCase().includes('qa-context-overlay');
      continue;
    }

    if (!applies) continue;
    if (field === 'disallow' && value !== '') disallow.push(value);
    if (field === 'allow' && value !== '') allow.push(value);
    if (field === 'crawl-delay') {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds)) crawlDelayMs = Math.round(seconds * 1000);
    }
  }

  return { disallow, allow, crawlDelayMs, sitemaps };
}

/** Longest match wins, and an equal-length allow beats a disallow. */
export function allowedByRobots(rules: RobotsRules, path: string): boolean {
  if (!rules.present) return true;

  const longest = (patterns: string[]): number =>
    patterns
      .filter((pattern) => path.startsWith(pattern))
      .reduce((best, pattern) => Math.max(best, pattern.length), -1);

  return longest(rules.allow) >= longest(rules.disallow);
}

export async function readRobots(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobotsRules> {
  try {
    const response = await fetchImpl(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
    });
    // A 503 on robots.txt is not "no rules" — it is "ask again later". Treating
    // it as permission is how a crawler ends up somewhere it was told to avoid,
    // and one of the sites probed here answered exactly that.
    if (response.status >= 500) {
      return { present: true, disallow: ['/'], allow: [], crawlDelayMs: null, sitemaps: [] };
    }
    if (!response.ok) {
      return { present: false, disallow: [], allow: [], crawlDelayMs: null, sitemaps: [] };
    }
    return { present: true, ...parseRobots(await response.text()) };
  } catch {
    return { present: false, disallow: [], allow: [], crawlDelayMs: null, sitemaps: [] };
  }
}

// --- sitemap.xml ------------------------------------------------------------

/** Pulls `<loc>` values, whether the document is a urlset or an index. */
export function parseSitemap(xml: string): { urls: string[]; isIndex: boolean } {
  const isIndex = /<sitemapindex/i.test(xml);
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1] ?? '');
  return { urls: urls.filter((url) => url !== ''), isIndex };
}

/**
 * Reads a sitemap, following one level of index nesting.
 *
 * One level, not arbitrary depth: a nested index is rare, and an unbounded
 * follow is how a polite crawler accidentally downloads a hundred documents.
 */
export async function readSitemap(
  url: string,
  fetchImpl: typeof fetch = fetch,
  maxChildren = 5,
): Promise<SitemapResult> {
  try {
    const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) return { present: false, urls: [], fromIndex: false };

    const body = await response.text();
    // A 200 is not proof: plenty of apps answer every path with their shell.
    if (!body.trimStart().startsWith('<')) return { present: false, urls: [], fromIndex: false };

    const { urls, isIndex } = parseSitemap(body);
    if (!isIndex) return { present: true, urls, fromIndex: false };

    const collected: string[] = [];
    for (const child of urls.slice(0, maxChildren)) {
      const nested = await readSitemap(child, fetchImpl, 0);
      collected.push(...nested.urls);
    }
    return { present: true, urls: collected, fromIndex: true };
  } catch {
    return { present: false, urls: [], fromIndex: false };
  }
}

// --- page parsing -----------------------------------------------------------

/** Same-origin links, absolute and de-duplicated, fragments dropped. */
export function extractLinks(html: string, baseUrl: string): { same: string[]; off: number } {
  const same = new Set<string>();
  let off = 0;

  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = match[1] ?? '';
    if (href === '' || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const resolved = new URL(href, baseUrl);
      resolved.hash = '';
      if (resolved.origin === new URL(baseUrl).origin) same.add(resolved.toString());
      else off += 1;
    } catch {
      // A malformed href is the page's problem, not the crawl's.
    }
  }

  return { same: [...same], off };
}

/**
 * A fingerprint of the page's shape, ignoring its content.
 *
 * Two product pages differ in every word and agree in structure, which is what
 * makes them one template. Counts are bucketed so that "12 links" and "14 links"
 * do not split a cluster over nothing.
 */
export function structuralSignature(html: string): string {
  const bucket = (n: number): number => (n === 0 ? 0 : Math.pow(2, Math.floor(Math.log2(n))));
  const count = (pattern: RegExp): number => (html.match(pattern) ?? []).length;

  return [
    `a${bucket(count(/<a\b/gi))}`,
    `img${bucket(count(/<img\b/gi))}`,
    `form${count(/<form\b/gi)}`,
    `input${bucket(count(/<input\b/gi))}`,
    `select${count(/<select\b/gi)}`,
    `table${count(/<table\b/gi)}`,
    `h1${count(/<h1\b/gi)}`,
    `h2${bucket(count(/<h2\b/gi))}`,
  ].join('.');
}

/** Names of selects and radio groups — the axes a cluster's pages vary on. */
export function extractVariantAxes(html: string): string[] {
  const axes = new Set<string>();
  for (const match of html.matchAll(/<select\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)) {
    axes.add(match[1] ?? '');
  }
  for (const match of html.matchAll(
    /<input\b[^>]*\btype\s*=\s*["']radio["'][^>]*\bname\s*=\s*["']([^"']+)["']/gi,
  )) {
    axes.add(match[1] ?? '');
  }
  for (const match of html.matchAll(/\bdata-(?:option|variant|axis)\s*=\s*["']([^"']+)["']/gi)) {
    axes.add(match[1] ?? '');
  }
  return [...axes].filter((axis) => axis !== '');
}

/**
 * Scheme- and trailing-slash-insensitive key for comparing URLs.
 *
 * A sitemap listing `http://example.com/` while the site serves `https://` is
 * common and means nothing. Comparing raw strings reported the very page the
 * crawl started from as an orphan.
 */
export function comparableUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.host}${path === '' ? '/' : path}${parsed.search}`;
  } catch {
    return url;
  }
}

function titleOf(html: string): string {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim().slice(0, 120);
}

/**
 * Works out which URL segments are data by comparing paths to each other.
 *
 * Per-URL templating can only collapse what looks like an id — a number, a uuid.
 * Real sites use slugs, so `/detail/outerwear/anvil-crew-neck-grey` came back as
 * its own template and twenty-six product pages produced twenty-four "templates",
 * which is the opposite of useful.
 *
 * A segment is data when several different values appear in the same position
 * under the same prefix. One product proves nothing; a dozen siblings are a
 * template. The threshold is deliberately low but not one — two values could be
 * "about" and "contact", which are genuinely different pages.
 */
export function induceTemplates(paths: string[], minVariants = 3): Map<string, string> {
  const split = paths.map((path) => path.split('/').filter((segment) => segment !== ''));

  // Values seen at each position, keyed by the prefix that precedes them, so
  // /a/{x} and /b/{y} are judged separately.
  const byPrefix = new Map<string, Set<string>>();
  for (const segments of split) {
    for (let index = 0; index < segments.length; index += 1) {
      const key = `${segments.length}|${index}|${segments.slice(0, index).join('/')}`;
      const seen = byPrefix.get(key) ?? new Set<string>();
      seen.add(segments[index] ?? '');
      byPrefix.set(key, seen);
    }
  }

  const templates = new Map<string, string>();
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const segments = split[pathIndex] ?? [];
    const rendered = segments.map((segment, index) => {
      const key = `${segments.length}|${index}|${segments.slice(0, index).join('/')}`;
      return (byPrefix.get(key)?.size ?? 0) >= minVariants ? '{slug}' : segment;
    });
    templates.set(paths[pathIndex] ?? '', `/${rendered.join('/')}`);
  }

  return templates;
}

/** Groups pages by URL shape and structure, and reports what each varies on. */
export function clusterPages(pages: CrawledPage[]): Cluster[] {
  // Induced across every crawled path, because a template is a fact about the
  // set rather than about any one URL.
  const induced = induceTemplates(
    pages.map((page) => {
      try {
        return new URL(page.url).pathname;
      } catch {
        return page.url;
      }
    }),
  );

  const groups = new Map<string, CrawledPage[]>();
  for (const page of pages) {
    let pathname = page.url;
    try {
      pathname = new URL(page.url).pathname;
    } catch {
      // keep the raw url as the key
    }
    const template = induced.get(pathname) ?? page.template;
    const key = `${template}|${page.signature}`;
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [page]);
    else existing.push(page);
  }

  const clusters = [...groups.entries()]
    .map(([key, members]) => {
      const [template = '', signature = ''] = key.split('|');
      return {
        template,
        signature,
        members: members.map((page) => page.url),
        variantAxes: [...new Set(members.flatMap((page) => page.variantAxes))],
      };
    })
    .sort((left, right) => right.members.length - left.members.length);

  // An axis that appears on every template is site chrome, not something the
  // template varies on. The navigation and the cart are on every page of the
  // shop; the size picker is not, and that difference is the whole signal.
  // Subtracting the intersection beats hand-tuning selectors, because it adapts
  // to whatever chrome a given site happens to have.
  if (clusters.length > 1) {
    const chrome = clusters
      .map((cluster) => new Set(cluster.variantAxes))
      .reduce((common, axes) => new Set([...common].filter((axis) => axes.has(axis))));

    for (const cluster of clusters) {
      cluster.variantAxes = cluster.variantAxes.filter((axis) => !chrome.has(axis));
    }
  }

  return clusters;
}

// --- the crawl --------------------------------------------------------------

/**
 * Breadth-first, same-origin, one request at a time.
 *
 * Sequential by design. Concurrency is the knob that turns a polite crawl into a
 * load test, and nothing here is urgent enough to justify it.
 *
 * The sitemap seeds the queue when one exists, because a declared list of pages
 * beats guessing — and anything in the sitemap that links never reach is an
 * orphan, which is itself a finding.
 */
export async function crawlSite(seed: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 40;
  const maxDepth = options.maxDepth ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const origin = new URL(seed).origin;

  const robots = await readRobots(origin, fetchImpl);

  // The owner's Crawl-delay raises our floor; it never lowers it.
  const delayMs = Math.max(options.delayMs ?? 400, robots.crawlDelayMs ?? 0);

  let sitemap: SitemapResult = { present: false, urls: [], fromIndex: false };
  for (const candidate of [...robots.sitemaps, `${origin}/sitemap.xml`]) {
    sitemap = await readSitemap(candidate, fetchImpl);
    if (sitemap.present && sitemap.urls.length > 0) break;
  }

  const queue: { url: string; depth: number }[] = [{ url: seed, depth: 0 }];
  const seen = new Set<string>([seed]);
  const pages: CrawledPage[] = [];
  const disallowed: string[] = [];
  const failures = new Map<string, { status: number | null; linkedFrom: Set<string> }>();
  const gated = new Map<string, { status: number; linkedFrom: Set<string> }>();

  // Sitemap URLs join the queue at depth 1: known to exist, not yet known to be
  // reachable by clicking, which is the distinction that finds orphans.
  for (const url of sitemap.urls.slice(0, maxPages)) {
    if (!seen.has(url) && url.startsWith(origin)) {
      seen.add(url);
      queue.push({ url, depth: 1 });
    }
  }

  let stoppedBy = 'completed';
  const reachedByLink = new Set<string>([seed]);

  while (queue.length > 0) {
    if (pages.length >= maxPages) {
      stoppedBy = `page limit (${maxPages})`;
      break;
    }

    const next = queue.shift();
    if (next === undefined) break;
    if (next.depth > maxDepth) continue;

    const path = new URL(next.url).pathname;
    if (!allowedByRobots(robots, path)) {
      disallowed.push(next.url);
      continue;
    }

    if (pages.length > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    let status: number | null = null;
    let html = '';
    try {
      const response = await fetchImpl(next.url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      const contentType = response.headers.get('content-type') ?? '';
      if (response.ok && contentType.includes('html')) html = await response.text();
    } catch {
      status = null;
    }

    if (status === 401 || status === 403) {
      // Gated, not broken. The page exists and is doing its job; we simply have
      // no credentials. Since authenticating is permitted, this is a prompt to
      // supply a session rather than a defect to report.
      const existing = gated.get(next.url);
      if (existing === undefined) gated.set(next.url, { status, linkedFrom: new Set() });
      continue;
    }

    if (status === null || status >= 400) {
      const existing = failures.get(next.url);
      if (existing === undefined) {
        failures.set(next.url, { status, linkedFrom: new Set() });
      }
      continue;
    }

    let { same, off } = extractLinks(html, next.url);
    let rendered = false;
    let renderedAxes: string[] = [];

    // Fetch-first, escalate on evidence. A client-rendered app serves a shell:
    // scripts present, almost no links. Fetching the Polymer shop found zero
    // links and called a working storefront a dead end. Rendering costs seconds,
    // so it is spent only where the cheap path clearly failed.
    if (options.render !== undefined && same.length < 2 && html.includes('<script')) {
      const viaBrowser = await options.render(next.url);
      if (viaBrowser !== null) {
        const resolved = new Set<string>();
        let offOrigin = 0;

        for (const href of viaBrowser.hrefs) {
          try {
            const url = new URL(href, next.url);
            url.hash = '';
            if (url.origin === origin) resolved.add(url.toString());
            else offOrigin += 1;
          } catch {
            // A malformed href is the page's problem, not the crawl's.
          }
        }

        if (resolved.size > same.length) {
          same = [...resolved];
          off = offOrigin;
          html = viaBrowser.html;
          renderedAxes = viaBrowser.axes;
          rendered = true;
        }
      }
    }

    pages.push({
      url: next.url,
      status,
      title: titleOf(html),
      depth: next.depth,
      links: same,
      offOrigin: off,
      template: templatePath(path),
      signature: structuralSignature(html),
      forms: (html.match(/<form\b/gi) ?? []).length,
      controls: (html.match(/<(?:button|input|select|textarea)\b/gi) ?? []).length,
      // Prefer what the browser saw: a Web Components app keeps its size and
      // colour pickers inside shadow roots, where serialised HTML cannot reach.
      variantAxes: rendered && renderedAxes.length > 0 ? renderedAxes : extractVariantAxes(html),
      rendered,
    });

    for (const link of same) {
      reachedByLink.add(link);
      if (seen.has(link)) continue;
      seen.add(link);
      queue.push({ url: link, depth: next.depth + 1 });
    }
  }

  // Attribute each failure to the pages that pointed at it.
  for (const page of pages) {
    for (const link of page.links) {
      failures.get(link)?.linkedFrom.add(page.url);
      gated.get(link)?.linkedFrom.add(page.url);
    }
  }

  const reachedKeys = new Set([...reachedByLink].map(comparableUrl));

  return {
    seed,
    robots,
    sitemap,
    pages,
    broken: [...failures.entries()].map(([url, failure]) => ({
      url,
      status: failure.status,
      linkedFrom: [...failure.linkedFrom],
    })),
    authRequired: [...gated.entries()].map(([url, entry]) => ({
      url,
      status: entry.status,
      linkedFrom: [...entry.linkedFrom],
    })),
    orphans: sitemap.urls.filter((url) => !reachedKeys.has(comparableUrl(url))),
    deadEnds: pages.filter((page) => page.links.length === 0).map((page) => page.url),
    clusters: clusterPages(pages),
    stoppedBy,
    disallowed,
  };
}

export function formatCrawl(result: CrawlResult): string {
  const lines: string[] = [`Crawl of ${result.seed}`, ''];

  lines.push(
    result.robots.present
      ? `robots.txt: present — ${result.robots.disallow.length} disallow rule(s)${
          result.robots.crawlDelayMs === null ? '' : `, Crawl-delay ${result.robots.crawlDelayMs}ms`
        }`
      : 'robots.txt: absent — no rules declared, so ours apply',
  );
  lines.push(
    result.sitemap.present
      ? `sitemap: ${result.sitemap.urls.length} URL(s)${result.sitemap.fromIndex ? ' via an index' : ''}`
      : 'sitemap: absent — the graph below was discovered, not declared',
  );
  lines.push('');

  const rendered = result.pages.filter((page) => page.rendered).length;
  lines.push(`Reached ${result.pages.length} page(s); stopped by ${result.stoppedBy}.`);
  if (rendered > 0) {
    lines.push(
      `  ${rendered} needed a real browser — plain fetch saw only a shell, so this app`,
      '  is client-rendered and a fetch-only crawler would report it as empty.',
    );
  }
  if (result.disallowed.length > 0) {
    lines.push(`  ${result.disallowed.length} skipped because robots.txt disallowed them.`);
  }
  lines.push('');

  if (result.broken.length > 0) {
    lines.push(`Broken links (${result.broken.length}):`);
    for (const broken of result.broken.slice(0, 10)) {
      lines.push(
        `  ${broken.status ?? 'no response'}  ${broken.url}`,
        `      linked from ${broken.linkedFrom.length} page(s)`,
      );
    }
    lines.push('');
  }

  if (result.authRequired.length > 0) {
    lines.push(`Behind credentials (${result.authRequired.length}):`);
    for (const gatedPage of result.authRequired.slice(0, 6)) {
      lines.push(`  ${gatedPage.status}  ${gatedPage.url}`);
    }
    lines.push('  Not broken — supply a session to crawl past these.');
    lines.push('');
  }

  if (result.orphans.length > 0) {
    lines.push(`Orphans — declared in the sitemap, reached by no link (${result.orphans.length}):`);
    for (const orphan of result.orphans.slice(0, 10)) lines.push(`  ${orphan}`);
    lines.push('  Either the navigation is missing them, or the sitemap is stale.');
    lines.push('');
  }

  if (result.deadEnds.length > 0) {
    lines.push(`Dead ends — reached, with no way onward (${result.deadEnds.length}):`);
    for (const deadEnd of result.deadEnds.slice(0, 6)) lines.push(`  ${deadEnd}`);
    lines.push('');
  }

  const worthClustering = result.clusters.filter((cluster) => cluster.members.length > 1);
  if (worthClustering.length > 0) {
    lines.push('Templates — test one of each properly, sample the rest:');
    for (const cluster of worthClustering.slice(0, 8)) {
      lines.push(`  ${cluster.template}  x${cluster.members.length}`);
      lines.push(
        cluster.variantAxes.length > 0
          ? `      varies on: ${cluster.variantAxes.join(', ')}  <- boundary-test these`
          : '      no variant axes found in the served HTML',
      );
    }
    lines.push('');
  }

  const singles = result.clusters.filter((cluster) => cluster.members.length === 1).length;
  lines.push(
    `${worthClustering.length} template(s) with more than one page, ${singles} one-off(s).`,
  );
  lines.push(
    `Coverage denominator: ${result.pages.length} page(s) across ${result.clusters.length} distinct shape(s)` +
      (result.stoppedBy === 'completed'
        ? '.'
        : ' — but the crawl stopped early, so this is a floor, not a total.'),
  );

  // Stated in the output rather than buried in a doc, because the number above
  // reads as a total and is not one. A crawl that stays quiet about what it
  // cannot follow describes a smaller application than the one that exists —
  // the same failure as a scan reporting no findings on a challenge page.
  lines.push(
    '',
    'Not followed by this crawl:',
    '  - navigation with no <a href> — router buttons, onclick handlers',
    '  - anything reached by POST, including most search and filter results',
    '  - pages behind authentication (supply a session to go further)',
    '  - other origins, and anything robots.txt disallowed',
    '  Treat the count above as a lower bound on the site, not its size.',
  );

  return lines.join('\n');
}
