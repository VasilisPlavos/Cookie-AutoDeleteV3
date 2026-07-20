/**
 * Copyright (c) 2017-2022 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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

import {
  addPartitionKeyForRead,
  addPartitionKeyForRemove,
  CADCOOKIENAME,
  cadLog,
  extractMainDomain,
  getHostname,
  getSetting,
  isAWebpage,
  isChrome,
  isFirefoxNotAndroid,
  prepareCleanupDomains,
  prepareCookieDomain,
  returnMatchedExpressionObject,
  returnOptionalCookieAPIAttributes,
  showNotification,
  siteDataToBrowser,
  SITEDATATYPES,
  sleep,
  throwErrorNotification,
  trimDot,
  undefinedIsTrue,
} from './Libs';

/** Prepare a cookie for deletion */
export const prepareCookie = (
  cookie: browser.cookies.CookieProperties,
  debug = false,
): CookiePropertiesCleanup => {
  const cookieProperties: CookiePropertiesCleanup = {
    ...cookie,
    hostname: '',
    mainDomain: '',
    preparedCookieDomain: prepareCookieDomain(cookie),
  };
  if (cookieProperties.preparedCookieDomain.startsWith('file:')) {
    cookieProperties.hostname = cookieProperties.preparedCookieDomain;
    cookieProperties.mainDomain = cookieProperties.preparedCookieDomain;
  } else {
    cookieProperties.hostname = getHostname(
      cookieProperties.preparedCookieDomain,
    );
    cookieProperties.mainDomain = extractMainDomain(cookieProperties.hostname);
    // CHIPS: a partitioned cookie is third-party state owned by the partition's
    // top-level site, not by its own host. hostname/mainDomain always describe
    // the cookie's own host (so reporting attributes a deletion to the host that
    // was actually removed). The partition top-level site is exposed separately
    // via partitionHostname/partitionMainDomain; isSafeToClean keys the
    // keep/delete decision (whitelist + open tab) on those so a whitelisted host
    // (e.g. youtube.com) does not protect a cookie partitioned under a
    // non-whitelisted site. The removal target stays the host.
    // For opaque origins (topLevelSite='null'), getHostname returns '' so we
    // fall back to the raw string — it won't match any whitelist entry, which
    // is the correct behaviour (opaque partitions belong to no known site).
    const topLevelSite = cookie.partitionKey?.topLevelSite;
    if (topLevelSite) {
      cookieProperties.partitionHostname =
        getHostname(topLevelSite) || topLevelSite;
      cookieProperties.partitionMainDomain = extractMainDomain(
        cookieProperties.partitionHostname,
      );
    }
  }
  cadLog(
    {
      msg: 'CleanupService.prepareCookie: results',
      x: {
        domain: cookie.domain,
        path: cookie.path,
        preparedCookieDomain: cookieProperties.preparedCookieDomain,
        mainDomain: cookieProperties.mainDomain,
        hostname: cookieProperties.hostname,
      },
    },
    debug,
  );
  return cookieProperties;
};

/**
 * CHIPS: true when a partitioned cookie's own host differs from its partition
 * top-level site, i.e. it is third-party (cross-site) partitioned state. The
 * cookie's own host main domain is derived from its own domain and compared
 * against the partition top-level site's main domain. Self-contained so it works
 * whether or not the cookie has been run through prepareCookie.
 */
export const isCrossSitePartitioned = (
  cookie: CookiePropertiesCleanup,
): boolean => {
  const topLevelSite = cookie.partitionKey?.topLevelSite;
  if (!topLevelSite) return false;
  const partitionMainDomain =
    cookie.partitionMainDomain ??
    extractMainDomain(getHostname(topLevelSite) || topLevelSite);
  return extractMainDomain(trimDot(cookie.domain)) !== partitionMainDomain;
};

