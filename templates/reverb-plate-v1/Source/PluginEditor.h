#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

//==============================================================================
/**
 * ReverbPlateEditor
 *
 * Placeholder GUI with four knobs (roomSize, damping, mix, preDelay).
 * No WebView dependency — pure JUCE component.
 */
class ReverbPlateEditor  : public juce::AudioProcessorEditor
{
public:
    explicit ReverbPlateEditor (ReverbPlateAudioProcessor&);
    ~ReverbPlateEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    ReverbPlateAudioProcessor& processorRef;

    // ── Knobs ──────────────────────────────────────────────────────────────
    juce::Slider roomSizeKnob  { juce::Slider::RotaryVerticalDrag, juce::Slider::TextBoxBelow };
    juce::Slider dampingKnob   { juce::Slider::RotaryVerticalDrag, juce::Slider::TextBoxBelow };
    juce::Slider mixKnob       { juce::Slider::RotaryVerticalDrag, juce::Slider::TextBoxBelow };
    juce::Slider preDelayKnob  { juce::Slider::RotaryVerticalDrag, juce::Slider::TextBoxBelow };

    // ── Labels ─────────────────────────────────────────────────────────────
    juce::Label roomSizeLabel,  dampingLabel,  mixLabel,  preDelayLabel;

    // ── APVTS Attachments ─────────────────────────────────────────────────
    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    std::unique_ptr<SliderAttachment> roomSizeAttach;
    std::unique_ptr<SliderAttachment> dampingAttach;
    std::unique_ptr<SliderAttachment> mixAttach;
    std::unique_ptr<SliderAttachment> preDelayAttach;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReverbPlateEditor)
};
