#include "PluginEditor.h"

//==============================================================================
MultiEffectEditor::MultiEffectEditor (MultiEffectAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    const int windowH = kTitleBarH + NUM_LAYERS * kTileH + 10;
    setSize (kWindowW, windowH);

    for (int l = 0; l < processor.numLayers; ++l)
    {
        const auto& cfg = processor.layerConfigs[l];

        // Layer header label
        layerHeaders[l].setText (cfg.label.toUpperCase(), juce::dontSendNotification);
        layerHeaders[l].setFont (juce::Font (12.0f, juce::Font::bold));
        layerHeaders[l].setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.9f));
        layerHeaders[l].setJustificationType (juce::Justification::centred);
        addAndMakeVisible (layerHeaders[l]);

        for (int p = 0; p < cfg.paramCount && p < kMaxParamsPerLayer; ++p)
        {
            if (cfg.paramIds[p].isEmpty()) continue;

            // Knob
            auto& sl = paramSliders[l][p];
            sl.setSliderStyle      (juce::Slider::RotaryVerticalDrag);
            sl.setTextBoxStyle     (juce::Slider::TextBoxBelow, false, kKnobSize, 18);
            sl.setColour           (juce::Slider::rotarySliderFillColourId,  juce::Colour (0xff4fc3f7));
            sl.setColour           (juce::Slider::rotarySliderOutlineColourId, juce::Colour (0xff1e3a5f));
            sl.setColour           (juce::Slider::thumbColourId,             juce::Colour (0xff81d4fa));
            sl.setColour           (juce::Slider::textBoxTextColourId,       juce::Colours::white);
            sl.setColour           (juce::Slider::textBoxOutlineColourId,    juce::Colours::transparentBlack);
            addAndMakeVisible (sl);

            // Attachment
            sliderAttachments[l][p] = std::make_unique<
                juce::AudioProcessorValueTreeState::SliderAttachment> (
                    processor.apvts, cfg.paramIds[p], sl);

            // Label
            auto& lb = paramLabels[l][p];
            lb.setText (cfg.paramNames[p], juce::dontSendNotification);
            lb.setFont (juce::Font (10.5f));
            lb.setColour (juce::Label::textColourId, juce::Colours::white.withAlpha (0.7f));
            lb.setJustificationType (juce::Justification::centred);
            addAndMakeVisible (lb);
        }
    }
}

MultiEffectEditor::~MultiEffectEditor() {}

//==============================================================================
void MultiEffectEditor::paint (juce::Graphics& g)
{
    // Background
    g.fillAll (juce::Colour (0xff0d1b2a));

    // Title bar
    g.setColour (juce::Colour (0xff1a3a5c));
    g.fillRect  (0, 0, getWidth(), kTitleBarH);

    g.setColour (juce::Colour (0xff4fc3f7));
    g.setFont   (juce::Font (15.0f, juce::Font::bold));
    g.drawText  ("MULTI EFFECT  |  Chibitek Labs", 0, 0, getWidth(), kTitleBarH,
                 juce::Justification::centred);

    // Layer tile backgrounds
    for (int l = 0; l < NUM_LAYERS; ++l)
    {
        const int tileY = kTitleBarH + l * kTileH;

        // Tile background (alternating subtle shades)
        juce::Colour tileBg = (l % 2 == 0)
            ? juce::Colour (0xff111e2d)
            : juce::Colour (0xff0f1a27);
        g.setColour (tileBg);
        g.fillRect  (0, tileY, getWidth(), kTileH);

        // Header bar
        g.setColour (juce::Colour (0xff1e3a5f));
        g.fillRect  (0, tileY, getWidth(), kTileHeaderH);

        // Separator line
        g.setColour (juce::Colour (0xff4fc3f7).withAlpha (0.25f));
        g.drawLine  (0.0f, (float)(tileY + kTileH - 1), (float) getWidth(), (float)(tileY + kTileH - 1), 1.0f);
    }
}

//==============================================================================
void MultiEffectEditor::resized()
{
    for (int l = 0; l < processor.numLayers; ++l)
    {
        const auto& cfg   = processor.layerConfigs[l];
        const int   tileY = kTitleBarH + l * kTileH;

        // Header occupies the top strip of the tile
        layerHeaders[l].setBounds (0, tileY, getWidth(), kTileHeaderH);

        // Knobs centred in the tile
        const int paramCount = cfg.paramCount;
        if (paramCount == 0) continue;

        const int totalKnobW = paramCount * kKnobSize + (paramCount - 1) * 12;
        int x = (getWidth() - totalKnobW) / 2;
        const int knobY = tileY + kTileHeaderH + kTilePadV;

        for (int p = 0; p < paramCount && p < kMaxParamsPerLayer; ++p)
        {
            paramSliders[l][p].setBounds (x, knobY, kKnobSize, kKnobSize);
            paramLabels [l][p].setBounds (x, knobY + kKnobSize, kKnobSize, kKnobLabelH);
            x += kKnobSize + 12;
        }
    }
}
