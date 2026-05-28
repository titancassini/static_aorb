#!/usr/bin/env node
/**
 * Upload a static site to Pinata as one directory pin via pinFileToIPFS.
 * Do NOT use V3 fileArray — it can count each file against your pin limit.
 */
import fs from 'fs';
import path from 'path';

const deployDir = process.argv[2];
if (!deployDir || !fs.existsSync(deployDir)) {
  console.error('Usage: node pin-site.mjs <deploy-directory>');
  process.exit(1);
}

const PIN_NAME = process.env.PIN_NAME || 'aorb.info';
const MAX_PINS_TO_KEEP = Number(process.env.MAX_PINS_TO_KEEP || '3');

function authHeaders(jwt, apiKey, apiSecret) {
  if (jwt) {
    return { Authorization: `Bearer ${jwt}` };
  }
  return {
    pinata_api_key: apiKey,
    pinata_secret_api_key: apiSecret,
  };
}

function walk(dir, base = dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push({
        full,
        rel: path.relative(base, full).split(path.sep).join('/'),
      });
    }
  }
  return out;
}

async function listPins(headers) {
  const url = new URL('https://api.pinata.cloud/data/pinList');
  url.searchParams.set('status', 'pinned');
  url.searchParams.set('metadata[name]', PIN_NAME);
  url.searchParams.set('pageLimit', '100');

  const res = await fetch(url, { headers });
  const body = await res.json();
  if (!res.ok || !body.rows) {
    console.warn('Could not list existing pins:', JSON.stringify(body));
    return [];
  }
  return body.rows;
}

async function unpinCid(headers, cid) {
  const res = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    console.warn(`Failed to unpin ${cid}: ${await res.text()}`);
    return false;
  }
  console.log(`Unpinned old deploy: ${cid}`);
  return true;
}

async function cleanupOldPins(headers) {
  const rows = await listPins(headers);
  if (rows.length <= MAX_PINS_TO_KEEP) {
    console.log(`Keeping ${rows.length} existing pin(s) named ${PIN_NAME}.`);
    return;
  }

  const sorted = rows.sort(
    (a, b) => new Date(b.date_pinned) - new Date(a.date_pinned)
  );
  const toRemove = sorted.slice(MAX_PINS_TO_KEEP);
  console.log(
    `Removing ${toRemove.length} old pin(s); keeping ${MAX_PINS_TO_KEEP} most recent.`
  );
  for (const row of toRemove) {
    await unpinCid(headers, row.ipfs_pin_hash);
  }
}

async function pinFolder(headers, files) {
  const form = new FormData();

  for (const { full, rel } of files) {
    form.append('file', new Blob([fs.readFileSync(full)]), rel);
  }

  form.append('pinataMetadata', JSON.stringify({ name: PIN_NAME }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata folder upload failed (${res.status}): ${body}`);
  }

  const json = JSON.parse(body);
  if (!json.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${body}`);
  }
  return json.IpfsHash;
}

async function pinDirectory(dir) {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;

  if (!jwt && !(apiKey && apiSecret)) {
    throw new Error(
      'Missing Pinata credentials. Add PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET.'
    );
  }

  const headers = authHeaders(jwt, apiKey, apiSecret);
  const files = walk(dir);
  if (files.length === 0) {
    throw new Error(`No files found in ${dir}`);
  }

  console.log(`Uploading ${files.length} files as one directory pin...`);
  await cleanupOldPins(headers);
  return pinFolder(headers, files);
}

const cid = await pinDirectory(deployDir);
console.log(`Pinned directory CID: ${cid}`);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, `cid=${cid}\n`);
}
