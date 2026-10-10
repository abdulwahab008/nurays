#!/usr/bin/env bash
# Every action a workflow uses must be pinned to a full commit SHA. A tag such as v7 can be moved after the fact (by
# whoever controls the action's repository, or by whoever takes it over); a commit cannot. The release a pin stands for
# is named in a trailing comment, and Dependabot moves both together:
#
#   - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
#
# Actions of this repository (./...) are exempt. Run from anywhere; exits 1 and lists the offending lines.
set -euo pipefail
cd "$(dirname "$0")/../.."

files=(.github/workflows/*.yml)
[ -d .github/actions ] && while IFS= read -r f; do files+=("$f"); done < <(find .github/actions -name 'action.y*ml')

# every "uses:" line, minus the ones that are a local path or owner/repo[/path]@<40 hex characters>
unpinned=$(grep -nE '^\s*(-\s+)?uses:' "${files[@]}" | grep -vE 'uses:\s*(\./|[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}(\s|$))' || true)

if [ -n "$unpinned" ]; then
  echo "These actions are not pinned to a commit SHA (pin them as: uses: owner/repo@<40-character commit> # vX.Y.Z):"
  echo "$unpinned"
  exit 1
fi
echo "Every action is pinned to a commit."
