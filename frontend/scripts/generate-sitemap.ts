#!/usr/bin/env -S npx tsx
// Запускается перед vite build (npm run build → см. package.json). Тонкий CLI-скрипт:
// вся XML-логика — в src/seo/generateSitemapXml.ts (типизирована, покрыта тестами
// Vitest); здесь только I/O (чтение манифеста, запись файла). Через tsx, не голый
// node — иначе пришлось бы дублировать buildLocalizedPath/SUPPORTED_URL_LANGS
// (плоский .mjs не может импортировать typed utils/localeRouting.ts напрямую).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateSitemapXml, type IndexableSection } from '../src/seo/generateSitemapXml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const manifestPath = path.join(__dirname, '../src/seo/indexableSections.json');
const sections: IndexableSection[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));

const today = new Date().toISOString().slice(0, 10);
const xml = generateSitemapXml(sections, today);

const outputPath = path.join(__dirname, '../public/sitemap.xml');
writeFileSync(outputPath, xml, 'utf-8');

console.log(`generate-sitemap: wrote ${sections.length * 3} URLs (${sections.length} sections × 3 locales) to public/sitemap.xml`);
