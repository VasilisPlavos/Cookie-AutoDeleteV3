# Chrome Internal Engine vs. Extensions API

What the Chrome browser itself can do to the data shown under
`chrome://settings/content/all`, compared to what an extension (like Cookie
AutoDelete) can do through the public WebExtensions APIs.

The key takeaway: only **cookies** can be targeted surgically (per partition).
Everything else can be deleted only by **hostname/origin**, which means an
extension cannot remove a third party's *partitioned* (CHIPS) storage without
also wiping that same host's legitimate first-party data. This is why CAD
deletes cross-site partitioned cookies but intentionally leaves their non-cookie
storage (cache, IndexedDB, service workers) untouched.

| Data type / feature in `content/all` | Chrome access (internal engine) | Extension API access | Extension API | Precision / limitations |
| --- | --- | --- | --- | --- |
| **Cookies** | Full (read, write, delete, partitioned) | Full | `chrome.cookies` | **Surgical.** Supports the `partitionKey` parameter. Can read/delete a third-party cookie inside a specific partition ("basement"). |
| **Cache** (cached images, files) | Full (including partitioned data) | Limited (delete only) | `chrome.browsingData.removeCache()` | **Bulldozer.** Deletes only by hostname (e.g. `google.com`) or time range. Does **not** support partitions. |
| **Storage** (Local Storage, IndexedDB, WebSQL) | Full (including partitioned data) | Limited (delete only) | `chrome.browsingData.removeLocalStorage()`, `removeIndexedDB()`, `removeWebSQL()` | **Bulldozer.** Like Cache — a delete request wipes the entire profile for that site (first-party **and** third-party). |
| **Service Workers** (offline scripts & notifications) | Full | Limited (delete only) | `chrome.browsingData.removeServiceWorkers()` | No partition precision. Deletes service workers by origin. |
| **File Systems** (site file-system data) | Full | Limited (delete only) | `chrome.browsingData.removeFileSystems()` | Deletes the site's stored file system as a whole. |
| **Permissions** (camera, microphone, location, pop-ups, etc.) | Full | Full (read, write) | `chrome.contentSettings` | **Surgical.** An extension can allow / block / ask per site, exactly like the settings menu. |
| **Passwords / Autofill** (often shown in a site's data) | Full | Strictly restricted | No public API (`chrome.passwordsPrivate` is Google-internal only) | Extensions cannot read or delete Chrome's saved passwords. They can only read the page DOM (e.g. password managers like Bitwarden). |

## Why it matters for Cookie AutoDelete

- **Cookies** → `chrome.cookies.remove` accepts `partitionKey`, so CAD can delete
  a cross-site partitioned cookie (e.g. `google.com` under `astynomia.gr`)
  without touching the real first-party `google.com`.
- **Everything else** → `chrome.browsingData.remove*` is host-scoped only. Asking
  it to clear `google.com` cache/storage would also destroy the legitimate
  (possibly whitelisted) first-party `google.com` data. Because that collateral
  damage is unacceptable, CAD skips non-cookie browsing-data cleanup for
  cross-site partitioned entries (see `isCrossSitePartitioned` in
  `src/services/CleanupService.ts`).
