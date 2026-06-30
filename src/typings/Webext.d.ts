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
  // Native Cookie already carries firstPartyDomain (required) and a native
  // partitionKey (PartitionKey with topLevelSite). CookieProperties is the
  // project's working cookie shape; it extends the native Cookie unchanged.
  interface CookieProperties extends browser.cookies.Cookie {}
  type OptionalCookieProperties = Partial<CookieProperties>;
}

declare module 'redux-webext';
