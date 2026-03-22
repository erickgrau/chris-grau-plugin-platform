#!/usr/bin/env bash
# package_plugin.sh — Creates a macOS .pkg installer for AU and/or VST3 plugins
#
# Usage:
#   ./scripts/package_plugin.sh <plugin_name> <au_path> <vst3_path> <output_dir>
#
# The resulting .pkg installs:
#   AU   → ~/Library/Audio/Plug-Ins/Components/<PluginName>.component
#   VST3 → ~/Library/Audio/Plug-Ins/VST3/<PluginName>.vst3
#
# Requires: pkgbuild, productbuild (Xcode CLI tools)

set -euo pipefail

PLUGIN_NAME="${1:?Usage: package_plugin.sh <plugin_name> <au_path> <vst3_path> <output_dir>}"
AU_PATH="${2:-}"
VST3_PATH="${3:-}"
OUTPUT_DIR="${4:?Output dir required}"

VERSION="${PLUGIN_VERSION:-1.0.0}"
IDENTIFIER_PREFIX="${PKG_IDENTIFIER_PREFIX:-com.chibitek.plugin}"
STAGING_ROOT="/tmp/chibitek-pkg-staging/${PLUGIN_NAME}"

GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

info() { echo -e "  ℹ  $*"; }
ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
err()  { echo -e "${RED}  ✗${RESET}  $*"; exit 1; }

echo ""
echo "══════════════════════════════════════════════"
echo "  Packaging: $PLUGIN_NAME  v$VERSION"
echo "══════════════════════════════════════════════"

mkdir -p "$OUTPUT_DIR"
rm -rf "$STAGING_ROOT"

COMPONENT_PKGS=()

# ── AU component ──────────────────────────────────────────────────────────────
if [ -n "$AU_PATH" ] && [ -e "$AU_PATH" ]; then
  info "Staging AU component: $AU_PATH"
  AU_STAGE="$STAGING_ROOT/au/Library/Audio/Plug-Ins/Components"
  mkdir -p "$AU_STAGE"
  cp -R "$AU_PATH" "$AU_STAGE/"

  AU_PKG="/tmp/chibitek-pkg-staging/${PLUGIN_NAME}-AU.pkg"
  pkgbuild \
    --root "$STAGING_ROOT/au" \
    --identifier "${IDENTIFIER_PREFIX}.${PLUGIN_NAME}.au" \
    --version "$VERSION" \
    --install-location "/" \
    "$AU_PKG"
  ok "Built AU component package: $AU_PKG"
  COMPONENT_PKGS+=("$AU_PKG")
else
  info "No AU path — skipping AU package"
fi

# ── VST3 component ────────────────────────────────────────────────────────────
if [ -n "$VST3_PATH" ] && [ -e "$VST3_PATH" ]; then
  info "Staging VST3 component: $VST3_PATH"
  VST3_STAGE="$STAGING_ROOT/vst3/Library/Audio/Plug-Ins/VST3"
  mkdir -p "$VST3_STAGE"
  cp -R "$VST3_PATH" "$VST3_STAGE/"

  VST3_PKG="/tmp/chibitek-pkg-staging/${PLUGIN_NAME}-VST3.pkg"
  pkgbuild \
    --root "$STAGING_ROOT/vst3" \
    --identifier "${IDENTIFIER_PREFIX}.${PLUGIN_NAME}.vst3" \
    --version "$VERSION" \
    --install-location "/" \
    "$VST3_PKG"
  ok "Built VST3 component package: $VST3_PKG"
  COMPONENT_PKGS+=("$VST3_PKG")
else
  info "No VST3 path — skipping VST3 package"
fi

if [ ${#COMPONENT_PKGS[@]} -eq 0 ]; then
  err "No valid plugin paths provided — nothing to package"
fi

# ── Distribution XML ──────────────────────────────────────────────────────────
DIST_XML="/tmp/chibitek-pkg-staging/${PLUGIN_NAME}-distribution.xml"
cat > "$DIST_XML" <<DISTXML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>${PLUGIN_NAME} v${VERSION}</title>
    <organization>com.chibitek</organization>
    <domains enable_localSystem="true" enable_currentUserHome="true"/>
    <options customize="never" require-scripts="false" rootVolumeOnly="false"/>
    <background file="background.png" alignment="bottomleft" scaling="tofit" mime-type="image/png"/>
    <welcome file="welcome.rtf" mime-type="text/rtf"/>
    <choices-outline>
        <line choice="default">
            <line choice="${PLUGIN_NAME}"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="${PLUGIN_NAME}" visible="false">
DISTXML

for PKG in "${COMPONENT_PKGS[@]}"; do
  PKG_BASENAME=$(basename "$PKG")
  echo "        <pkg-ref id=\"${IDENTIFIER_PREFIX}.${PLUGIN_NAME}.$(echo $PKG_BASENAME | tr '.' '_')\"/>" >> "$DIST_XML"
done

cat >> "$DIST_XML" <<DISTXML
    </choice>
DISTXML

for PKG in "${COMPONENT_PKGS[@]}"; do
  PKG_BASENAME=$(basename "$PKG")
  echo "    <pkg-ref id=\"${IDENTIFIER_PREFIX}.${PLUGIN_NAME}.$(echo $PKG_BASENAME | tr '.' '_')\" version=\"${VERSION}\" onConclusion=\"none\">${PKG_BASENAME}</pkg-ref>" >> "$DIST_XML"
done

echo "</installer-gui-script>" >> "$DIST_XML"

# ── Final product package ─────────────────────────────────────────────────────
FINAL_PKG="${OUTPUT_DIR}/${PLUGIN_NAME}-${VERSION}-installer.pkg"
info "Building final .pkg: $FINAL_PKG"

PRODUCTBUILD_ARGS=(
  --distribution "$DIST_XML"
  --package-path "/tmp/chibitek-pkg-staging/"
  --version "$VERSION"
)

# Add signing if certificate is available
if [ -n "${PKG_SIGNING_IDENTITY:-}" ]; then
  info "Signing package with identity: $PKG_SIGNING_IDENTITY"
  PRODUCTBUILD_ARGS+=(--sign "$PKG_SIGNING_IDENTITY")
else
  info "No PKG_SIGNING_IDENTITY set — producing unsigned package"
fi

PRODUCTBUILD_ARGS+=("$FINAL_PKG")

productbuild "${PRODUCTBUILD_ARGS[@]}"

ok "Package created: $FINAL_PKG"
echo ""
echo "  Plugin: $PLUGIN_NAME"
echo "  Version: $VERSION"
echo "  Output: $FINAL_PKG"
echo "  Size: $(du -sh "$FINAL_PKG" | cut -f1)"
echo ""
