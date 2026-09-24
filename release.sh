#!/usr/bin/env bash
# Releases this monorepo at one version: ./release.sh 0.2.0
#
# Sets the version in the root and every workspace package.json, repins the
# internal @<name>/* dependencies, updates RUNTIME_VERSION, the README's
# packaged-file example and the lockfile, runs the full check, commits it all
# as "release: <version>", tags v<version> and pushes the branch with tags.
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "usage: $0 <version>   (for example 0.2.0)" >&2
  exit 2
fi

cd "$(dirname "$0")"
name="$(node -p "require('./package.json').name")"
Name="$(node -p "'$name'.replace(/^./, (c) => c.toUpperCase())")"
old="$(node -p "require('./package.json').version")"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree has changes; commit or stash them first." >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "Tag v$version already exists." >&2
  exit 1
fi

echo "Releasing $Name $old -> $version"

# Versions and internal pins, in the root and every workspace package.
node - "$version" "$name" <<'EOF'
const fs = require("node:fs");
const [version, name] = process.argv.slice(2);
const files = ["package.json", ...require("./package.json").workspaces.map((w) => `${w}/package.json`)];
for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = version;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (dep.startsWith(`@${name}/`)) pkg[field][dep] = version;
    }
  }
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
EOF

# What the runtime reports to its clients.
sed -i -E "s/^(export const RUNTIME_VERSION = )\"[^\"]*\";/\1\"$version\";/" "$name-runtime/src/server.ts"
grep -q "RUNTIME_VERSION = \"$version\"" "$name-runtime/src/server.ts"

# The packaged-file example in the README, when there is one.
sed -i "s/$Name-$old-/$Name-$version-/g" README.md

npm install --package-lock-only --ignore-scripts --no-audit --no-fund

# Nothing outside the lockfile's third-party entries may still say the old version.
if grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=release --exclude-dir=research --exclude=package-lock.json \
  --exclude="*.png" -F "\"$old\"" . ; then
  echo "The old version is still mentioned above; fix by hand and rerun." >&2
  exit 1
fi

npm run check

git add -A
git commit -m "release: $version"
git tag -a "v$version" -m "release: $version"
git push --follow-tags origin HEAD
echo "Released $Name $version"