/** Returns an object representing the cookie with internal flags */
export const isSafeToClean = (
  state: State,
  cookieProperties: CookiePropertiesCleanup,
  cleanupProperties: CleanupPropertiesInternal,
): CleanReasonObject => {
  const debug = getSetting(state, SettingID.DEBUG_MODE) as boolean;
  const {
    mainDomain,
    storeId,
    hostname,
    name,
    expirationDate,
    firstPartyDomain,
    session,
  } = cookieProperties;
  const partialCookieInfo = {
    mainDomain,
    storeId,
    hostname,
    name,
    expirationDate,
    firstPartyDomain,
    session,
  };
  const { greyCleanup, openTabDomains, ignoreOpenTabs } = cleanupProperties;
  const openTabStatus = ignoreOpenTabs
    ? OpenTabStatus.TabsWereIgnored
    : OpenTabStatus.TabsWasNotIgnored;
  // CHIPS: a partitioned cookie is third-party state owned by its partition
  // top-level site, so the keep/delete decision (open tab + whitelist match)
  // keys on that site, not the cookie's own host. hostname/mainDomain stay the
  // host for reporting; these fall back to the host for non-partitioned cookies.
  const decisionHostname = cookieProperties.partitionHostname || hostname;
  const decisionMainDomain = cookieProperties.partitionMainDomain || mainDomain;
  cadLog(
    {
      msg: 'CleanupService.isSafeToClean:  Properties Debug',
      x: { partialCookieInfo, cleanupProperties, openTabStatus },
    },
    debug,
  );

  // Tests if the main domain is open on that specific storeId/container
  if (
    openTabDomains[storeId] &&
    openTabDomains[storeId].includes(decisionMainDomain)
  ) {
    cadLog(
      {
        msg: `CleanupService.isSafeToClean:  mainDomain found in openTabsDomain[${storeId}] - not cleaning.`,
        x: { partialCookieInfo, openTabsInStoreId: openTabDomains[storeId] },
      },
      debug,
    );
    return {
      cached: false,
      cleanCookie: false,
      cookie: cookieProperties,
      openTabStatus,
      reason: ReasonKeep.OpenTabs,
    };
  }

  // Checks the list for the first available match (against the partition
  // top-level site for partitioned cookies; see decisionHostname above).
  const matchedExpression = returnMatchedExpressionObject(
    state,
    storeId,
    decisionHostname,
  );

  // Internal CAD Cookie Checks
  if (
    matchedExpression &&
    cookieProperties.name === CADCOOKIENAME &&
    (matchedExpression.listType === ListType.WHITE ||
      (matchedExpression.listType === ListType.GREY &&
        (greyCleanup ||
          (matchedExpression.cleanSiteData &&
            matchedExpression.cleanSiteData.length !== 0))))
  ) {
    cadLog(
      {
        msg: 'CleanupService.isSafeToClean:  Internal CAD Cookie.  Removing Cookie to trigger browsingData cleanups.',
        x: {
          partialCookieInfo,
          cleanSiteData: matchedExpression.cleanSiteData,
        },
      },
      debug,
    );
    return {
      cached: false,
      cleanCookie: true,
      cookie: cookieProperties,
      expression: matchedExpression,
      openTabStatus,
      reason: greyCleanup
        ? ReasonClean.CADSiteDataCookieRestart
        : ReasonClean.CADSiteDataCookie,
    };
  }

  // Check if cookie is expired.
  if (getSetting(state, SettingID.CLEAN_EXPIRED) as boolean) {
    const now = Math.ceil(Date.now() / 1000);
    if (expirationDate && expirationDate < now) {
      cadLog(
        {
          msg: `CleanupService.isSafeToClean:  Cookie Expired since ${expirationDate}.  Date.now is ${now}`,
          x: {
            partialCookieInfo,
            cleanSiteData: matchedExpression?.cleanSiteData,
          },
        },
        debug,
      );
      return {
        cached: false,
        cleanCookie: true,
        cookie: cookieProperties,
        expression: matchedExpression,
        openTabStatus,
        reason: greyCleanup
          ? ReasonClean.ExpiredCookieRestart
          : ReasonClean.ExpiredCookie,
      };
    }
  }

  // Evaluate the keep/clean verdict for a single site through the shared list
  // rules: startup (greyCleanup) cleanup, whitelist/greylist matching, and the
  // cleanAllCookies/cookieNames name filter. Open-tab grace and expiry are
  // decided once for the whole cookie above, so they are not repeated here.
  // Running this for both the partition top-level site AND the cookie's own host
  // lets a cross-site (CHIPS) cookie reuse the exact same protection logic for
  // both sides instead of a partial duplicate.
  const decideForSite = (
    matched: Expression | undefined,
  ): {
    clean: boolean;
    reason: ReasonKeep | ReasonClean;
    expression?: Expression;
  } => {
    // Unmatched by any list: clean. Startup and normal cleanup differ only in
    // the reason reported. Returning here also narrows `matched` to defined for
    // the remaining checks.
    if (!matched) {
      return {
        clean: true,
        reason: greyCleanup
          ? ReasonClean.StartupNoMatchedExpression
          : ReasonClean.NoMatchedExpression,
      };
    }
    // Startup cleanup of a greylisted match whose cookie name is not kept.
    if (
      greyCleanup &&
      matched.listType === ListType.GREY &&
      // Tests the cleanAllCookies flag and if it doesn't include that name or if there is no cookieNames
      (undefinedIsTrue(matched.cleanAllCookies) ||
        (matched.cookieNames && !matched.cookieNames.includes(name)))
    ) {
      return {
        clean: true,
        reason: ReasonClean.StartupCleanupAndGreyList,
        expression: matched,
      };
    }
    // Matched, but the cookie name is not on the keep-list.
    if (
      !undefinedIsTrue(matched.cleanAllCookies) &&
      matched.cookieNames &&
      !matched.cookieNames.includes(name)
    ) {
      return {
        clean: true,
        reason: ReasonClean.MatchedExpressionButNoCookieName,
        expression: matched,
      };
    }
    return {
      clean: false,
      reason: ReasonKeep.MatchedExpression,
      expression: matched,
    };
  };

  // matchedExpression was looked up against decisionHostname (the partition
  // top-level site for partitioned cookies, the host otherwise), so this is the
  // partition/decision-site verdict.
  const partitionDecision = decideForSite(matchedExpression);

  // The partition (or single-site) verdict governs directly when the cookie is
  // not cross-site partitioned, or when the partition site itself is unprotected
  // (its verdict cleans the cookie regardless of the host). Only a cross-site
  // partitioned cookie whose partition IS protected needs the host re-check
  // below — a CHIPS cookie is kept only when BOTH sites are protected.
  if (!isCrossSitePartitioned(cookieProperties) || partitionDecision.clean) {
    cadLog(
      {
        msg: `CleanupService.isSafeToClean:  Partition/single-site verdict governs: ${partitionDecision.reason}.`,
        x: { partialCookieInfo, matchedExpression },
      },
      debug,
    );
    return {
      cached: false,
      cleanCookie: partitionDecision.clean,
      cookie: cookieProperties,
      expression: partitionDecision.expression,
      openTabStatus,
      reason: partitionDecision.reason,
    };
  }

  // Partition is protected; re-run the same rules against the cookie's own host.
  // hostname always holds the cookie's own host (see prepareCookie), so the
  // host-level check keys on it directly. Because the decision flows through
  // decideForSite, cleanAllCookies/cookieNames apply to the host exactly as they
  // do to the partition, and the expression attached is the host's — the one
  // that actually drives the clean.
  const hostDecision = decideForSite(
    returnMatchedExpressionObject(state, storeId, hostname),
  );
  if (hostDecision.clean) {
    cadLog(
      {
        msg: 'CleanupService.isSafeToClean:  Cross-site partitioned cookie whose host is not protected (host verdict drives the clean).  Safe to Clean.',
        x: { partialCookieInfo, hostExpression: hostDecision.expression },
      },
      debug,
    );
    return {
      cached: false,
      cleanCookie: true,
      cookie: cookieProperties,
      expression: hostDecision.expression,
      openTabStatus,
      reason: ReasonClean.PartitionedThirdParty,
    };
  }

  // #58: the partition (top-level) site is protected but is configured to keep
  // first-party cookies only, so this cross-site (CHIPS) cookie is deleted even
  // though its own host is whitelisted (Case 5 override). matchedExpression is the
  // partition site's expression (looked up against decisionHostname above).
  if (matchedExpression?.firstPartyOnly) {
    cadLog(
      {
        msg: 'CleanupService.isSafeToClean:  Cross-site partitioned cookie under a first-party-only partition site.  Safe to Clean.',
        x: { partialCookieInfo, hostExpression: hostDecision.expression },
      },
      debug,
    );
    return {
      cached: false,
      cleanCookie: true,
      cookie: cookieProperties,
      expression: hostDecision.expression,
      openTabStatus,
      reason: ReasonClean.FirstPartyOnly,
    };
  }

  // Both the partition site and the host are protected → keep.
  cadLog(
    {
      msg: 'CleanupService.isSafeToClean:  Cross-site partitioned cookie protected on both host and partition.  Cookie stays!',
      x: { partialCookieInfo, matchedExpression },
    },
    debug,
  );
  return {
    cached: false,
    cleanCookie: false,
    cookie: cookieProperties,
    expression: partitionDecision.expression,
    openTabStatus,
    reason: ReasonKeep.MatchedExpression,
  };
};

