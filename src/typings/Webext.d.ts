/* eslint-disable @typescript-eslint/no-unused-vars */
// This file is only a stub to make typescript happy.
// Tests uses global.browser.*, actual usage is browser.*
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

declare namespace browser.cookies {
  // CookieProperties is the project's working cookie shape. firstPartyDomain is
  // kept OPTIONAL (the native Cookie marks it required, but at runtime Firefox
  // only sets it under first-party isolation and Chrome never does), so code and
  // fixtures treat an unset firstPartyDomain as undefined as they always have.
  interface CookieProperties
    extends Omit<browser.cookies.Cookie, 'firstPartyDomain'> {
    firstPartyDomain?: string;
  }
  type OptionalCookieProperties = Partial<CookieProperties>;
}

declare namespace browser.tabs {
  // Firefox tabs.onUpdated changeInfo, including CAD's cookieChanged extension;
  // the new types expose this only as the internal _OnUpdatedChangeInfo.
  interface TabChangeInfo {
    attention?: boolean;
    audible?: boolean;
    cookieChanged?: {
      removed: boolean;
      cookie: browser.cookies.Cookie;
      cause: browser.cookies.OnChangedCause;
    };
    discarded?: boolean;
    favIconUrl?: string;
    hidden?: boolean;
    isArticle?: boolean;
    mutedInfo?: browser.tabs.MutedInfo;
    pinned?: boolean;
    status?: string;
    title?: string;
    url?: string;
  }
}

declare namespace browser.contextualIdentities {
  // Project-named change-info type (native exposes it only as _OnUpdatedChangeInfo).
  type contextualIdentitiesChangeInfo = {
    contextualIdentity: ContextualIdentity;
  };
}

declare module 'redux-webext';
