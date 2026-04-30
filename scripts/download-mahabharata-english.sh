#!/usr/bin/env bash
# Phase 1.5 — Download Roy/Ganguli English Mahabharata plain-text dumps
# from archive.org. 10 volumes, ~13 MB total.
#
# Usage (run from project root in Git Bash):
#   bash scripts/download-mahabharata-english.sh
#
# Re-running is safe: skips files already downloaded.

set -euo pipefail

OUTPUT_DIR="data/mahabharata-raw/ganguli"
mkdir -p "$OUTPUT_DIR"

VOLUMES=(01 02 03 04 05 06 07 08 09 10)

for vol in "${VOLUMES[@]}"; do
  item="mahabharataofkri${vol}roypuoft"
  url="https://archive.org/download/${item}/${item}_djvu.txt"
  out="${OUTPUT_DIR}/roy-vol${vol}.txt"

  if [[ -f "$out" ]]; then
    echo "vol${vol}: already downloaded ($(du -h "$out" | cut -f1)), skipping"
    continue
  fi

  echo "Downloading vol${vol} from $url"
  if curl -fL --retry 3 --retry-delay 2 \
      -A "Krishna AI corpus build (krishnayadav123345@gmail.com)" \
      -o "$out" "$url"; then
    echo "vol${vol}: ok ($(du -h "$out" | cut -f1))"
  else
    echo "vol${vol}: FAILED — URL: $url"
    rm -f "$out"
  fi
done

echo
echo "=== Verification: title + first 30 lines of each volume ==="
for f in "${OUTPUT_DIR}"/roy-vol*.txt; do
  echo
  echo "--- $f ---"
  head -30 "$f"
done

echo
echo "=== Total size ==="
du -sh "$OUTPUT_DIR"
ls -la "$OUTPUT_DIR"/roy-vol*.txt
