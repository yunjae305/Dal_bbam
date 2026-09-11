import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/backend/fetch-timeout', () => ({ fetchWithTimeout: mocks.fetch }));

const keys = '<ccbaKdcd>11</ccbaKdcd><ccbaAsno>0000310000000</ccbaAsno><ccbaCtcd>37</ccbaCtcd>';
const item = `<item>${keys}<ccbaMnm1><![CDATA[경주 첨성대]]></ccbaMnm1><ccsiName>경주시</ccsiName><ccbaCncl>N</ccbaCncl></item>`;
const list = `<result><totalCnt>1</totalCnt>${item}</result>`;
const detail = `<result>${keys}<item><ccbaMnm1><![CDATA[경주 첨성대]]></ccbaMnm1><ccsiName>경주시</ccsiName><ccbaCncl>N</ccbaCncl><ccmaName>국보</ccmaName><ccceName>신라시대</ccceName><ccbaAsdt>19621220</ccbaAsdt><ccbaLcad>경북 경주시 인왕동</ccbaLcad><content><![CDATA[공식 기록의 설명입니다. <script>doNotExecute()</script>]]></content></item></result>`;
let getHeritageByExactName: typeof import('@/backend/heritage-api').getHeritageByExactName;

describe('official heritage enrichment', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce(new Response(list)).mockResolvedValueOnce(new Response(detail));
    ({ getHeritageByExactName } = await import('@/backend/heritage-api'));
  });

  it('matches exact Gyeongju names and preserves the verified official source', async () => {
    const result = await getHeritageByExactName('첨성대');
    expect(result).toMatchObject({ status: 'matched', record: {
      name: '경주 첨성대', designation: '국보', language: 'ko', designatedDate: '1962-12-20',
      source: 'korea-heritage-service', description: '공식 기록의 설명입니다.'
    } });
    expect(result.record?.sourceUrl).toBe('https://www.khs.go.kr/cha/SearchKindOpenapiDt.do?ccbaKdcd=11&ccbaAsno=0000310000000&ccbaCtcd=37');
    const [url, options, timeout] = mocks.fetch.mock.calls[0];
    expect(url.protocol).toBe('https:');
    expect(url.searchParams.get('ccbaCtcd')).toBe('37');
    expect(options.redirect).toBe('error');
    expect(timeout).toBe(2500);
  });

  it('does not associate a similarly named structure with an entire temple', async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(new Response(list.replace('경주 첨성대', '경주 불국사 다보탑')));
    expect(await getHeritageByExactName('불국사')).toEqual({ record: null, status: 'not-found' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects matching names from a different city', async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(new Response(list.replace('경주시', '다른시')));
    expect((await getHeritageByExactName('첨성대')).record).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not guess when the authoritative results are ambiguous', async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(new Response(`<result><totalCnt>2</totalCnt>${item}${item}</result>`));
    expect((await getHeritageByExactName('첨성대')).status).toBe('not-found');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('checks the returned detail identifiers against the verified search result', async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(new Response(list))
      .mockResolvedValueOnce(new Response(detail.replace('0000310000000', '0000990000000')));
    expect((await getHeritageByExactName('첨성대')).record).toBeNull();
  });

  it('coalesces requests and caches the public result across normalized names', async () => {
    const results = await Promise.all([getHeritageByExactName('첨성대'), getHeritageByExactName('경주 첨성대')]);
    expect(results[0]).toEqual(results[1]);
    await getHeritageByExactName('경주  첨성대');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    '<!DOCTYPE result [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><result></result>',
    '<html>Service unavailable</html>'
  ])('fails safely on unsupported or unsafe XML', async xml => {
    mocks.fetch.mockReset().mockResolvedValueOnce(new Response(xml));
    expect(await getHeritageByExactName('첨성대')).toEqual({ record: null, status: 'unavailable' });
  });

  it('keeps the base place usable when the provider times out', async () => {
    mocks.fetch.mockReset().mockRejectedValue(new Error('TimeoutError'));
    expect(await getHeritageByExactName('첨성대')).toEqual({ record: null, status: 'unavailable' });
    await getHeritageByExactName('첨성대');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('makes no provider request when optional enrichment is disabled', async () => {
    vi.stubEnv('HERITAGE_API_ENABLED', 'false');
    expect(await getHeritageByExactName('첨성대')).toEqual({ record: null, status: 'disabled' });
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
