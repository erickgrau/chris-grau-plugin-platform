#pragma once

#include <JuceHeader.h>

//==============================================================================
/**
 * ReverbPlateAudioProcessor
 *
 * Plate reverb using juce::dsp::Reverb, with a pre-delay line.
 * Parameters: roomSize, damping, mix, preDelay
 */
class ReverbPlateAudioProcessor  : public juce::AudioProcessor,
                                    public juce::AudioProcessorValueTreeState::Listener
{
public:
    //==========================================================================
    ReverbPlateAudioProcessor();
    ~ReverbPlateAudioProcessor() override;

    //==========================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    //==========================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    //==========================================================================
    const juce::String getName() const override;

    bool  acceptsMidi()  const override;
    bool  producesMidi() const override;
    bool  isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    //==========================================================================
    int  getNumPrograms()    override;
    int  getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int index, const juce::String& newName) override;

    //==========================================================================
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    //==========================================================================
    // Parameter listener
    void parameterChanged (const juce::String& parameterID, float newValue) override;

    //==========================================================================
    // Expose the APVTS for editor bindings
    juce::AudioProcessorValueTreeState apvts;

    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

private:
    //==========================================================================
    // DSP objects
    juce::dsp::Reverb  reverb;

    // Pre-delay: one delay line per channel (up to stereo)
    static constexpr int   kMaxChannels    = 2;
    static constexpr float kMaxPreDelaySec = 0.105f; // slightly over 100 ms
    // We allocate a circular buffer large enough for 100 ms @ 192 kHz
    static constexpr int kMaxDelaySamples = static_cast<int>(192000 * kMaxPreDelaySec) + 1;

    std::array<juce::dsp::DelayLine<float,
        juce::dsp::DelayLineInterpolationTypes::Linear>, kMaxChannels> preDelayLines;

    //==========================================================================
    // Helpers
    void updateReverbParams();
    void updatePreDelayLength();

    double currentSampleRate = 44100.0;

    // Cached param pointers (thread-safe atomic raw values via APVTS)
    std::atomic<float>* pRoomSize  = nullptr;
    std::atomic<float>* pDamping   = nullptr;
    std::atomic<float>* pMix       = nullptr;
    std::atomic<float>* pPreDelay  = nullptr;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReverbPlateAudioProcessor)
};
