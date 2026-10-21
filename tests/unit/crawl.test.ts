import { test, expect } from '@playwright/test';
import {
  allowedByRobots,
  clusterPages,
  comparableUrl,
  crawlSite,
  extractLinks,
  extractVariantAxes,
  induceTemplates,
  parseRobots,
  parseSitemap,
  structuralSignature,
  type CrawledPage,
} from '../../src/tools/crawl.js';

/**
 * The crawler, tested against a fake site.
 *
 * `fetchImpl` is injected so none of this touches the network: a crawler whose
 * tests hit real servers is both slow and rude, and it would make the suite
 * depend on somebody else's uptime.
 */

function page(overrides: Partial<CrawledPage> = {}): CrawledPage {
  return {
    url: 'https://shop.test/a',
    status: 200,
    title: 'A',
    depth: 1,
    links: [],
    offOrigin: 0,
    template: '/a',
    signature: 'a4.img2.form0',
    forms: 0,
    controls: 3,
    variantAxes: [],
    rendered: false,
    ...overrides,
  };
}

/** A small site: a home page, three products, one dead link, one orphan. */
function fakeSite(): typeof fetch {
  const pages: Record<string, { status: number; body: string; type?: string }> = {
    'https://shop.test/robots.txt': {
      status: 200,
      body: 'User-agent: *\nDisallow: /admin\nCrawl-delay: 0\nSitemap: https://shop.test/sitemap.xml',
      type: 'text/plain',
    },
    'https://shop.test/sitemap.xml': {
      status: 200,
      body: '<?xml version="1.0"?><urlset><loc>https://shop.test/</loc><loc>https://shop.test/secret</loc></urlset>',
      type: 'application/xml',
    },
    'https://shop.test/': {
      status: 200,
      body: `<title>Home</title>
        <a href="/p/red-shirt">Red</a><a href="/p/blue-shirt">Blue</a>
        <a href="/p/green-shirt">Green</a><a href="/admin">Admin</a>
        <a href="/gone">Gone</a>`,
    },
    'https://shop.test/p/red-shirt': {
      status: 200,
      body: '<title>Red</title><a href="/">Home</a><select name="size"><option>S</option></select>',
    },
    'https://shop.test/p/blue-shirt': {
      status: 200,
      body: '<title>Blue</title><a href="/">Home</a><select name="size"><option>M</option></select>',
    },
    'https://shop.test/p/green-shirt': {
      status: 200,
      body: '<title>Green</title><a href="/">Home</a><select name="size"><option>L</option></select>',
    },
    'https://shop.test/gone': { status: 404, body: 'nope' },
    // Reachable and real, but nothing links to it: a clean orphan, kept distinct
    // from the broken link so one test failure cannot mean two different things.
    'https://shop.test/secret': { status: 200, body: '<title>Secret</title>' },
    'https://shop.test/admin': { status: 200, body: '<title>Admin</title>' },
  };

  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const found = pages[url];
    if (found === undefined) {
      return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
    }
    return new Response(found.body, {
      status: found.status,
      headers: { 'content-type': found.type ?? 'text/html' },
    });
  }) as typeof fetch;
}

test.describe('robots.txt', () => {
  test('should read only the rules aimed at us', () => {
    const rules = parseRobots(`
      User-agent: Googlebot
      Disallow: /nothing-to-do-with-us
      User-agent: *
      Disallow: /admin
      Crawl-delay: 2
      Sitemap: https://shop.test/sitemap.xml
    `);

    expect(
      rules.disallow,
      'a directive aimed at Googlebot is not aimed at us; obeying it would be superstition',
    ).toEqual(['/admin']);
    expect(rules.crawlDelayMs, 'the owner asked for two seconds between requests').toBe(2000);
    expect(
      rules.sitemaps,
      'Sitemap belongs to no user-agent group and must be read regardless',
    ).toEqual(['https://shop.test/sitemap.xml']);
  });

  test('should let an explicit allow override a disallow', () => {
    const rules = {
      present: true,
      disallow: ['/docs'],
      allow: ['/docs/public'],
      crawlDelayMs: null,
      sitemaps: [],
    };

    expect(allowedByRobots(rules, '/docs/private'), 'the disallow covers this path').toBe(false);
    expect(
      allowedByRobots(rules, '/docs/public/guide'),
      'the longer allow wins, which is the conventional reading',
    ).toBe(true);
  });

  test('should permit everything when no robots.txt exists', () => {
    expect(
      allowedByRobots(
        { present: false, disallow: [], allow: [], crawlDelayMs: null, sitemaps: [] },
        '/anything',
      ),
      'no declared rules means ours apply, not that everything is forbidden',
    ).toBe(true);
  });
});