/** Clean cookies */
export const cleanCookies = async (
  state: State,
  markedForDeletion: CleanReasonObject[],
): Promise<void> => {
  const promiseArr: Promise<unknown>[] = [];
  markedForDeletion.forEach((obj) => {
    const cookieProperties = obj.cookie;
    const cookieAPIProperties = returnOptionalCookieAPIAttributes(state, {
      firstPartyDomain: cookieProperties.firstPartyDomain,
      storeId: cookieProperties.storeId,
    });
    const cookieRemove = addPartitionKeyForRemove(state.cache, cookieProperties, {
      ...cookieAPIProperties,
      name: cookieProperties.name,
      url: cookieProperties.preparedCookieDomain,
    });
    // url: "http://domain.com" + cookies[i].path
    cadLog(
      {
        msg: 'CleanupService.cleanCookies: Cookie being removed through browser.cookies.remove via Promises:',
        x: cookieRemove,
      },
      getSetting(state, SettingID.DEBUG_MODE) as boolean,
    );
    const promise = browser.cookies.remove(cookieRemove);
    promiseArr.push(promise);
  });
  await Promise.all(promiseArr).catch((e) => {
    throw e;
  });
};

// Cleanup of all cookies for domain.
export const clearCookiesForThisDomain = async (
  state: State,
  tab: browser.tabs.Tab,
): Promise<boolean> => {
  const hostname = getHostname(tab.url);
  const getCookies = await browser.cookies.getAll(
    addPartitionKeyForRead(
      state.cache,
      returnOptionalCookieAPIAttributes(state, {
        domain: hostname,
        storeId: tab.cookieStoreId,
      }),
    ),
  );
  // Filter out our own CAD cookie that cleans up other Browsing Data
  const cookies = getCookies.filter((c) => c.name !== CADCOOKIENAME);

  if (cookies.length > 0) {
    let cookieDeletedCount = 0;
    for (const cookie of cookies) {
      const r = await browser.cookies.remove(
        addPartitionKeyForRemove(
          state.cache,
          cookie,
          returnOptionalCookieAPIAttributes(state, {
            firstPartyDomain: cookie.firstPartyDomain,
            name: cookie.name,
            storeId: cookie.storeId,
            url: prepareCookieDomain(cookie),
          }),
        ) as {
          // This explicit type is required as cookies.remove requires these two
          // parameters, but url is not defined in cookies.Cookie as it is made
          // up of cookie.domain + cookie.path, and neither required parameters
          // can take 'undefined'.  returnOptionalCookieAPIAttributes has the
          // parameters set to Partial<CookiePropertiesCleanup>, which appends
          // '| undefined' to all parameters.
          name: string;
          url: string;
        },
      );
      if (r) cookieDeletedCount += 1;
    }
    showNotification(
      {
        duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
        msg: `${browser.i18n.getMessage('manualCleanSuccess', [
          browser.i18n.getMessage('cookiesText'),
          hostname,
        ])}\n${browser.i18n.getMessage('manualCleanRemoved', [
          cookieDeletedCount.toString(),
          cookies.length.toString(),
        ])}`,
      },
      getSetting(state, SettingID.NOTIFY_MANUAL) as boolean,
    );

    return cookieDeletedCount > 0;
  }

  showNotification(
    {
      duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
      msg: `${browser.i18n.getMessage('manualCleanNothing', [
        browser.i18n.getMessage('cookiesText'),
        hostname,
      ])}`,
    },
    getSetting(state, SettingID.NOTIFY_MANUAL) as boolean,
  );

  return cookies.length > 0;
};

