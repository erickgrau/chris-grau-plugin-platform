#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
// Parameter IDs (keep in sync with dsp_spec.json)
static const juce::String kParamRoomSize  ("roomSize");
static const juce::String kParamDamping   ("damping");
static const juce::String kParamMix       ("mix");
static const juce::String kParamPreDelay  ("preDelay");

//==============================================================================
juce::AudioProcessorValueTreeState::ParameterLayout
ReverbPlateAudioProcessor::createParameterLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add (std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID { kParamRoomSize, 1 },
        "Room Size",
        juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f),
        0.6f,
        juce::AudioParameterFloatAttributes{}
            .withLabel ("size")
    ));

    layout.add (std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID { kParamDamping, 1 },
        "Damping",
        juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f),
        0.4f,
        juce::AudioParameterFloatAttributes{}
            .withLabel ("%")
    ));

    layout.add (std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID { kParamMix, 1 },
        "Mix",
        juce::NormalisableRange<float> (0.0f, 1.0f, 0.001f),
        0.3f,
        juce::AudioParameterFloatAttributes{}
            .withLabel ("%")
    ));

    layout.add (std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID { kParamPreDelay, 1 },
        "Pre-Delay",
        juce::NormalisableRange<float> (0.0f, 100.0f, 0.1f),
        20.0f,
        juce::AudioParameterFloatAttributes{}
            .withLabel ("ms")
    ));

    return layout;
}

//==============================================================================
ReverbPlateAudioProcessor::ReverbPlateAudioProcessor()
    : AudioProcessor (BusesProperties()
        .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
        .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "Parameters", createParameterLayout())
{
    // Cache atomic pointers for lock-free audio-thread reads
    pRoomSize = apvts.getRawParameterValue (kParamRoomSize);
    pDamping  = apvts.getRawParameterValue (kParamDamping);
    pMix      = apvts.getRawParameterValue (kParamMix);
    pPreDelay = apvts.getRawParameterValue (kParamPreDelay);

    // Register as listener so we can react to automation / UI changes
    apvts.addParameterListener (kParamRoomSize, this);
    apvts.addParameterListener (kParamDamping,  this);
    apvts.addParameterListener (kParamMix,      this);
    apvts.addParameterListener (kParamPreDelay, this);
}

ReverbPlateAudioProcessor::~ReverbPlateAudioProcessor()
{
    apvts.removeParameterListener (kParamRoomSize, this);
    apvts.removeParameterListener (kParamDamping,  this);
    apvts.removeParameterListener (kParamMix,      this);
    apvts.removeParameterListener (kParamPreDelay, this);
}

//==============================================================================
void ReverbPlateAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate       = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32> (samplesPerBlock);
    spec.numChannels      = 2;

    // Prepare reverb
    reverb.prepare (spec);

    // Prepare pre-delay lines
    for (auto& dl : preDelayLines)
    {
        dl.prepare (spec);
        dl.setMaximumDelayInSamples (static_cast<int> (sampleRate * 0.105)); // 105 ms headroom
    }

    updateReverbParams();
    updatePreDelayLength();
}

void ReverbPlateAudioProcessor::releaseResources()
{
    reverb.reset();
    for (auto& dl : preDelayLines)
        dl.reset();
}

bool ReverbPlateAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    // We support stereo in/out only
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    if (layouts.getMainInputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    return true;
}

//==============================================================================
void ReverbPlateAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                               juce::MidiBuffer& /*midiMessages*/)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples  = buffer.getNumSamples();
    const int numChannels = juce::jmin (buffer.getNumChannels(), kMaxChannels);

    // ── Pre-delay ─────────────────────────────────────────────────────────────
    // Apply circular delay per channel before reverb
    for (int ch = 0; ch < numChannels; ++ch)
    {
        auto* samples = buffer.getWritePointer (ch);
        for (int i = 0; i < numSamples; ++i)
        {
            const float delayed = preDelayLines[ch].popSample (0, -1, true);
            preDelayLines[ch].pushSample (0, samples[i]);
            samples[i] = delayed;
        }
    }

    // ── Reverb ────────────────────────────────────────────────────────────────
    // juce::dsp::Reverb expects a stereo ProcessContextReplacing
    juce::dsp::AudioBlock<float> block (buffer);
    juce::dsp::ProcessContextReplacing<float> ctx (block);
    reverb.process (ctx);
}

//==============================================================================
void ReverbPlateAudioProcessor::parameterChanged (const juce::String& parameterID,
                                                   float /*newValue*/)
{
    if (parameterID == kParamPreDelay)
        updatePreDelayLength();
    else
        updateReverbParams();
}

void ReverbPlateAudioProcessor::updateReverbParams()
{
    juce::dsp::Reverb::Parameters params;
    params.roomSize   = pRoomSize->load();
    params.damping    = pDamping->load();
    params.wetLevel   = pMix->load();
    params.dryLevel   = 1.0f - pMix->load();
    params.width      = 1.0f;   // full stereo width
    params.freezeMode = 0.0f;
    reverb.setParameters (params);
}

void ReverbPlateAudioProcessor::updatePreDelayLength()
{
    if (currentSampleRate <= 0.0)
        return;

    const float ms      = pPreDelay->load();
    const float samples = static_cast<float> (ms * 0.001 * currentSampleRate);
    for (auto& dl : preDelayLines)
        dl.setDelay (samples);
}

//==============================================================================
juce::AudioProcessorEditor* ReverbPlateAudioProcessor::createEditor()
{
    return new ReverbPlateEditor (*this);
}

bool ReverbPlateAudioProcessor::hasEditor() const { return true; }

//==============================================================================
const juce::String ReverbPlateAudioProcessor::getName() const
{
    return JucePlugin_Name;
}

bool  ReverbPlateAudioProcessor::acceptsMidi()  const { return false; }
bool  ReverbPlateAudioProcessor::producesMidi() const { return false; }
bool  ReverbPlateAudioProcessor::isMidiEffect() const { return false; }
double ReverbPlateAudioProcessor::getTailLengthSeconds() const { return 6.0; }

//==============================================================================
int  ReverbPlateAudioProcessor::getNumPrograms()    { return 1; }
int  ReverbPlateAudioProcessor::getCurrentProgram() { return 0; }
void ReverbPlateAudioProcessor::setCurrentProgram (int) {}
const juce::String ReverbPlateAudioProcessor::getProgramName (int) { return {}; }
void ReverbPlateAudioProcessor::changeProgramName (int, const juce::String&) {}

//==============================================================================
void ReverbPlateAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml (state.createXml());
    copyXmlToBinary (*xml, destData);
}

void ReverbPlateAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState (getXmlFromBinary (data, sizeInBytes));
    if (xmlState != nullptr)
        if (xmlState->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xmlState));
}

//==============================================================================
// Plugin entry point
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ReverbPlateAudioProcessor();
}
