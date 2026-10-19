#!/usr/bin/env bash
# SessionStart hook: install the third-party skills the co-pilot's own skills
# call (spec §5 — `/grilling`, `/domain-modeling`, wrapped by data-grounding)
# into .claude/skills/ if they are missing. Pinned to one upstream commit so every
# checkout gets the same text; bump UPSTREAM_SHA deliberately to update.
#
# Source: https://github.com/mattpocock/skills (MIT, (c) Matt Pocock). The fetched
# dirs are gitignored — they are retrieved, not vendored.
#
# Never blocks a session: any failure is a stderr warning and exit 0. Stays
# silent on stdout, which SessionStart would inject into the conversation.

set -u

UPSTREAM_URL="https://github.com/mattpocock/skills"
UPSTREAM_SHA="49dd158d1076134a641b33efb035946536778336"
# <installed name>=<path in upstream repo>
SKILLS=(
  "grilling=skills/productivity/grilling"
  "domain-modeling=skills/engineering/domain-modeling"
)

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
dest="$root/.claude/skills"

missing=()
for entry in "${SKILLS[@]}"; do
  name="${entry%%=*}"
  [ -f "$dest/$name/SKILL.md" ] || missing+=("$entry")
done
[ ${#missing[@]} -eq 0 ] && exit 0

warn() { echo "fetch-external-skills: $*" >&2; }

tmp="$(mktemp -d)" || { warn "mktemp failed"; exit 0; }
trap 'rm -rf "$tmp"' EXIT

paths=()
for entry in "${missing[@]}"; do paths+=("${entry#*=}"); done

if ! {
  git -C "$tmp" init -q &&
  git -C "$tmp" fetch -q --depth 1 "$UPSTREAM_URL" "$UPSTREAM_SHA" &&
  git -C "$tmp" checkout -q FETCH_HEAD -- LICENSE "${paths[@]}"
} >/dev/null 2>&1; then
  warn "could not fetch ${UPSTREAM_URL}@${UPSTREAM_SHA:0:7} (offline?); /grilling and /domain-modeling unavailable this session"
  exit 0
fi

for entry in "${missing[@]}"; do
  name="${entry%%=*}"
  src="$tmp/${entry#*=}"
  rm -rf "$dest/$name"
  mkdir -p "$dest/$name" && cp -R "$src/." "$dest/$name/" &&
    cp "$tmp/LICENSE" "$dest/$name/LICENSE" ||
    warn "failed to install $name"
done
exit 0