export const clearLocalStorageForThisDomain = async (
  state: State,
  tab: browser.tabs.Tab,
): Promise<boolean> => {
  // Using this method to ensure cross browser compatibility
  try {
    let local = 0;
    let session = 0;
    const result = await browser.tabs.executeScript({
      code: `var cad_r = {local: window.localStorage.length, session: window.sessionStorage.length};window.localStorage.clear();window.sessionStorage.clear();cad_r;`,
    });
    result.forEach((frame: { [key: string]: any }) => {
      local += frame.local;
      session += frame.session;
    });
    showNotification(
      {
        duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
        msg: `${browser.i18n.getMessage('manualCleanSuccess', [
          browser.i18n.getMessage('localStorageText'),
          getHostname(tab.url),
        ])}\n${browser.i18n.getMessage('removeStorageCount', [
          local.toString(),
          browser.i18n.getMessage('localStorageText'),
        ])}\n${browser.i18n.getMessage('removeStorageCount', [
          session.toString(),
          browser.i18n.getMessage('sessionStorageText'),
        ])}`,
      },
      getSetting(state, SettingID.NOTIFY_MANUAL) as boolean,
    );
    return true;
  } catch (e: unknown) {
    if (e instanceof Error) {
      throwErrorNotification(
        e,
        getSetting(state, SettingID.NOTIFY_DURATION) as number,
      );
    }
    await sleep(750);
    showNotification({
      duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
      msg: `${browser.i18n.getMessage('manualCleanNothing', [
        browser.i18n.getMessage('localStorageText'),
        getHostname(tab.url),
      ])}`,
    });
    return false;
  }
};

export const clearSiteDataForThisDomain = async (
  state: State,
  siteData: SiteDataType | 'All',
  hostname: string,
): Promise<boolean> => {
  if (hostname.trim() === '') return false;
  const debug = getSetting(state, SettingID.DEBUG_MODE) as boolean;
  cadLog(
    {
      msg: `CleanupService.clearSiteDataForThisDomain: Received ${siteData} clean request for ${hostname}.`,
    },
    debug,
  );
  const domains = prepareCleanupDomains(hostname, state.cache.browserDetect);
  if (siteData === 'All') {
    const siteDataAll: string[] = [];
    for (const sd of SITEDATATYPES) {
      await removeSiteData(
        state,
        sd,
        state.cache.browserDetect,
        domains,
        debug,
        false,
      );
      siteDataAll.push(browser.i18n.getMessage(`${siteDataToBrowser(sd)}Text`));
    }
    // To consolidate the notification shown, we do it out here.
    showNotification(
      {
        duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
        msg: browser.i18n.getMessage('activityLogSiteDataDomainsText', [
          siteDataAll.join(', '),
          domains.join(', '),
        ]),
        title: browser.i18n.getMessage('notificationTitleSiteData'),
      },
      getSetting(state, SettingID.NOTIFY_MANUAL) as boolean,
    );
  } else {
    await removeSiteData(
      state,
      siteData,
      state.cache.browserDetect,
      domains,
      debug,
      true,
    );
  }
  return true;
};

