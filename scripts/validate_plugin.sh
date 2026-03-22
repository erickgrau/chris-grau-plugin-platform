#!/usr/bin/env bash
# validate_plugin.sh — Validates AU and VST3 plugins via auval + pluginval
#
# Usage:
#   ./scripts/validate_plugin.sh <au_path> <vst3_path> <plugin_name>
#
# Outputs pass/fail for each validator with details.
# Exit code: 0 = all passed, 1 = any failure.

set -euo pipefail

AU_PATH="${1:-}"
VST3_PATH="${2:-}"
PLUGIN_NAME="${3:-UnknownPlugin}"

PLUGINVAL_VERSION="${PLUGINVAL_VERSION:-1.0.3}"
PLUGINVAL_URL="https://github.com/Tracktion/pluginval/releases/download/v${PLUGINVAL_VERSION}/pluginval_macOS.zip"
PLUGINVAL_BIN="/tmp/pluginval.app/Contents/MacOS/pluginval"

PASS=0
FAIL=0
SKIPPED=0
RESULTS=()

# ── Colours ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

pass()  { echo -e "${GREEN}  ✓ PASS${RESET}  $*"; PASS=$((PASS+1));    RESULTS+=("PASS: $*"); }
fail()  { echo -e "${RED}  ✗ FAIL${RESET}  $*"; FAIL=$((FAIL+1));    RESULTS+=("FAIL: $*"); }
skip()  { echo -e "${YELLOW}  - SKIP${RESET}  $*"; SKIPPED=$((SKIPPED+1)); RESULTS+=("SKIP: $*"); }
info()  { echo -e "  ℹ  $*"; }
header(){ echo -e "\n══════════════════════════════════════════════"; echo "  $*"; echo "══════════════════════════════════════════════"; }

# ── 1. Install pluginval if needed ────────────────────────────────────────────
header "Setup: pluginval"
if [ -f "$PLUGINVAL_BIN" ]; then
  info "pluginval already installed at $PLUGINVAL_BIN"
else
  info "Downloading pluginval v${PLUGINVAL_VERSION} ..."
  curl -sL "$PLUGINVAL_URL" -o /tmp/pluginval.zip
  unzip -q /tmp/pluginval.zip -d /tmp/
  chmod +x "$PLUGINVAL_BIN"
  info "pluginval installed: $PLUGINVAL_BIN"
fi

PLUGINVAL_STRICTNESS="${PLUGINVAL_STRICTNESS:-5}"
info "pluginval strictness level: $PLUGINVAL_STRICTNESS"

# ── 2. AU validation with auval ───────────────────────────────────────────────
header "AU Validation (auval)"
if [ -z "$AU_PATH" ] || [ ! -e "$AU_PATH" ]; then
  skip "AU path not provided or not found: '${AU_PATH}'"
else
  info "AU bundle: $AU_PATH"

  # Copy to user's Components folder so auval can find it
  AU_INSTALL_DIR="$HOME/Library/Audio/Plug-Ins/Components"
  mkdir -p "$AU_INSTALL_DIR"
  AU_BUNDLE_NAME=$(basename "$AU_PATH")
  cp -R "$AU_PATH" "$AU_INSTALL_DIR/"

  # Refresh AudioUnit cache
  info "Refreshing AudioUnit cache ..."
  killall -9 AudioComponentRegistrar 2>/dev/null || true
  sleep 2

  # Extract type/subtype/manufacturer from Info.plist if present
  PLIST="$AU_INSTALL_DIR/$AU_BUNDLE_NAME/Contents/Info.plist"
  if [ -f "$PLIST" ]; then
    AU_TYPE=$(defaults read "$AU_INSTALL_DIR/$AU_BUNDLE_NAME/Contents/Info" \
      AudioComponents 2>/dev/null | grep -A1 '"type"' | grep -v '"type"' | tr -d '"; ' | head -1 || echo "aufx")
    AU_SUBTYPE=$(defaults read "$AU_INSTALL_DIR/$AU_BUNDLE_NAME/Contents/Info" \
      AudioComponents 2>/dev/null | grep -A1 '"subtype"' | grep -v '"subtype"' | tr -d '"; ' | head -1 || echo "")
    AU_MANUFACTURER=$(defaults read "$AU_INSTALL_DIR/$AU_BUNDLE_NAME/Contents/Info" \
      AudioComponents 2>/dev/null | grep -A1 '"manufacturer"' | grep -v '"manufacturer"' | tr -d '"; ' | head -1 || echo "")
  else
    # Fallback: use common defaults for an effect plugin
    AU_TYPE="aufx"
    AU_SUBTYPE="CHBT"
    AU_MANUFACTURER="Chbt"
    info "Info.plist not found — using fallback AU identifiers: $AU_TYPE / $AU_SUBTYPE / $AU_MANUFACTURER"
  fi

  if [ -n "$AU_SUBTYPE" ] && [ -n "$AU_MANUFACTURER" ]; then
    info "Running: auval -v $AU_TYPE $AU_SUBTYPE $AU_MANUFACTURER"
    AUVAL_LOG="/tmp/auval_${PLUGIN_NAME}.log"

    if auval -v "$AU_TYPE" "$AU_SUBTYPE" "$AU_MANUFACTURER" \
         -w > "$AUVAL_LOG" 2>&1; then
      pass "auval passed for $AU_BUNDLE_NAME"
      info "auval log:"
      cat "$AUVAL_LOG"
    else
      fail "auval failed for $AU_BUNDLE_NAME"
      echo "─── auval output ───"
      cat "$AUVAL_LOG"
      echo "────────────────────"
    fi
  else
    skip "Could not determine AU type/subtype/manufacturer — cannot run auval"
  fi
