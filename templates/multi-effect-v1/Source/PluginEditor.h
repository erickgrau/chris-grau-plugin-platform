#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

//==============================================================================
/**
 * MultiEffectEditor
 *
 * Renders each DSP layer as a vertical tile with a header label and knobs.
 * Tile count and knob count come from generated_config.h at compile time.
 */
class MultiEffectEditor : public juce::AudioProcessorEditor
{
public:
    explicit MultiEffectEditor (MultiEffectAudioProcessor&);
    ~MultiEffectEditor() override;

    void paint   (juce::Graphics&) override;
    void resized () override;

private:
    MultiEffectAudioProcessor& processor;

    static constexpr int kTileHeaderH = 30;
    static constexpr int kKnobSize    = 72;
    static constexpr int kKnobLabelH  = 20;
    static constexpr int kTilePadV    = 14;  // padding above and below knobs in tile
    static constexpr int kTileH       = kTileHeaderH + kTilePadV + kKnobSize + kKnobLabelH + kTilePadV;
    static constexpr int kTitleBarH   = 44;
    static constexpr int kWindowW     = 480;

    static constexpr int kMaxLayers        = MultiEffectAudioProcessor::kMaxLayers;
    static constexpr int kMaxParamsPerLayer = MultiEffectAudioProcessor::kMaxParamsPerLayer;

    juce::Slider paramSliders [kMaxLayers][kMaxParamsPerLayer];
    juce::Label  paramLabels  [kMaxLayers][kMaxParamsPerLayer];
    juce::Label  layerHeaders [kMaxLayers];

    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment>
        sliderAttachments [kMaxLayers][kMaxParamsPerLayer];

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MultiEffectEditor)
};