export const removeSiteData = async (
  state: State,
  siteData: SiteDataType,
  bName: browserName = browserDetect() as browserName,
  domains: string[],
  debug: boolean,
  manual = false,
): Promise<boolean> => {
  const listName = ((b: browserName) => {
    switch (b) {
      case browserName.Chrome:
      case browserName.Opera:
        return 'origins';
      case browserName.Firefox:
      default:
        return 'hostnames';
    }
  })(bName);
  const sd = siteDataToBrowser(siteData);
  cadLog(
    {
      msg: `CleanupService.removeSiteData: Cleanup of ${listName} in ${bName} for ${sd}:`,
      x: domains,
    },
    debug,
  );
  try {
    await browser.browsingData.remove(
      {
        [listName]: domains,
      },
      {
        [sd]: true,
      },
    );
    showNotification(
      {
        duration: getSetting(state, SettingID.NOTIFY_DURATION) as number,
        msg: browser.i18n.getMessage('activityLogSiteDataDomainsText', [
          browser.i18n.getMessage(`${sd}Text`),
          domains.join(', '),
        ]),
        title: browser.i18n.getMessage('notificationTitleSiteData'),
      },
      manual && (getSetting(state, SettingID.NOTIFY_MANUAL) as boolean),
    );
    return true;
  } catch (e: unknown) {
    cadLog(
      {
        msg: `CleanupService.removeSiteData:  browser.browsingData.remove of ${listName} for ${sd} returned an error:`,
        type: 'error',
        x: e,
      },
      debug,
    );
    if (e instanceof Error) {
      throwErrorNotification(
        e,
        getSetting(state, SettingID.NOTIFY_DURATION) as number,
      );
    }

    return false;
  }
};

/**
 * Build synthetic CleanReasonObjects for the hostnames recorded in the
 * site-data registry (state.domainsToClean). Each hostname is evaluated by the
 * SAME isSafeToClean logic through a synthetic cookie, so whitelist/greylist
 * and open-tab protection apply identically to registry domains. The returned
 * objects must be passed ONLY to otherBrowsingDataCleanup — never to
 * cleanCookies (there is no real cookie to remove).
 *
 * Site data is global, so the synthetic cookie uses the normalised 'default'
 * store for list matching, and open-tab protection is widened to span every
 * container (a hostname open in ANY store is kept).
 */
export const buildRegistrySiteDataObjects = (
  state: State,
  cleanupProperties: CleanupPropertiesInternal,
): CleanReasonObject[] => {
  const unionOpenDomains = new Set<string>();
  Object.values(cleanupProperties.openTabDomains).forEach((domains) =>
    domains.forEach((d) => unionOpenDomains.add(d)),
  );
  const registryProps: CleanupPropertiesInternal = {
    ...cleanupProperties,
    openTabDomains: { default: Array.from(unionOpenDomains) },
  };
  return (state.domainsToClean || [])
    .filter((hostname) => hostname.trim() !== '')
    .map((hostname) => {
      const syntheticCookie: CookiePropertiesCleanup = {
        domain: hostname,
        hostname,
        mainDomain: extractMainDomain(hostname),
        name: 'CADSiteDataRegistry',
        path: '/',
        preparedCookieDomain: `https://${hostname}`,
        secure: true,
        session: false,
        storeId: 'default',
        value: '',
      } as CookiePropertiesCleanup;
      return isSafeToClean(state, syntheticCookie, registryProps);
    });
};

