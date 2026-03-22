#!/usr/bin/env bash
# test_inject_layers.sh — Test inject_spec.py with a 2-layer (reverb + delay) spec
# Author: Chibitek Platform
# Date: 2026-03-22
# Description: Validates that inject_spec.py correctly generates generated_config.h
#              for the layers-based DspSpec format.
# Usage: bash scripts/test_inject_layers.sh

set -euo pipefail
cd "$(dirname "$0")/.."

TEST_SPEC='{"plugin_type":"effect","plugin_version":"1.0.0","manufacturer":"Chibitek Labs","description":"Reverb into delay combo","layers":[{"id":"reverb_0","type":"reverb","label":"Reverb","blend":1.0,"parameters":[{"id":"roomSize","name":"Room Size","min":0.0,"max":1.0,"default":0.6,"unit":"linear"},{"id":"damping","name":"Damping","min":0.0,"max":1.0,"default":0.4,"unit":"linear"},{"id":"mix","name":"Mix","min":0.0,"max":1.0,"default":0.5,"unit":"%"}]},{"id":"delay_0","type":"delay","label":"Delay","blend":0.8,"parameters":[{"id":"delayTime","name":"Delay Time","min":1.0,"max":2000.0,"default":250.0,"unit":"ms"},{"id":"feedback","name":"Feedback","min":0.0,"max":0.95,"default":0.3,"unit":"linear"},{"id":"mix","name":"Mix","min":0.0,"max":1.0,"default":0.4,"unit":"%"}]}],"signalFlow":["input","reverb","delay","output"]}'

echo "=== Dry-run validation ==="
python3 scripts/inject_spec.py \
    --spec "$TEST_SPEC" \
    --template templates/multi-effect-v1 \
    --plugin-name "TestMultiEffect" \
    --dry-run

echo ""
echo "=== Generating header ==="
python3 scripts/inject_spec.py \
    --spec "$TEST_SPEC" \
    --template templates/multi-effect-v1 \
    --plugin-name "TestMultiEffect"

echo ""
echo "=== Generated header (first 60 lines) ==="
head -60 templates/multi-effect-v1/Source/generated_config.h

echo ""
echo "=== PASS: inject_spec.py layers test succeeded ==="
