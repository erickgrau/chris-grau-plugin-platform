#include "PluginEditor.h"

//==============================================================================
ReverbPlateEditor::ReverbPlateEditor (ReverbPlateAudioProcessor& p)
    : AudioProcessorEditor (&p), processorRef (p)
{
    // ── Knob setup helper ────────────────────────────────────────────────────
    auto setupKnob = [&] (juce::Slider& knob,
                           juce::Label& label,
                           const juce::String& labelText,
                           std::unique_ptr<SliderAttachment>& attach,
                           const juce::String& paramID)
    {
        addAndMakeVisible (knob);
        knob.setDoubleClickReturnValue (true, knob.getDoubleClickReturnValue());

        addAndMakeVisible (label);
        label.setText (labelText, juce::dontSendNotification);
        label.setJustificationType (juce::Justification::centred);
        label.setFont (juce::FontOptions (13.0f, juce::Font::bold));

        attach = std::make_unique<SliderAttachment> (processorRef.apvts, paramID, knob);
    };

    setupKnob (roomSizeKnob, roomSizeLabel, "Room Size", roomSizeAttach, "roomSize");
    setupKnob (dampingKnob,  dampingLabel,  "Damping",   dampingAttach,  "damping");
    setupKnob (mixKnob,      mixLabel,      "Mix",       mixAttach,      "mix");
    setupKnob (preDelayKnob, preDelayLabel, "Pre-Delay", preDelayAttach, "preDelay");

    setSize (480, 200);
}

ReverbPlateEditor::~ReverbPlateEditor() {}

//==============================================================================
void ReverbPlateEditor::paint (juce::Graphics& g)
{
    // Background gradient — dark charcoal with a hint of blue
    g.fillAll (juce::Colour (0xff1e2233));

    // Title bar
    g.setColour (juce::Colour (0xff2c3350));
    g.fillRect (0, 0, getWidth(), 36);

    g.setColour (juce::Colours::white);
    g.setFont (juce::FontOptions (16.0f, juce::Font::bold));
    g.drawText ("REVERB PLATE  |  Chibitek Labs",
                0, 0, getWidth(), 36,
                juce::Justification::centred);

    // Subtle horizontal divider
    g.setColour (juce::Colour (0xff3a4466));
    g.drawHorizontalLine (36, 0.0f, static_cast<float> (getWidth()));
}

void ReverbPlateEditor::resized()
{
    const int topPad   = 44;
    const int knobW    = 100;
    const int knobH    = 100;
    const int labelH   = 20;
    const int totalW   = getWidth();
    const int numKnobs = 4;
    const int spacing  = (totalW - numKnobs * knobW) / (numKnobs + 1);

    auto placeKnob = [&] (juce::Slider& knob, juce::Label& label, int index)
    {
        const int x = spacing + index * (knobW + spacing);
        knob.setBounds  (x, topPad,           knobW, knobH);
        label.setBounds (x, topPad + knobH,   knobW, labelH);
    };

    placeKnob (roomSizeKnob, roomSizeLabel, 0);
    placeKnob (dampingKnob,  dampingLabel,  1);
    placeKnob (mixKnob,      mixLabel,      2);
    placeKnob (preDelayKnob, preDelayLabel, 3);
}