/** This will use the browsingData's hostname/origin attribute to delete any extra browsing data */
export const otherBrowsingDataCleanup = async (
  state: State,
  isSafeToCleanObjects: CleanReasonObject[],
): Promise<ActivityLog['browsingDataCleanup']> => {
  const chrome = isChrome(state.cache);
  const debug = getSetting(state, SettingID.DEBUG_MODE) as boolean;
  const browsingDataResult: ActivityLog['browsingDataCleanup'] = {};
  const ffVersion = Number.parseInt(state.cache.browserVersion);
  if (
    getSetting(state, SettingID.CLEANUP_CACHE) &&
    ((isFirefoxNotAndroid(state.cache) && ffVersion >= 78) || chrome)
  ) {
    browsingDataResult[SiteDataType.CACHE] = await cleanSiteData(
      state,
      SiteDataType.CACHE,
      isSafeToCleanObjects,
      state.cache.browserDetect,
      debug,
    );
  }
  if (
    getSetting(state, SettingID.CLEANUP_INDEXEDDB) &&
    ((isFirefoxNotAndroid(state.cache) && ffVersion >= 77) || chrome)
  ) {
    browsingDataResult[SiteDataType.INDEXEDDB] = await cleanSiteData(
      state,
      SiteDataType.INDEXEDDB,
      isSafeToCleanObjects,
      state.cache.browserDetect,
      debug,
    );
  }
  if (
    getSetting(state, SettingID.CLEANUP_LOCALSTORAGE) &&
    ((isFirefoxNotAndroid(state.cache) && ffVersion >= 58) || chrome)
  ) {
    browsingDataResult[SiteDataType.LOCALSTORAGE] = await cleanSiteData(
      state,
      SiteDataType.LOCALSTORAGE,
      isSafeToCleanObjects,
      state.cache.browserDetect,
      debug,
    );
  }
  if (
    getSetting(state, SettingID.CLEANUP_PLUGINDATA) &&
    ((isFirefoxNotAndroid(state.cache) && ffVersion >= 78) || chrome)
  ) {
    browsingDataResult[SiteDataType.PLUGINDATA] = await cleanSiteData(
      state,
      SiteDataType.PLUGINDATA,
      isSafeToCleanObjects,
      state.cache.browserDetect,
      debug,
    );
  }
  if (
    getSetting(state, SettingID.CLEANUP_SERVICEWORKERS) &&
    ((isFirefoxNotAndroid(state.cache) && ffVersion >= 77) || chrome)
  ) {
    browsingDataResult[SiteDataType.SERVICEWORKERS] = await cleanSiteData(
      state,
      SiteDataType.SERVICEWORKERS,
      isSafeToCleanObjects,
      state.cache.browserDetect,
      debug,
    );
  }

  return browsingDataResult;
};

/**
 * Filters incoming objects with the site data to clean. (From Autoclean trigger)
 * @param state The State.
 * @param siteData The site data type
 * @param cleanReasonObjects Objects returned from isSafeToClean()
 * @param bName - Browser Name per browserDetect() function
 * @param debug True if debug mode.
 */
export const cleanSiteData = async (
  state: State,
  siteData: SiteDataType,
  cleanReasonObjects: CleanReasonObject[],
  bName: browserName = browserDetect() as browserName,
  debug: boolean,
): Promise<string[]> => {
  const domains = cleanReasonObjects
    .filter((obj) => filterSiteData(obj, siteData, debug))
    .map((o) => o.cookie.domain)
    .filter((domain) => domain.trim() !== '');

  const cleanList: string[] = [];
  for (const domain of domains) {
    cleanList.push(...prepareCleanupDomains(domain, bName));
  }

  if (cleanList.length > 0) {
    const r = await removeSiteData(
      state,
      siteData,
      bName,
      [...new Set(cleanList)],
      debug,
      false,
    );
    if (r) {
      return domains;
    }
  }
  return [];
};

/** Setup SiteData cleaning.  Undefined will not be cleaned. */
export const parseCleanSiteData = (bool?: boolean): boolean => {
  return bool === undefined ? false : bool;
};

/** Filter the deleted cookies from site data type */
export const filterSiteData = (
  obj: CleanReasonObject,
  siteData: SiteDataType,
  debug = false,
): boolean => {
  const notProtectedByOpenTab = obj.reason !== ReasonKeep.OpenTabs;
  const notInAnyLists =
    obj.reason === ReasonClean.NoMatchedExpression ||
    obj.reason === ReasonClean.StartupNoMatchedExpression;
  const isExpiredNotRestart = obj.reason === ReasonClean.ExpiredCookie;
  const isExpiredRestart = obj.reason === ReasonClean.ExpiredCookieRestart;
  const isCADCookieNoExpression =
    (obj.reason === ReasonClean.CADSiteDataCookie ||
      ReasonClean.CADSiteDataCookieRestart) &&
    obj.expression === undefined;
  const nonBlankCookieHostName = obj.cookie.hostname.trim() !== '';
  const cleanSiteDataInExpression = parseCleanSiteData(
    obj.expression?.cleanSiteData?.includes(siteData),
  );
  const isRestartCleanup =
    (isExpiredRestart && obj.expression?.listType === ListType.GREY) ||
    (obj.reason === ReasonClean.CADSiteDataCookieRestart &&
      obj.expression?.listType === ListType.GREY) ||
    obj.reason === ReasonClean.StartupCleanupAndGreyList;
  const canCleanSiteData =
    isCADCookieNoExpression || cleanSiteDataInExpression || isRestartCleanup;
  const cro: CleanReasonObject = {
    ...obj,
    cookie: {
      ...obj.cookie,
      value: debug ? '***' : obj.cookie.value,
    },
  };
  cadLog(
    {
      msg: 'CleanupService.filterSiteData: debug data.',
      x: {
        notProtectedByOpenTab,
        notInAnyLists,
        siteData,
        isExpiredNotRestart,
        isExpiredRestart,
        isCADCookieNoExpression,
        cleanSiteDataInExpression,
        isRestartCleanup,
        canCleanSiteData,
        nonBlankCookieHostName,
        notOpenTabAndCanClean: notProtectedByOpenTab && canCleanSiteData,
        CleanReasonObject: cro,
      },
    },
    debug,
  );
  // CHIPS: browsingData.remove is not partition-aware, so for a cross-site
  // partitioned cookie (host ≠ partition site) removing by host_key would
  // affect the wrong origin. Same-site partitioned cookies (host == partition)
  // are fine — browsingData.remove by host clears the right data either way.
  const r =
    !isCrossSitePartitioned(obj.cookie) &&
    (notInAnyLists || (notProtectedByOpenTab && canCleanSiteData)) &&
    nonBlankCookieHostName;
  cadLog(
    {
      msg: `CleanupService.filterSiteData: ${siteData} cleanup returned ${r} for ${cro.cookie.hostname}`,
    },
    debug,
  );
  return r;
};

