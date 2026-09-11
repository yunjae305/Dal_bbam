import { fetchWithTimeout } from '@/backend/fetch-timeout';
import { stripProviderHtml } from '@/backend/place-mapper';
import type { HeritageRecord } from '@/shared/heritage';

// Official contract, verified against the public list/detail XML on 2026-09-06:
// https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp
const BASE_URL = 'https://www.khs.go.kr/cha/';
const MAX_XML_BYTES = 1024 * 1024;
const cache = new Map<string, { expiresAt: number; value: HeritageLookup }>();
const pending = new Map<string, Promise<HeritageLookup>>();
export type HeritageLookup = { record: HeritageRecord | null; status: 'matched' | 'not-found' | 'unavailable' | 'disabled' };

function normalizeName(value: string): string {
  // Only remove the optional local administrative prefix; never fuzzy-match a
  // temple with its pagoda/statue, or infer a match from a shared substring.
  return value.normalize('NFKC').replace(/\s+/g, '').replace(/^경주(?:시)?/, '');
}

function xmlField(xml: string, field: string): string {
  const match = xml.match(new RegExp(`<${field}\\s*>([\\s\\S]*?)<\\/${field}>`));
  if (!match) return '';
  return stripProviderHtml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_entity, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    });
}

async function xmlRequest(url: URL): Promise<string> {
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'application/xml, text/xml' }, redirect: 'error', cache: 'no-store'
  }, 2500);
  if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_XML_BYTES) throw new Error('HERITAGE_PROVIDER_FAILED');
  const xml = await response.text();
  if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml) ||
      !/<result\s*>[\s\S]*<\/result>/.test(xml)) throw new Error('INVALID_HERITAGE_XML');
  return xml;
}

async function lookup(name: string): Promise<HeritageLookup> {
  try {
    const listUrl = new URL('SearchKindOpenapiList.do', BASE_URL);
    listUrl.search = new URLSearchParams({ ccbaMnm1: name, ccbaCtcd: '37', pageUnit: '100', pageIndex: '1' }).toString();
    const xml = await xmlRequest(listUrl);
    // If there are more results than the verified page, uniqueness is unknown.
    if (Number(xmlField(xml, 'totalCnt')) > 100) return { record: null, status: 'not-found' };
    const candidates = [...xml.matchAll(/<item\s*>([\s\S]*?)<\/item>/g)].map(match => match[1])
      .filter(item => xmlField(item, 'ccsiName') === '경주시' && xmlField(item, 'ccbaCncl') === 'N' &&
        normalizeName(xmlField(item, 'ccbaMnm1')) === normalizeName(name));
    if (candidates.length !== 1) return { record: null, status: 'not-found' };
    const match = candidates[0];
    const keys = Object.fromEntries(['ccbaKdcd', 'ccbaAsno', 'ccbaCtcd'].map(key => [key, xmlField(match, key)]));
    if (Object.values(keys).some(value => !/^\d{1,20}$/.test(value)) || keys.ccbaCtcd !== '37') {
      return { record: null, status: 'not-found' };
    }
    const detailUrl = new URL('SearchKindOpenapiDt.do', BASE_URL);
    detailUrl.search = new URLSearchParams(keys).toString();
    const detail = await xmlRequest(detailUrl);
    if (Object.entries(keys).some(([key, value]) => xmlField(detail, key) !== value) ||
        xmlField(detail, 'ccsiName') !== '경주시' || xmlField(detail, 'ccbaCncl') !== 'N' ||
        normalizeName(xmlField(detail, 'ccbaMnm1')) !== normalizeName(name) || !xmlField(detail, 'content')) {
      return { record: null, status: 'not-found' };
    }
    const date = xmlField(detail, 'ccbaAsdt');
    return { status: 'matched', record: {
      name: xmlField(detail, 'ccbaMnm1'), designation: xmlField(detail, 'ccmaName'),
      designatedDate: /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : '',
      era: xmlField(detail, 'ccceName'), address: xmlField(detail, 'ccbaLcad'),
      description: xmlField(detail, 'content'), source: 'korea-heritage-service',
      sourceUrl: detailUrl.toString(), fetchedAt: new Date().toISOString(), language: 'ko'
    } };
  } catch {
    return { record: null, status: 'unavailable' };
  }
}

export async function getHeritageByExactName(name: string): Promise<HeritageLookup> {
  if (['0', 'false', 'off'].includes(process.env.HERITAGE_API_ENABLED?.trim().toLowerCase() ?? '')) {
    return { record: null, status: 'disabled' };
  }
  const key = normalizeName(name);
  if (!key || name.length > 100 || !/[가-힣]/.test(name)) return { record: null, status: 'not-found' };
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const running = pending.get(key);
  if (running) return running;
  const request = lookup(name.trim());
  pending.set(key, request);
  try {
    const result = await request;
    if (cache.size >= 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { value: result, expiresAt: Date.now() + (result.status === 'matched' ? 86400000 : 60000) });
    return result;
  } finally {
    pending.delete(key);
  }
}
