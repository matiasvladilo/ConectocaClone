#!/usr/bin/env node
/**
 * Sincroniza la versión de las apps nativas desde package.json.
 *
 * FUENTE DE VERDAD: el campo `version` de package.json (el "marketing version",
 * p. ej. 1.0.0 — lo que ve el usuario en la ficha de la tienda).
 *
 * Qué toca:
 *   - Android (android/app/build.gradle): `versionName` = package.json.version
 *   - iOS (ios/App/App.xcodeproj/project.pbxproj): `MARKETING_VERSION` = idem
 *
 * BUILD NUMBER (versionCode en Android, CURRENT_PROJECT_VERSION en iOS): es el
 * número interno que las tiendas exigen que SIEMPRE suba en cada subida, aunque
 * el marketing version no cambie. Con `--bump-build` se incrementa en 1 en
 * ambas plataformas, manteniéndolas alineadas.
 *
 * Uso:
 *   node scripts/sync-version.mjs              # solo sincroniza el marketing version
 *   node scripts/sync-version.mjs --bump-build # además sube el build number +1
 *
 * Flujo típico de release:
 *   npm version patch        # sube package.json (1.0.0 -> 1.0.1) y hace tag
 *   npm run version:release  # sincroniza nativo y sube el build number
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const bumpBuild = process.argv.includes('--bump-build');

const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json version inválida: "${version}" (se espera X.Y.Z)`);
  process.exit(1);
}

const gradlePath = join(raiz, 'android/app/build.gradle');
const pbxPath = join(raiz, 'ios/App/App.xcodeproj/project.pbxproj');

// ── Android ────────────────────────────────────────────────────────────────
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

let versionCode = null;
if (bumpBuild) {
  gradle = gradle.replace(/versionCode\s+(\d+)/, (_m, n) => {
    versionCode = Number(n) + 1;
    return `versionCode ${versionCode}`;
  });
} else {
  versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0);
}
writeFileSync(gradlePath, gradle);

// ── iOS (las claves aparecen 2 veces: configs Debug y Release) ──────────────
let pbx = readFileSync(pbxPath, 'utf8');
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);

let currentProjectVersion = null;
if (bumpBuild) {
  // Tomamos el máximo actual y le sumamos 1, por si las dos configs difirieran.
  const actuales = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => Number(m[1]));
  currentProjectVersion = Math.max(0, ...actuales) + 1;
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${currentProjectVersion};`);
} else {
  currentProjectVersion = Number(pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/)?.[1] ?? 0);
}
writeFileSync(pbxPath, pbx);

console.log(`✓ Marketing version: ${version}`);
console.log(`  Android  versionName=${version}  versionCode=${versionCode}`);
console.log(`  iOS      MARKETING_VERSION=${version}  CURRENT_PROJECT_VERSION=${currentProjectVersion}`);
if (!bumpBuild) {
  console.log('  (build number sin cambios; usá --bump-build para subirlo en cada release)');
}
