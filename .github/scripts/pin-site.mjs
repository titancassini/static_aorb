#!/usr/bin/env node
/**
 * Upload a static site directory to Pinata public IPFS.
 * Prefers PINATA_JWT (V3 SDK). Falls back to legacy pinFileToIPFS key pair.
 */
import fs from 'fs';
import path from 'path';
import { PinataSDK } from 'pinata';

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

function toFileArray(files) {
  return files.map(({ full, rel }) => {
    const data = fs.readFileSync(full);
    return new File([data], rel, { type: 'application/octet-stream' });
  });
}

async function pinWithJwt(jwt, files) {
  const pinata = new PinataSDK({ pinataJwt: jwt });
  await pinata.testAuthentication();

  const upload = await pinata.upload.public.fileArray(toFileArray(files));
  const cid = upload.cid || upload.IpfsHash;
  if (!cid) {
    throw new Error(`Pinata V3 response missing CID: ${JSON.stringify(upload)}`);
  }
  return cid;
}

async function pinWithLegacyKeys(apiKey, apiSecret, files) {
  const form = new FormData();
  for (const { full, rel } of files) {
    const blob = new Blob([fs.readFileSync(full)]);
    form.append('file', blob, rel);
  }

  form.append(
    'pinataMetadata',
    JSON.stringify({ name: process.env.PIN_NAME || 'aorb.info' })
  );
  // Do not set wrapWithDirectory when sending many files — Pinata rejects that combo.
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Pinata legacy upload failed (${res.status}): ${body}`);
  }

  const json = JSON.parse(body);
  if (!json.IpfsHash) {
    throw new Error(`Pinata legacy response missing IpfsHash: ${body}`);
  }
  return json.IpfsHash;
}

async function pinDirectory(dir) {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;

  if (!jwt && !(apiKey && apiSecret)) {
    throw new Error(
      'Missing Pinata credentials. Add PINATA_JWT (recommended) or PINATA_API_KEY + PINATA_API_SECRET as GitHub repository secrets.'
    );
  }

  const files = walk(dir);
  if (files.length === 0) {
    throw new Error(`No files found in ${dir}`);
  }

  console.log(`Uploading ${files.length} files from ${dir}...`);

  if (jwt) {
    console.log('Using Pinata V3 upload (JWT)...');
    return pinWithJwt(jwt, files);
  }

  console.log('Using Pinata legacy upload (API key pair)...');
  return pinWithLegacyKeys(apiKey, apiSecret, files);
}

const cid = await pinDirectory(deployDir);
console.log(`Pinned CID: ${cid}`);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  fs.appendFileSync(outputFile, `cid=${cid}\n`);
}
