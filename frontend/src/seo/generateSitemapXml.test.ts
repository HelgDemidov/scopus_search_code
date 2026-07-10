import { describe, it, expect } from 'vitest';
import { generateSitemapXml, SITE_ORIGIN, type IndexableSection } from './generateSitemapXml';

const SECTIONS: IndexableSection[] = [
  { path: '/main', titleKey: 'seo.main.title', descriptionKey: 'seo.main.description' },
  { path: '/about', titleKey: 'seo.about.title', descriptionKey: 'seo.about.description' },
];

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

// querySelector не матчит namespace-префиксованные теги (<xhtml:link>) по
// простому type-селектору 'link' — фильтруем по tagName напрямую.
function alternateLinks(url: Element): Element[] {
  return Array.from(url.getElementsByTagName('xhtml:link'));
}

describe('generateSitemapXml', () => {
  it('производит валидный XML', () => {
    const xml = generateSitemapXml(SECTIONS, '2026-07-10');
    parseXml(xml);
  });

  it('генерирует по 1 <url> на секцию × локаль (2 секции × 3 локали = 6)', () => {
    const doc = parseXml(generateSitemapXml(SECTIONS, '2026-07-10'));
    expect(doc.querySelectorAll('url').length).toBe(6);
  });

  it('каждый <url> содержит все 3 hreflang-альтернативы + x-default', () => {
    const doc = parseXml(generateSitemapXml(SECTIONS, '2026-07-10'));
    const urls = Array.from(doc.querySelectorAll('url'));
    for (const url of urls) {
      const hreflangs = alternateLinks(url).map((el) => el.getAttribute('hreflang'));
      expect(hreflangs).toEqual(expect.arrayContaining(['en', 'ru', 'sr-Latn', 'x-default']));
      expect(hreflangs.length).toBe(4);
    }
  });

  it('x-default href всегда указывает на en-вариант того же пути', () => {
    const doc = parseXml(generateSitemapXml(SECTIONS, '2026-07-10'));
    const urls = Array.from(doc.querySelectorAll('url'));
    for (const url of urls) {
      const xDefault = alternateLinks(url).find((el) => el.getAttribute('hreflang') === 'x-default');
      const loc = url.querySelector('loc')?.textContent ?? '';
      // Путь после /en/ должен совпадать у loc (после отбрасывания префикса локали) и x-default href
      const pathFromLoc = loc.replace(new RegExp(`^${SITE_ORIGIN}/(en|ru|sr-latn)`), '');
      expect(xDefault?.getAttribute('href')).toBe(`${SITE_ORIGIN}/en${pathFromLoc}`);
    }
  });

  it('приоритет /main — 1.0, остальные секции — 0.8', () => {
    const doc = parseXml(generateSitemapXml(SECTIONS, '2026-07-10'));
    const urls = Array.from(doc.querySelectorAll('url'));
    const mainUrl = urls.find((u) => u.querySelector('loc')?.textContent?.endsWith('/main'));
    const aboutUrl = urls.find((u) => u.querySelector('loc')?.textContent?.endsWith('/about'));
    expect(mainUrl?.querySelector('priority')?.textContent).toBe('1.0');
    expect(aboutUrl?.querySelector('priority')?.textContent).toBe('0.8');
  });

  it('использует переданный lastmod для каждого <url>', () => {
    const doc = parseXml(generateSitemapXml(SECTIONS, '2099-01-01'));
    const lastmods = Array.from(doc.querySelectorAll('lastmod')).map((el) => el.textContent);
    expect(lastmods.every((l) => l === '2099-01-01')).toBe(true);
  });

  it('пустой манифест → валидный XML без <url>', () => {
    const doc = parseXml(generateSitemapXml([], '2026-07-10'));
    expect(doc.querySelectorAll('url').length).toBe(0);
  });
});
