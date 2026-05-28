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

## GitHub secrets (not variables)

Add these under **Settings → Secrets and variables → Actions → Repository secrets**.

Use **Secrets**, not **Variables**. Secrets are encrypted and hidden in logs; variables are plain text and wrong for API keys.

| Secret | Required? | Description |
|--------|-----------|-------------|
| `PINATA_JWT` | **Yes** (recommended) | JWT from your Pinata **aorb** admin key |
| `PINATA_API_KEY` | Optional fallback | Legacy API key — only if not using JWT |
| `PINATA_API_SECRET` | Optional fallback | Legacy secret — pair with API key |
| `CF_ZONE_ID` | Yes | Cloudflare zone ID for `aorb.info` |
| `CF_API_TOKEN` | Yes | Cloudflare token with **Web3 Hostnames → Edit** on `aorb.info` (DNS Edit alone is not enough) |
| `CF_WEB3_HOSTNAME_ID` | Optional | Web3 gateway ID if auto-discovery fails |

**Important:** Because you use Cloudflare **Web3 Gateway**, the `_dnslink` TXT record is managed by Cloudflare — update it via the **Web3 API**, not the normal DNS API. Your token needs **Zone → Web3 Hostnames → Edit** in addition to (or instead of) DNS Edit.

Manual fallback: Cloudflare dashboard → **Web3** → your gateway → **Edit** → set DNSLink to `/ipfs/<CID>` → **Reapply**.

## Manual deploy

**Actions → Deploy to IPFS → Run workflow** re-pins the current repo contents without a new commit.

## Pipeline

```
Local WP → Simply Static → publish-static.sh → GitHub → Pinata → Cloudflare DNSLink
```

Each deploy produces a new IPFS CID. The workflow updates the `_dnslink.aorb.info` TXT record automatically.
