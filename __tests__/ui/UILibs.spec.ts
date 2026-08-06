/**
 * @jest-environment jsdom
 *
 * Copyright (c) 2020-2022 Kenneth Tran and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { advanceTo, clear } from 'jest-date-mock';
import {
  appendDynamicTimestamp,
  downloadObjectAsJSON,
  partitionSettingsByKnownKeys,
} from '../../src/ui/UILibs';

describe('appendDynamicTimestamp', () => {
  afterEach(() => {
    clear();
  });
  it('should return dynamically generated timestamp.', () => {
    expect.assertions(2);
    advanceTo(new Date('2020-05-01 12:34:56'));
    expect(appendDynamicTimestamp()).toEqual('2020-05-01_12.34.56');
    advanceTo(new Date('2345-12-31 23:59:59'));
    expect(appendDynamicTimestamp()).toEqual('2345-12-31_23.59.59');
  });
});

describe('downloadObjectAsJSON', () => {
  afterEach(() => {
    clear();
  });
  it('should use default Export Name if one is not supplied', () => {
    expect.assertions(1);
    advanceTo(new Date('2020-05-08 01:23:45'));
    expect(downloadObjectAsJSON({})).toEqual({
      downloadHref: 'data:text/json;charset=urf-8,%7B%7D',
      downloadName: 'CAD_ExportedData_2020-05-08_01.23.45.json',
      status: true,
    });
  });
  it('should parse the object for downloading.', () => {
    expect.assertions(1);
    advanceTo(new Date('2020-05-08 01:23:45'));
    expect(
      downloadObjectAsJSON(
        { test: 'string', foo: 'bar', export: true, number: 123 },
        'TestExport',
      ),
    ).toEqual({
      downloadHref:
        'data:text/json;charset=urf-8,%7B%0A%20%20%22test%22%3A%20%22string%22%2C%0A%20%20%22foo%22%3A%20%22bar%22%2C%0A%20%20%22export%22%3A%20true%2C%0A%20%20%22number%22%3A%20123%0A%7D',
      downloadName: 'CAD_TestExport_2020-05-08_01.23.45.json',
      status: true,
    });
  });
});

import {
  cookiePolicyFromExpression,
  expressionFieldsForCookiePolicy,
} from '../../src/ui/UILibs';

describe('cookiePolicyFromExpression', () => {
  const base = {
    expression: 'x.com',
    listType: ListType.WHITE,
    storeId: 'default',
  } as Expression;

  it('returns "all" when cleanAllCookies is undefined', () => {
    expect(cookiePolicyFromExpression({ ...base })).toBe('all');
  });
  it('returns "all" when cleanAllCookies is true and not firstPartyOnly', () => {
    expect(cookiePolicyFromExpression({ ...base, cleanAllCookies: true })).toBe(
      'all',
    );
  });
  it('returns "firstPartyOnly" when firstPartyOnly is true', () => {
    expect(
      cookiePolicyFromExpression({
        ...base,
        cleanAllCookies: true,
        firstPartyOnly: true,
      }),
    ).toBe('firstPartyOnly');
  });
  it('returns "selected" when cleanAllCookies is false', () => {
    expect(
      cookiePolicyFromExpression({ ...base, cleanAllCookies: false }),
    ).toBe('selected');
  });
  it('prioritises "selected" over firstPartyOnly when cleanAllCookies is false', () => {
    expect(
      cookiePolicyFromExpression({
        ...base,
        cleanAllCookies: false,
        firstPartyOnly: true,
      }),
    ).toBe('selected');
  });
});

describe('expressionFieldsForCookiePolicy', () => {
  it('maps "all"', () => {
    expect(expressionFieldsForCookiePolicy('all')).toEqual({
      cleanAllCookies: true,
      firstPartyOnly: false,
    });
  });
  it('maps "firstPartyOnly"', () => {
    expect(expressionFieldsForCookiePolicy('firstPartyOnly')).toEqual({
      cleanAllCookies: true,
      firstPartyOnly: true,
    });
  });
  it('maps "selected"', () => {
    expect(expressionFieldsForCookiePolicy('selected')).toEqual({
      cleanAllCookies: false,
      firstPartyOnly: false,
    });
  });
});

describe('partitionSettingsByKnownKeys', () => {
  const knownKeys = ['activeMode', 'delayBeforeClean'];

  it('passes through settings whose name is a known key', () => {
    const settings: Setting[] = [
      { name: 'activeMode', value: true },
      { name: 'delayBeforeClean', value: 15 },
    ];
    expect(partitionSettingsByKnownKeys(settings, knownKeys)).toEqual({
      known: settings,
      dropped: [],
    });
  });

  it('reports settings whose name is not a known key as dropped', () => {
    const settings: Setting[] = [
      { name: 'activeMode', value: true },
      { name: 'cleanCookiesFromOpenTabsOnStartup', value: false },
    ];
    expect(partitionSettingsByKnownKeys(settings, knownKeys)).toEqual({
      known: [{ name: 'activeMode', value: true }],
      dropped: ['cleanCookiesFromOpenTabsOnStartup'],
    });
  });

  it('returns empty known/dropped arrays for an empty input', () => {
    expect(partitionSettingsByKnownKeys([], knownKeys)).toEqual({
      known: [],
      dropped: [],
    });
  });
});
