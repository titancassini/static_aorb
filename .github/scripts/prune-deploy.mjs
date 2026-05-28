#!/usr/bin/env node
/**
 * Remove unreferenced wp-includes/wp-content assets and WP API noise
 * so Pinata free tier (500 file limit) can pin the deploy folder.
 */
import fs from 'fs';
import path from 'path';

const deployDir = process.argv[2];
if (!deployDir || !fs.existsSync(deployDir)) {
  console.error('Usage: node prune-deploy.mjs <deploy-directory>');
  process.exit(1);
}

const ALWAYS_KEEP_PREFIXES = [
  'index.html',
  '_redirects',
];

const ALWAYS_DROP_PREFIXES = [
  'wp-json/',
  'feed/',
  'comments/',
  'wp-includes/js/dist/vendor/',
  'wp-includes/blocks/',
  'wp-includes/css/dist/',
];

function walkFiles(dir, base = dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkFiles(full, base));
    } else {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function isHtmlOrCss(file) {
  return /\.(html?|css)$/i.test(file);
}

function normalizeRef(ref, sourceFile) {
  if (!ref || ref.startsWith('data:') || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) {
    return null;
  }

  let cleaned = ref.split('#')[0].split('?')[0];
  if (!cleaned) return null;

  if (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
  } else {
    const baseDir = path.posix.dirname(sourceFile);
    cleaned = path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, cleaned));
  }

  return cleaned.replace(/^\.\//, '');
}

function collectReferences(files) {
  const refs = new Set(ALWAYS_KEEP_PREFIXES);

  const urlPatterns = [
    /(?:href|src)=["']([^"']+)["']/gi,
    /url\(["']?([^"')]+)["']?\)/gi,
  ];

  for (const file of files) {
    if (!isHtmlOrCss(file)) continue;
    const full = path.join(deployDir, file);
    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    for (const pattern of urlPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const normalized = normalizeRef(match[1], file);
        if (normalized) refs.add(normalized);
      }
    }
  }

  return refs;
}

function shouldKeep(relPath, refs) {
  for (const drop of ALWAYS_DROP_PREFIXES) {
    if (relPath.startsWith(drop)) return false;
  }

  if (refs.has(relPath)) return true;

  for (const ref of refs) {
    if (ref.startsWith(`${relPath}/`)) return true;
    if (relPath.startsWith(`${ref}/`)) return true;
  }

  // Keep other top-level pages and content outside wp-includes.
  if (!relPath.startsWith('wp-includes/')) {
    return true;
  }

  return false;
}

const before = walkFiles(deployDir);
let removed = 0;

for (const prefix of ALWAYS_DROP_PREFIXES) {
  const target = path.join(deployDir, prefix);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    removed += before.filter((f) => f.startsWith(prefix)).length;
  }
}

const remaining = walkFiles(deployDir);
const refs = collectReferences(remaining);

for (const rel of remaining) {
  if (shouldKeep(rel, refs)) continue;
  fs.rmSync(path.join(deployDir, rel), { force: true });
  removed += 1;
}

const after = walkFiles(deployDir).length;
console.log(`Prune complete: ${before.length} -> ${after} files (removed ${before.length - after}).`);
console.log(`Referenced assets tracked: ${refs.size}`);

if (after > 500) {
  console.warn(
    `WARNING: ${after} files still exceeds Pinata free plan limit (500). Consider upgrading Pinata or adding Simply Static exclusions.`
  );
}