/**
 * Store all tabs' host domains to prevent cookie deletion from those domains
 * returns empty object if we ignore all open Tabs
 * Tabs now grouped by container e.g. 'default', 'firefox-container-1', '0'
 */
export const returnContainersOfOpenTabDomains = async (
  ignoreOpenTabs: boolean,
  cleanDiscardedTabs: boolean,
): Promise<Record<string, string[]>> => {
  if (ignoreOpenTabs) {
    return {};
  }
  const tabs = await browser.tabs.query({
    windowType: 'normal',
  });
  const openTabs: { [k: string]: Set<string> } = {};
  for (const tab of tabs) {
    if (isAWebpage(tab.url) && (!cleanDiscardedTabs || !tab.discarded)) {
      // Chrome doesn't have tab.cookieStoreId, so rely on tab.incognito
      const cookieStoreId = tab.cookieStoreId || (tab.incognito ? '1' : '0');
      if (!openTabs[cookieStoreId]) {
        openTabs[cookieStoreId] = new Set<string>();
      }
      openTabs[cookieStoreId].add(extractMainDomain(getHostname(tab.url)));
    }
  }
  const openTabsArray: { [k: string]: string[] } = {};
  for (const id of Object.keys(openTabs)) {
    openTabsArray[id] = Array.from(openTabs[id]);
  }
  return openTabsArray;
};