test.describe('sitemap.xml', () => {
  test('should read a flat urlset', () => {
    const result = parseSitemap(
      '<urlset><loc>https://a.test/1</loc><loc>https://a.test/2</loc></urlset>',
    );

    expect(result.urls, 'both locations must be found').toHaveLength(2);
    expect(result.isIndex, 'a urlset is not an index').toBe(false);
  });

  test('should recognise an index, which points at further sitemaps', () => {
    const result = parseSitemap(
      '<sitemapindex><sitemap><loc>https://a.test/s1.xml</loc></sitemap></sitemapindex>',
    );

    expect(
      result.isIndex,
      'treating an index as a page list would report sitemap files as if they were pages',
    ).toBe(true);
  });
});

test.describe('link and structure extraction', () => {
  test('should keep same-origin links and count the rest', () => {
    const { same, off } = extractLinks(
      `<a href="/one">1</a><a href="https://other.test/x">out</a>
       <a href="#top">anchor</a><a href="mailto:a@b.c">mail</a>`,
      'https://shop.test/page',
    );

    expect(same, 'only the same-origin link is followable').toEqual(['https://shop.test/one']);
    expect(off, 'off-origin links are counted, never followed').toBe(1);
  });

  test('should drop fragments so one page is not crawled twice', () => {
    const { same } = extractLinks('<a href="/x#a">A</a><a href="/x#b">B</a>', 'https://shop.test/');

    expect(same, 'two fragments of one page are one page').toHaveLength(1);
  });

  test('should give pages of the same shape the same signature', () => {
    const first = structuralSignature('<h1>Red</h1><a href="/">x</a><select name="size"></select>');
    const second = structuralSignature(
      '<h1>Blue</h1><a href="/">y</a><select name="size"></select>',
    );

    expect(
      first,
      'two product pages differ in every word and agree in structure — that is what makes them one template',
    ).toBe(second);
    /**
     * Found by `npm run test-sensitivity -- src/tools/crawl.ts`, which reported this export as reached with
     * nothing depending on what it returns.
     *
     * It was right. The assertion above compares two outputs and says nothing about either, so a
     * body replaced with nothing passed it: `undefined === undefined`. One half of an equality
     * claim is not a test of the function, it is a test that the function is deterministic — which
     * a constant also satisfies.
     */
    expect(first, 'and a signature of nothing would satisfy the equality above').not.toBe('');
    expect(
      first,
      'which is why the value itself has to be asserted, not only the agreement',
    ).toBeTruthy();
  });

  test('should give pages of different shapes different signatures', () => {
    // The other half, and the reason the equality test can mean something. Without it the only
    // claim on record is "two things are equal", which a function returning a constant satisfies.
    const product = structuralSignature(
      '<h1>Red</h1><a href="/">x</a><select name="size"></select>',
    );
    const article = structuralSignature('<h1>Red</h1><p>words</p><p>more words</p>');

    expect(
      product,
      'a product page and an article are not one template, and a signature that cannot tell them ' +
        'apart would cluster the whole site into one',
    ).not.toBe(article);
  });

  test('should find the axes a page offers', () => {
    const axes = extractVariantAxes(
      '<select name="ram"></select><input type="radio" name="storage"><select name="colour"></select>',
    );

    expect(
      axes.sort(),
      'these are what a boundary probe should work on: laptops vary on memory and storage',
    ).toEqual(['colour', 'ram', 'storage']);
  });
});

