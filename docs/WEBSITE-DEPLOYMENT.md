# SwarSaathi website deployment

The public marketing website lives in:

```text
site/
```

Deploy this folder to `swarsaathi.com`. Do not deploy `web/dist` to the root domain if the goal is a professional public website; `web/dist` is the app shell used for the mobile/web app.

## Cloudflare Pages

### Direct upload

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Create or open the Pages project for `swarsaathi`.
4. Upload the `site/` folder.
5. Deploy.

### Git-based deploy

Use these settings:

```text
Framework preset: None
Build command: (leave blank)
Build output directory: site
Root directory: /
```

## Custom domain

After the Pages deploy is live:

1. Open the Pages project.
2. Go to **Custom domains**.
3. Add:

```text
swarsaathi.com
www.swarsaathi.com
```

4. Let Cloudflare create the DNS records (or add them manually � see below).
5. Confirm both URLs resolve:

```text
https://swarsaathi.com
https://www.swarsaathi.com
```

## Cloudflare DNS checklist (HTTPS + www)

Use this when `swarsaathi.com` is on Cloudflare nameservers and the site is deployed to **Cloudflare Pages**.

### 1. Nameservers (registrar)

At your domain registrar, nameservers must be Cloudflare only (no mixed registrar DNS):

```text
melany.ns.cloudflare.com
jerry.ns.cloudflare.com
```

If the site already loads on Cloudflare, this step is done.

### 2. Pages custom domains (source of truth)

In **Workers & Pages ? your Pages project ? Custom domains**, both hostnames should show **Active**:

```text
swarsaathi.com
www.swarsaathi.com
```

If either is missing, click **Set up a custom domain** and add it. Cloudflare will offer to create matching DNS records � accept that.

Replace `<project>` below with your Pages subdomain (for example `swarsaathi.pages.dev`).

### 3. DNS records (`swarsaathi.com` zone ? **DNS ? Records**)

You should have **one** web record per hostname. Delete stale parking-page or old-hosting A/CNAME records.

| Type  | Name | Content                         | Proxy        | Notes                                      |
|-------|------|---------------------------------|--------------|--------------------------------------------|
| CNAME | `@`  | `<project>.pages.dev`           | Proxied (??) | Apex; Cloudflare flattens CNAME at root    |
| CNAME | `www`| `<project>.pages.dev`           | Proxied (??) | www subdomain                              |

Cloudflare may instead show **A/AAAA** records for `@` and `www` pointing at Pages anycast IPs (for example `172.64.80.1`). That is also valid if they were auto-created from Custom domains.

**Do not** point `@` or `www` at your old web host, registrar parking page, or a random IP.

Optional (Email Routing � add only after enabling Email Routing in step 5):

| Type | Name | Content              | Proxy   |
|------|------|----------------------|---------|
| MX   | `@`  | `route1.mx.cloudflare.net` (priority 58) | DNS only |
| MX   | `@`  | `route2.mx.cloudflare.net` (priority 37) | DNS only |
| MX   | `@`  | `route3.mx.cloudflare.net` (priority 13) | DNS only |
| TXT  | `@`  | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS only |

### 4. SSL/TLS and HTTPS

In the zone:

1. **SSL/TLS ? Overview** ? encryption mode: **Full** (not Flexible).
2. **SSL/TLS ? Edge Certificates** ? **Always Use HTTPS**: **On**.
3. **SSL/TLS ? Edge Certificates** ? **Automatic HTTPS Rewrites**: **On** (recommended).

Expected behavior:

```text
http://swarsaathi.com      ? 301 ? https://swarsaathi.com/
http://www.swarsaathi.com  ? 301 ? https://www.swarsaathi.com/
https://swarsaathi.com     ? 200
https://www.swarsaathi.com ? 200
https://swarsaathi.com/privacy.html ? 308 ? /privacy ? 200
https://swarsaathi.com/support.html ? 308 ? /support ? 200
```

App Store URLs with `.html` still work (Cloudflare Pages strips the extension via redirect).

### 5. Canonical host (optional but recommended)

Right now apex and www both serve the site. Pick one canonical URL (recommended: **apex** `https://swarsaathi.com`).

**Rules ? Redirect Rules ? Create rule:**

```text
Name: www to apex
When: Hostname equals www.swarsaathi.com
Then: Redirect to https://swarsaathi.com${uri.path} (301)
```

After this, `https://www.swarsaathi.com/...` should redirect to the apex URL.

### 6. Email Routing (for site mailto links)

In **Email ? Email Routing**:

1. Enable routing and verify your personal inbox as a destination.
2. Create aliases:

```text
partnerships@swarsaathi.com
support@swarsaathi.com
privacy@swarsaathi.com
```

3. Let Cloudflare add the MX/SPF records (step 3 table).

### 7. Quick verification

From a terminal:

```bash
curl -sI https://swarsaathi.com | head -5
curl -sI https://www.swarsaathi.com | head -5
curl -sI http://swarsaathi.com | grep -i location
curl -sI https://swarsaathi.com/privacy.html | grep -i location
curl -sI https://swarsaathi.com/privacy | head -5
```

All HTTPS checks should return `200` (or `301`/`308` then `200` for redirects).

## App Store URLs

Use:

```text
https://swarsaathi.com/privacy.html
https://swarsaathi.com/support.html
```

## Email aliases to configure

The website links to these addresses. Configure forwarding before sending B2B outreach:

```text
partnerships@swarsaathi.com
support@swarsaathi.com
privacy@swarsaathi.com
```

Cloudflare Email Routing can forward them to your personal inbox.

## B2B readiness checklist

- `https://swarsaathi.com` opens the marketing website.
- Privacy/support pages load.
- Partnership email forwards correctly.
- App Store listing uses the custom-domain privacy/support URLs.
- Pitch/notation build plan is available internally in `docs/SONG-PITCH-AND-NOTATION-BUILD-PLAN.md`.
