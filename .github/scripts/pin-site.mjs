#!/usr/bin/env node
/**
 * Upload a static site directory to Pinata (public IPFS) via pinFileToIPFS.
 * Requires PINATA_JWT, or PINATA_API_KEY + PINATA_API_SECRET.
 */
import fs from 'fs';
import path from 'path';

const deployDir = process.argv[2];
if (!deployDir || !fs.existsSync(deployDir)) {
  console.error('Usage: node pin-site.mjs <deploy-directory>');
  process.exit(1);
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

async function pinDirectory(dir) {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;

  if (!jwt && !(apiKey && apiSecret)) {
    throw new Error(
      'Missing Pinata credentials. Set PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET in GitHub secrets.'
    );
  }

  const files = walk(dir);
  if (files.length === 0) {
    throw new Error(`No files found in ${dir}`);
  }

  console.log(`Uploading ${files.length} files from ${dir}...`);

  const form = new FormData();
  for (const { full, rel } of files) {
    const blob = new Blob([fs.readFileSync(full)]);
    form.append('file', blob, rel);
  }

  form.append(
    'pinataMetadata',
    JSON.stringify({ name: process.env.PIN_NAME || 'aorb.info' })
  );
  form.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1, wrapWithDirectory: true })
  );

  /** @type {Record<string, string>} */
  const headers = jwt
    ? { Authorization: `Bearer ${jwt}` }
    : {
        pinata_api_key: apiKey,
        pinata_secret_api_key: apiSecret,
      };

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata upload failed (${res.status}): ${body}`);
  }

  const json = JSON.parse(body);
  if (!json.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${body}`);
  }

  return json.IpfsHash;
}

const cid = await pinDirectory(deployDir);
console.log(`Pinned CID: ${cid}`);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, `cid=${cid}\n`);
}
