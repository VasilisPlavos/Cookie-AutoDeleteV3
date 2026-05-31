# Privacy Policy — Cookie AutoDelete V3

_Last updated: 2026-05-31_

Cookie AutoDelete V3 ("the Extension") is an open-source browser extension that
automatically deletes cookies and other site data from tabs you have closed,
while preserving data for sites you have whitelisted.

## Summary

**The Extension does not collect, store, transmit, or sell any personal data.**
All processing happens locally in your browser. No data ever leaves your device,
and no analytics, tracking, or telemetry of any kind is used.

## What the Extension accesses and why

The Extension requests browser permissions solely to perform its single purpose —
cleaning up cookies and site data. None of this information is recorded or sent
anywhere; it is read transiently to decide what to clean and is discarded
immediately afterward.

| Permission | What it is used for |
|---|---|
| `cookies` | Read and delete cookies for closed, non-whitelisted sites. |
| `browsingData` | Clear related site data (cache, localStorage, IndexedDB, etc.). |
| `tabs` / `activeTab` | Detect when tabs close and which domains are open, to know what to clean. |
| Host access (`<all_urls>`) | Cookies can belong to any domain, so cleanup must work across all sites. |
| `alarms` | Schedule the delayed automatic cleanup. |
| `contextMenus` | Provide right-click clean / whitelist actions. |
| `notifications` | Notify you when a cleanup runs. |
| `storage` | Save your settings and whitelist **locally** in your browser. |

## Data storage

Your settings, whitelist/greylist entries, and activity log are stored **locally**
using the browser's extension storage API. This data:

- Never leaves your device,
- Is not transmitted to the developer or any third party,
- Can be cleared at any time by removing the Extension or resetting its settings.

If you enable your browser's built-in sync feature, the browser itself may
synchronize the Extension's local settings across your own devices. This is
handled entirely by your browser under its own privacy policy; the Extension
developer has no access to that data.

## Third parties

The Extension uses **no** third-party services, analytics, advertising, or
external network requests. It contains no remotely hosted code.

## Children's privacy

The Extension does not knowingly collect any data from anyone, including children.

## Changes to this policy

Any changes to this policy will be published at this URL with an updated date.

## Contact

Questions about this policy can be raised via the project's issue tracker:
https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues
