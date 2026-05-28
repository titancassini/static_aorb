# static_aorb

Static export of [aorb.info](https://aorb.info), generated from WordPress with [Simply Static](https://wordpress.org/plugins/simply-static/) and deployed to IPFS via Pinata. Cloudflare DNSLink points `aorb.info` at the latest CID.

## Publish from Local WordPress

1. In Local, open the **A or B** site and run **Simply Static → Generate**.
2. In a system terminal (not Cursor’s integrated terminal if `sudo` fails):

```bash
/home/delegate0x/Local Sites/a-or-b/scripts/publish-static.sh
```

That syncs the export into this repo, commits, and pushes. GitHub Actions pins the site to Pinata and updates `_dnslink.aorb.info`.

## Simply Static settings (Local WP)

Configure once under **Simply Static → Settings**:

| Setting | Value |
|---------|--------|
| Destination URL | `https://aorb.info` |
| Force URL replacement | On |
| Delivery method | Local directory (recommended) or ZIP |
| Local directory | `/home/delegate0x/Local Sites/a-or-b/static-export` |

If you keep ZIP delivery, the publish script falls back to the latest folder under `wp-content/uploads/simply-static/temp-files/`.

## GitHub secrets

Add these at **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `PINATA_JWT` | **Recommended.** Pinata JWT from [API keys](https://app.pinata.cloud/developers/api-keys) with **pinFileToIPFS** permission |
| `PINATA_API_KEY` | Optional fallback if not using JWT (legacy key pair) |
| `PINATA_API_SECRET` | Optional fallback — pair with `PINATA_API_KEY` |
| `CF_ZONE_ID` | Cloudflare zone ID for `aorb.info` |
| `CF_API_TOKEN` | Cloudflare API token with **DNS Edit** on that zone |

Set **`PINATA_JWT`** *or* both **`PINATA_API_KEY`** + **`PINATA_API_SECRET`**.

## Manual deploy

**Actions → Deploy to IPFS → Run workflow** re-pins the current repo contents without a new commit.

## Pipeline

```
Local WP → Simply Static → publish-static.sh → GitHub → Pinata → Cloudflare DNSLink
```

Each deploy produces a new IPFS CID. The workflow updates the `_dnslink.aorb.info` TXT record automatically.