/** Main function for cookie cleanup. Returns a list of domains that cookies and other site data were deleted from */
export const cleanCookiesOperation = async (
  state: State,
  cleanupProperties: CleanupProperties = {
    greyCleanup: false,
    ignoreOpenTabs: false,
  },
): Promise<Record<string, any>> => {
  const debug = getSetting(state, SettingID.DEBUG_MODE) as boolean;
  const deletedSiteDataArrays: ActivityLog['browsingDataCleanup'] = {};
  const setOfDeletedDomainCookies = new Set<string>();
  const cachedResults: Required<ActivityLog> = {
    dateTime: new Date().toString(),
    recentlyCleaned: 0,
    storeIds: {},
    browsingDataCleanup: {},
    siteDataCleaned: false,
  };
  // Scrub private cookieStores
  const storesIdsToScrub = ['firefox-private', 'private', '1'];
  const openTabDomains = await returnContainersOfOpenTabDomains(
    cleanupProperties.ignoreOpenTabs,
    getSetting(state, SettingID.CLEAN_DISCARDED) as boolean,
  );
  const newCleanupProperties: CleanupPropertiesInternal = {
    ...cleanupProperties,
    openTabDomains,
  };

  const cookieStoreIds = new Set<string>();

  // Manually add default containers.
  switch (state.cache.browserDetect || (browserDetect() as browserName)) {
    case browserName.Firefox:
      cookieStoreIds.add('default');
      cookieStoreIds.add('firefox-default');
      if (await browser.extension.isAllowedIncognitoAccess()) {
        cookieStoreIds.add('firefox-private');
        cookieStoreIds.add('private');
      }
      break;
    case browserName.Chrome:
    case browserName.Opera:
      cookieStoreIds.add('0');
      if (await browser.extension.isAllowedIncognitoAccess()) {
        cookieStoreIds.add('1');
      }
      break;
    default:
      break;
  }

  // Store cookieStoreIds from the contextualIdentities API
  if (getSetting(state, SettingID.CONTEXTUAL_IDENTITIES)) {
    const contextualIdentitiesObjects =
      await browser.contextualIdentities.query({});

    for (const cio of contextualIdentitiesObjects) {
      cookieStoreIds.add(cio.cookieStoreId);
    }
  }

  // Store cookieStoreIds from the cookies API
  const cookieStores = (await browser.cookies.getAllCookieStores()) || [];
  for (const store of cookieStores) {
    if (
      getSetting(state, SettingID.CONTEXTUAL_IDENTITIES) ||
      !store.id.startsWith('firefox-container')
    ) {
      cookieStoreIds.add(store.id);
    }
  }

  // Clean for each cookieStore jar
  for (const id of cookieStoreIds) {
    let cookies: browser.cookies.Cookie[] = [];
    try {
      cookies = await browser.cookies.getAll(
        addPartitionKeyForRead(
          state.cache,
          returnOptionalCookieAPIAttributes(state, {
            storeId: id,
          }),
        ),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        cadLog(
          {
            msg: `CleanupService.cleanCookiesOperation:  browser.cookies.getAll for id: ${id} threw an error.`,
            type: 'error',
            x: e.message,
          },
          true,
        );
      }
    }

    // No cookies from specified container.  Skip rest of cleanup.
    if (!cookies || cookies.length === 0) continue;

    const isSafeToCleanObjects = cookies.map((cookie) => {
      return isSafeToClean(
        state,
        prepareCookie(cookie, debug),
        newCleanupProperties,
      );
    });

    if (debug) {
      // We need deep copying object to as to not change actual cookies
      const sanitized: CleanReasonObject[] = isSafeToCleanObjects.map((obj) => {
        return {
          ...obj,
          cookie: {
            ...obj.cookie,
            value: '***',
          },
        };
      });
      cadLog(
        {
          msg: 'CleanupService.cleanCookiesOperation:  isSafeToCleanObjects Result',
          x: sanitized,
        },
        debug,
      );
    }

    const markedForDeletion = isSafeToCleanObjects.filter((obj) => {
      const r = obj.cleanCookie && obj.cookie.hostname.trim() !== '';
      cadLog(
        {
          msg: `CleanupService.cleanCookiesOperation: Clean Cookies returned ${r} for ${obj.cookie.hostname}`,
        },
        debug,
      );
      return r;
    });

    if (debug) {
      // We need deep copying object to as to not change actual cookies
      const sanitized: CleanReasonObject[] = markedForDeletion.map((obj) => {
        return {
          ...obj,
          cookie: {
            ...obj.cookie,
            value: '***',
          },
        };
      });
      cadLog(
        {
          msg: 'CleanupService.cleanCookiesOperation:  Cookies markedForDeletion Result',
          x: sanitized,
        },
        debug,
      );
    }

    try {
      await cleanCookies(state, markedForDeletion);
    } catch (e: unknown) {
      cadLog(
        {
          type: 'error',
          x: e,
        },
        true,
      );
      if (e instanceof Error) {
        throwErrorNotification(
          e,
          getSetting(state, SettingID.NOTIFY_DURATION) as number,
        );
      }
    }

    // Extract away the CAD Internal Cookie from Clean Entries.
    const removedCookies = markedForDeletion.filter((c) => {
      return c.cookie.name !== CADCOOKIENAME;
    });

    if (removedCookies.length !== 0) {
      cachedResults.storeIds[id] = removedCookies;
    }
    cachedResults.recentlyCleaned += removedCookies.length;
    removedCookies.forEach((obj) => {
      setOfDeletedDomainCookies.add(
        getSetting(state, SettingID.CONTEXTUAL_IDENTITIES)
          ? `${obj.cookie.hostname} (${state.cache[obj.cookie.storeId]})`
          : obj.cookie.hostname,
      );
    });

    // Handle all other browsingData cleanups.
    const storeResults = await otherBrowsingDataCleanup(
      state,
      isSafeToCleanObjects,
    );
    // Don't store domains for private browsing data
    if (storesIdsToScrub.includes(id) || !storeResults) continue;
    for (const sd of SITEDATATYPES) {
      if ((storeResults[sd] || []).length > 0) {
        cachedResults.siteDataCleaned = true;
        deletedSiteDataArrays[sd] = (deletedSiteDataArrays[sd] || []).concat(
          (storeResults[sd] as string[]).map((domain) => trimDot(domain)),
        );
      }
    }
  }

  // Startup safety-net: clean non-cookie site data for domains recorded in the
  // registry (first-party sites visited during the previous session that may
  // have left no cookie). Registry entries are global, so this runs once,
  // outside the per-store loop. Only on startup (greyCleanup).
  if (cleanupProperties.greyCleanup && (state.domainsToClean || []).length > 0) {
    const registryObjects = buildRegistrySiteDataObjects(
      state,
      newCleanupProperties,
    );
    const registryResults = await otherBrowsingDataCleanup(
      state,
      registryObjects,
    );
    if (registryResults) {
      for (const sd of SITEDATATYPES) {
        if ((registryResults[sd] || []).length > 0) {
          cachedResults.siteDataCleaned = true;
          deletedSiteDataArrays[sd] = (deletedSiteDataArrays[sd] || []).concat(
            (registryResults[sd] as string[]).map((domain) => trimDot(domain)),
          );
        }
      }
    }
  }

  for (const sd of SITEDATATYPES) {
    cachedResults.browsingDataCleanup[sd] = deletedSiteDataArrays[sd]
      ? Array.from(new Set(deletedSiteDataArrays[sd] as string[]))
      : [];
  }

  for (const id of storesIdsToScrub) {
    delete cachedResults.storeIds[id];
  }

  return {
    cachedResults,
    setOfDeletedDomainCookies: Array.from(setOfDeletedDomainCookies),
  };
};