test.describe('template induction', () => {
  test('should treat a segment as data once several values share its position', () => {
    const induced = induceTemplates(['/p/red-shirt', '/p/blue-shirt', '/p/green-shirt', '/about']);

    expect(
      induced.get('/p/red-shirt'),
      'slugs are not numeric, so per-URL templating leaves every product its own template',
    ).toBe('/p/{slug}');
    expect(induced.get('/about'), 'a one-off page must keep its literal path').toBe('/about');
  });

  test('should not collapse two siblings into a template', () => {
    const induced = induceTemplates(['/about', '/contact']);

    expect(
      induced.get('/about'),
      'about and contact are genuinely different pages, not one template with two values',
    ).toBe('/about');
  });
});

test.describe('clustering', () => {
  test('should drop axes that appear on every template, because those are chrome', () => {
    const clusters = clusterPages([
      page({ url: 'https://shop.test/p/a', variantAxes: ['Cart', 'size'] }),
      page({ url: 'https://shop.test/p/b', variantAxes: ['Cart', 'size'] }),
      page({ url: 'https://shop.test/p/c', variantAxes: ['Cart', 'size'] }),
      page({ url: 'https://shop.test/checkout', variantAxes: ['Cart', 'shipCountry'] }),
    ]);

    const everyAxis = clusters.flatMap((cluster) => cluster.variantAxes);

    expect(
      everyAxis,
      'the cart is on every page of every template, so it distinguishes nothing',
    ).not.toContain('Cart');
    expect(everyAxis, 'the axes that only some templates have are the real signal').toContain(
      'size',
    );
  });
});

test.describe('comparing urls', () => {
  test('should ignore scheme and a trailing slash', () => {
    expect(
      comparableUrl('http://a.test/x/'),
      'a sitemap listing http while the site serves https is common and means nothing',
    ).toBe(comparableUrl('https://a.test/x'));
  });
});

test.describe('crawling a whole site', () => {
  test('should build the graph, respect robots, and report what it found', async () => {
    const result = await crawlSite('https://shop.test/', {
      fetchImpl: fakeSite(),
      delayMs: 0,
      maxPages: 20,
      maxDepth: 3,
    });

    expect(result.robots.present, 'the site declares rules and they must be read').toBe(true);
    expect(
      result.disallowed.some((url) => url.includes('/admin')),
      'a disallowed path must be skipped and reported, not silently ignored',
    ).toBe(true);
    expect(
      result.pages.some((crawled) => crawled.url.includes('/admin')),
      'and it must never actually be fetched',
    ).toBe(false);

    const gone = result.broken.find((broken) => broken.url.endsWith('/gone'));
    expect(
      gone,
      'a 404 behind a link is a defect in the site and the crawl exists to find it',
    ).toBeDefined();
    expect(
      gone?.linkedFrom,
      'a broken link is only actionable if you know which page points at it',
    ).toContain('https://shop.test/');

    expect(
      result.orphans,
      'a page in the sitemap that no link reaches is either missing navigation or a stale sitemap',
    ).toContain('https://shop.test/secret');

    const products = result.clusters.find((cluster) => cluster.template === '/p/{slug}');
    expect(products?.members, 'three product pages are one template').toHaveLength(3);
    expect(products?.variantAxes, 'and the axis they vary on is what to boundary-test').toContain(
      'size',
    );
  });

  test('should stop at the page limit and say so', async () => {
    const result = await crawlSite('https://shop.test/', {
      fetchImpl: fakeSite(),
      delayMs: 0,
      maxPages: 2,
    });

    expect(result.pages.length, 'the bound must actually bind').toBeLessThanOrEqual(2);
    expect(
      result.stoppedBy,
      'a truncated crawl that claims to be complete would make every count below it a lie',
    ).toContain('page limit');
  });

  test('should refuse everything when robots.txt is unavailable rather than assuming permission', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/robots.txt')) return new Response('', { status: 503 });
      return new Response('<title>x</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;

    const result = await crawlSite('https://shop.test/', { fetchImpl, delayMs: 0 });

    expect(
      result.pages,
      'a 503 on robots.txt means "ask again later", not "help yourself" — assuming permission is how a crawler ends up where it was told not to go',
    ).toHaveLength(0);
  });
});
