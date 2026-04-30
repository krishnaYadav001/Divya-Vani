#!/usr/bin/env bash
# Phase 1.5 — Download Sanskrit Mahabharata text dumps from
# sanskritdocuments.org. ITRANS-encoded plain text (.itx).
#
# Two recensions:
#   1. BORI Critical Edition (primary) — 13 parvas in our curation
#   2. Kumbakonam Southern Recension (narrow fallback per ACTION 2)
#      — 3 parvas with high-leverage Krishna-grace scenes
#
# Usage (run from project root in Git Bash):
#   bash scripts/download-mahabharata-sanskrit.sh
#
# Re-running is safe: skips files already downloaded.

set -euo pipefail

BORI_DIR="data/mahabharata-raw/sanskrit-bori"
KUMB_DIR="data/mahabharata-raw/sanskrit-kumbakonam"
mkdir -p "$BORI_DIR" "$KUMB_DIR"

# BORI Critical Edition parvas needed by the 23-range curation:
#   1=Adi, 2=Sabha, 3=Vana, 5=Udyoga, 6=Bhishma, 7=Drona, 8=Karna,
#   9=Shalya, 10=Sauptika, 11=Stri, 12=Shanti, 14=Ashvamedhika, 16=Mausala
# Skipped: 4=Virata, 13=Anushasana, 15=Ashramavasika, 17=Mahaprasthanika, 18=Svargarohana
BORI_PARVAS=(01 02 03 05 06 07 08 09 10 11 12 14 16)

# Kumbakonam Southern Recension — narrow fallback for high-leverage scenes:
#   01 = Adi (Subhadra abduction 218-225)
#   02 = Sabha (vastra haran 60-68 — most emotionally significant)
#   10 = Sauptika (Brahmastra protection of Parikshit 13-18)
KUMB_PARVAS=(01 02 10)

UA="Krishna AI corpus build (krishnayadav123345@gmail.com)"

download_one() {
  local url="$1"
  local out="$2"
  local label="$3"

  if [[ -f "$out" ]]; then
    echo "${label}: already downloaded ($(du -h "$out" | cut -f1)), skipping"
    return 0
  fi

  echo "Downloading ${label} from $url"
  if curl -fL --retry 3 --retry-delay 2 -A "$UA" -o "$out" "$url"; then
    echo "${label}: ok ($(du -h "$out" | cut -f1))"
  else
    echo "${label}: FAILED — URL: $url"
    rm -f "$out"
    return 1
  fi
}

echo "=== BORI Critical Edition (13 parvas) ==="
for p in "${BORI_PARVAS[@]}"; do
  url="https://sanskritdocuments.org/mirrors/mahabharata/txt/mbh${p}.itx"
  out="${BORI_DIR}/mbh${p}.itx"
  download_one "$url" "$out" "bori-${p}" || true
done

echo
echo "=== Kumbakonam Southern Recension (3 parvas, narrow fallback) ==="
for p in "${KUMB_PARVAS[@]}"; do
  url="https://sanskritdocuments.org/mirrors/mahabharata/mbhK/txt/mbhK${p}.itx"
  out="${KUMB_DIR}/mbhK${p}.itx"
  download_one "$url" "$out" "kumb-${p}" || true
done

echo
echo "=== Verification: first 20 lines of each downloaded file ==="
for f in "${BORI_DIR}"/*.itx "${KUMB_DIR}"/*.itx; do
  [[ -f "$f" ]] || continue
  echo
  echo "--- $f ---"
  head -20 "$f"
done

echo
echo "=== Total size ==="
du -sh "$BORI_DIR" "$KUMB_DIR"
echo
echo "BORI files:"
ls -la "$BORI_DIR"/*.itx 2>/dev/null || echo "  (none downloaded)"
echo
echo "Kumbakonam files:"
ls -la "$KUMB_DIR"/*.itx 2>/dev/null || echo "  (none downloaded)"