fi

# ── 3. AU validation with pluginval ──────────────────────────────────────────
header "AU Validation (pluginval)"
if [ -z "$AU_PATH" ] || [ ! -e "$AU_PATH" ]; then
  skip "AU path not provided or not found"
else
  PLUGINVAL_AU_LOG="/tmp/pluginval_au_${PLUGIN_NAME}.log"
  info "Running pluginval on AU: $AU_PATH"

  if "$PLUGINVAL_BIN" \
       --strictness-level "$PLUGINVAL_STRICTNESS" \
       --validate "$AU_PATH" \
       --output-dir /tmp/ \
       > "$PLUGINVAL_AU_LOG" 2>&1; then
    pass "pluginval AU passed"
    cat "$PLUGINVAL_AU_LOG"
  else
    fail "pluginval AU failed"
    echo "─── pluginval AU output ───"
    cat "$PLUGINVAL_AU_LOG"
    echo "───────────────────────────"
  fi
fi

# ── 4. VST3 validation with pluginval ────────────────────────────────────────
header "VST3 Validation (pluginval)"
if [ -z "$VST3_PATH" ] || [ ! -e "$VST3_PATH" ]; then
  skip "VST3 path not provided or not found: '${VST3_PATH}'"
else
  PLUGINVAL_VST_LOG="/tmp/pluginval_vst_${PLUGIN_NAME}.log"
  info "Running pluginval on VST3: $VST3_PATH"

  if "$PLUGINVAL_BIN" \
       --strictness-level "$PLUGINVAL_STRICTNESS" \
       --validate "$VST3_PATH" \
       --output-dir /tmp/ \
       > "$PLUGINVAL_VST_LOG" 2>&1; then
    pass "pluginval VST3 passed"
    cat "$PLUGINVAL_VST_LOG"
  else
    fail "pluginval VST3 failed"
    echo "─── pluginval VST3 output ───"
    cat "$PLUGINVAL_VST_LOG"
    echo "─────────────────────────────"
  fi
fi

# ── 5. Summary ────────────────────────────────────────────────────────────────
header "Validation Summary — $PLUGIN_NAME"
echo ""
for r in "${RESULTS[@]}"; do
  case "$r" in
    PASS*) echo -e "  ${GREEN}✓${RESET} $r" ;;
    FAIL*) echo -e "  ${RED}✗${RESET} $r" ;;
    SKIP*) echo -e "  ${YELLOW}-${RESET} $r" ;;
  esac
done
echo ""
echo "  Passed:  $PASS"
echo "  Failed:  $FAIL"
echo "  Skipped: $SKIPPED"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}VALIDATION FAILED — $FAIL check(s) did not pass.${RESET}"
  exit 1
else
  echo -e "${GREEN}VALIDATION PASSED — all checks OK.${RESET}"
  exit 0
fi
