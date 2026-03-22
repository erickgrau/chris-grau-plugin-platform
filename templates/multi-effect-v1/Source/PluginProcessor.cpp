#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
MultiEffectAudioProcessor::MultiEffectAudioProcessor()
    : AudioProcessor (BusesProperties()
                        .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                        .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "Parameters", createParameterLayout())
{
    // Initialise waveshaper transfer functions (soft clip)
    for (int i = 0; i < kMaxLayers; ++i)
        distortionDsp[i].functionToUse = [](float x) { return x / (1.0f + std::abs (x)); };

    // Build layer configs and cache parameter pointers from macros
    initLayerConfigs();
}

MultiEffectAudioProcessor::~MultiEffectAudioProcessor() {}

//==============================================================================
// initLayerConfigs — reads generated_config.h macros to populate layerConfigs[]
// and layerParamPtrs[][].  Uses #ifdef guards so unused layer slots are skipped.
//==============================================================================
void MultiEffectAudioProcessor::initLayerConfigs()
{
    numLayers = NUM_LAYERS;

    // ── Layer 0 ──────────────────────────────────────────────────────────────
#ifdef LAYER_0_TYPE
    {
        auto& cfg   = layerConfigs[0];
        cfg.id        = LAYER_0_ID;
        cfg.type      = LAYER_0_TYPE;
        cfg.label     = LAYER_0_LABEL;
        cfg.blend     = LAYER_0_BLEND;
        cfg.paramCount = LAYER_0_PARAM_COUNT;
        int p = 0;
#if LAYER_0_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_0_PARAM_0_ID; cfg.paramNames[p] = LAYER_0_PARAM_0_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_0_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_0_PARAM_1_ID; cfg.paramNames[p] = LAYER_0_PARAM_1_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_1_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_0_PARAM_2_ID; cfg.paramNames[p] = LAYER_0_PARAM_2_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_2_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_0_PARAM_3_ID; cfg.paramNames[p] = LAYER_0_PARAM_3_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_3_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_0_PARAM_4_ID; cfg.paramNames[p] = LAYER_0_PARAM_4_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_4_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_0_PARAM_5_ID; cfg.paramNames[p] = LAYER_0_PARAM_5_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_5_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 7
        cfg.paramIds[p] = LAYER_0_PARAM_6_ID; cfg.paramNames[p] = LAYER_0_PARAM_6_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_6_ID); ++p;
#endif
#if LAYER_0_PARAM_COUNT >= 8
        cfg.paramIds[p] = LAYER_0_PARAM_7_ID; cfg.paramNames[p] = LAYER_0_PARAM_7_NAME;
        layerParamPtrs[0][p] = apvts.getRawParameterValue (LAYER_0_PARAM_7_ID); ++p;
#endif
        (void)p;
    }
#endif

    // ── Layer 1 ──────────────────────────────────────────────────────────────
#ifdef LAYER_1_TYPE
    {
        auto& cfg   = layerConfigs[1];
        cfg.id        = LAYER_1_ID;
        cfg.type      = LAYER_1_TYPE;
        cfg.label     = LAYER_1_LABEL;
        cfg.blend     = LAYER_1_BLEND;
        cfg.paramCount = LAYER_1_PARAM_COUNT;
        int p = 0;
#if LAYER_1_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_1_PARAM_0_ID; cfg.paramNames[p] = LAYER_1_PARAM_0_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_0_ID); ++p;
#endif
#if LAYER_1_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_1_PARAM_1_ID; cfg.paramNames[p] = LAYER_1_PARAM_1_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_1_ID); ++p;
#endif
#if LAYER_1_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_1_PARAM_2_ID; cfg.paramNames[p] = LAYER_1_PARAM_2_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_2_ID); ++p;
#endif
#if LAYER_1_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_1_PARAM_3_ID; cfg.paramNames[p] = LAYER_1_PARAM_3_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_3_ID); ++p;
#endif
#if LAYER_1_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_1_PARAM_4_ID; cfg.paramNames[p] = LAYER_1_PARAM_4_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_4_ID); ++p;
#endif
#if LAYER_1_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_1_PARAM_5_ID; cfg.paramNames[p] = LAYER_1_PARAM_5_NAME;
        layerParamPtrs[1][p] = apvts.getRawParameterValue (LAYER_1_PARAM_5_ID); ++p;
#endif
        (void)p;
    }
#endif

    // ── Layer 2 ──────────────────────────────────────────────────────────────
#ifdef LAYER_2_TYPE
    {
        auto& cfg   = layerConfigs[2];
        cfg.id        = LAYER_2_ID;
        cfg.type      = LAYER_2_TYPE;
        cfg.label     = LAYER_2_LABEL;
        cfg.blend     = LAYER_2_BLEND;
        cfg.paramCount = LAYER_2_PARAM_COUNT;
        int p = 0;
#if LAYER_2_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_2_PARAM_0_ID; cfg.paramNames[p] = LAYER_2_PARAM_0_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_0_ID); ++p;
#endif
#if LAYER_2_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_2_PARAM_1_ID; cfg.paramNames[p] = LAYER_2_PARAM_1_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_1_ID); ++p;
#endif
#if LAYER_2_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_2_PARAM_2_ID; cfg.paramNames[p] = LAYER_2_PARAM_2_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_2_ID); ++p;
#endif
#if LAYER_2_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_2_PARAM_3_ID; cfg.paramNames[p] = LAYER_2_PARAM_3_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_3_ID); ++p;
#endif
#if LAYER_2_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_2_PARAM_4_ID; cfg.paramNames[p] = LAYER_2_PARAM_4_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_4_ID); ++p;
#endif
#if LAYER_2_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_2_PARAM_5_ID; cfg.paramNames[p] = LAYER_2_PARAM_5_NAME;
        layerParamPtrs[2][p] = apvts.getRawParameterValue (LAYER_2_PARAM_5_ID); ++p;
#endif
        (void)p;
    }
#endif

    // ── Layer 3 ──────────────────────────────────────────────────────────────
#ifdef LAYER_3_TYPE
    {
        auto& cfg   = layerConfigs[3];
        cfg.id        = LAYER_3_ID;
        cfg.type      = LAYER_3_TYPE;
        cfg.label     = LAYER_3_LABEL;
        cfg.blend     = LAYER_3_BLEND;
        cfg.paramCount = LAYER_3_PARAM_COUNT;
        int p = 0;
#if LAYER_3_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_3_PARAM_0_ID; cfg.paramNames[p] = LAYER_3_PARAM_0_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_0_ID); ++p;
#endif
#if LAYER_3_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_3_PARAM_1_ID; cfg.paramNames[p] = LAYER_3_PARAM_1_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_1_ID); ++p;
#endif
#if LAYER_3_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_3_PARAM_2_ID; cfg.paramNames[p] = LAYER_3_PARAM_2_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_2_ID); ++p;
#endif
#if LAYER_3_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_3_PARAM_3_ID; cfg.paramNames[p] = LAYER_3_PARAM_3_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_3_ID); ++p;
#endif
#if LAYER_3_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_3_PARAM_4_ID; cfg.paramNames[p] = LAYER_3_PARAM_4_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_4_ID); ++p;
#endif
#if LAYER_3_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_3_PARAM_5_ID; cfg.paramNames[p] = LAYER_3_PARAM_5_NAME;
        layerParamPtrs[3][p] = apvts.getRawParameterValue (LAYER_3_PARAM_5_ID); ++p;
#endif
        (void)p;
    }
#endif

    // ── Layer 4 ──────────────────────────────────────────────────────────────
#ifdef LAYER_4_TYPE
    {
        auto& cfg   = layerConfigs[4];
        cfg.id        = LAYER_4_ID;
        cfg.type      = LAYER_4_TYPE;
        cfg.label     = LAYER_4_LABEL;
        cfg.blend     = LAYER_4_BLEND;
        cfg.paramCount = LAYER_4_PARAM_COUNT;
        int p = 0;
#if LAYER_4_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_4_PARAM_0_ID; cfg.paramNames[p] = LAYER_4_PARAM_0_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_0_ID); ++p;
#endif
#if LAYER_4_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_4_PARAM_1_ID; cfg.paramNames[p] = LAYER_4_PARAM_1_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_1_ID); ++p;
#endif
#if LAYER_4_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_4_PARAM_2_ID; cfg.paramNames[p] = LAYER_4_PARAM_2_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_2_ID); ++p;
#endif
#if LAYER_4_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_4_PARAM_3_ID; cfg.paramNames[p] = LAYER_4_PARAM_3_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_3_ID); ++p;
#endif
#if LAYER_4_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_4_PARAM_4_ID; cfg.paramNames[p] = LAYER_4_PARAM_4_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_4_ID); ++p;
#endif
#if LAYER_4_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_4_PARAM_5_ID; cfg.paramNames[p] = LAYER_4_PARAM_5_NAME;
        layerParamPtrs[4][p] = apvts.getRawParameterValue (LAYER_4_PARAM_5_ID); ++p;
#endif
        (void)p;
    }
#endif

    // ── Layer 5 ──────────────────────────────────────────────────────────────
#ifdef LAYER_5_TYPE
    {
        auto& cfg   = layerConfigs[5];
        cfg.id        = LAYER_5_ID;
        cfg.type      = LAYER_5_TYPE;
        cfg.label     = LAYER_5_LABEL;
        cfg.blend     = LAYER_5_BLEND;
        cfg.paramCount = LAYER_5_PARAM_COUNT;
        int p = 0;
#if LAYER_5_PARAM_COUNT >= 1
        cfg.paramIds[p] = LAYER_5_PARAM_0_ID; cfg.paramNames[p] = LAYER_5_PARAM_0_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_0_ID); ++p;
#endif
#if LAYER_5_PARAM_COUNT >= 2
        cfg.paramIds[p] = LAYER_5_PARAM_1_ID; cfg.paramNames[p] = LAYER_5_PARAM_1_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_1_ID); ++p;
#endif
#if LAYER_5_PARAM_COUNT >= 3
        cfg.paramIds[p] = LAYER_5_PARAM_2_ID; cfg.paramNames[p] = LAYER_5_PARAM_2_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_2_ID); ++p;
#endif
#if LAYER_5_PARAM_COUNT >= 4
        cfg.paramIds[p] = LAYER_5_PARAM_3_ID; cfg.paramNames[p] = LAYER_5_PARAM_3_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_3_ID); ++p;
#endif
#if LAYER_5_PARAM_COUNT >= 5
        cfg.paramIds[p] = LAYER_5_PARAM_4_ID; cfg.paramNames[p] = LAYER_5_PARAM_4_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_4_ID); ++p;
#endif
#if LAYER_5_PARAM_COUNT >= 6
        cfg.paramIds[p] = LAYER_5_PARAM_5_ID; cfg.paramNames[p] = LAYER_5_PARAM_5_NAME;
        layerParamPtrs[5][p] = apvts.getRawParameterValue (LAYER_5_PARAM_5_ID); ++p;
#endif
        (void)p;
    }
#endif
}

//==============================================================================
void MultiEffectAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize  = samplesPerBlock;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate       = sampleRate;
    spec.maximumBlockSize = (juce::uint32) samplesPerBlock;
    spec.numChannels      = 2;

    // ~2 seconds at 96 kHz — sufficient for long delays
    static constexpr int kMaxDelaySamples = 192001;

    for (int i = 0; i < numLayers; ++i)
    {
        const auto& cfg = layerConfigs[i];

        if (cfg.type == "reverb")
        {
            reverbDsp[i].prepare (spec);
            juce::dsp::Reverb::Parameters rp;
            rp.dryLevel  = 0.0f;
            rp.wetLevel  = 1.0f;
            rp.roomSize  = 0.6f;
            rp.damping   = 0.4f;
            rp.width     = 1.0f;
            rp.freezeMode = 0.0f;
            reverbDsp[i].setParameters (rp);
        }
        else if (cfg.type == "delay")
        {
            delayState[i].prepare (kMaxDelaySamples);
        }
        else if (cfg.type == "eq")
        {
            eqDsp[i].state = juce::dsp::IIR::Coefficients<float>::makePeakFilter (
                sampleRate, 1000.0, 0.707, 1.0);
            eqDsp[i].prepare (spec);
        }
        else if (cfg.type == "chorus")
        {
            chorusDsp[i].prepare (spec);
        }
        else if (cfg.type == "compressor")
        {
            compressorDsp[i].prepare (spec);
        }
        else if (cfg.type == "distortion")
        {
            distortionDsp[i].prepare (spec);
        }
    }
}

void MultiEffectAudioProcessor::releaseResources() {}

bool MultiEffectAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;

    return true;
}

//==============================================================================
void MultiEffectAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer,
                                               juce::MidiBuffer& /*midiMessages*/)
{
    juce::ScopedNoDenormals noDenormals;

    for (int i = getTotalNumInputChannels(); i < getTotalNumOutputChannels(); ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    for (int i = 0; i < numLayers; ++i)
        processLayer (i, buffer);
}

//==============================================================================
void MultiEffectAudioProcessor::processLayer (int layerIdx,
                                               juce::AudioBuffer<float>& buffer)
{
    const auto& cfg        = layerConfigs[layerIdx];
    const float blend      = cfg.blend;
    const int   numSamples = buffer.getNumSamples();
    const int   numCh      = juce::jmin (buffer.getNumChannels(), 2);

    // Helper: safe param read with fallback
    auto param = [&](int p, float fallback) -> float {
        if (p < cfg.paramCount && layerParamPtrs[layerIdx][p] != nullptr)
            return layerParamPtrs[layerIdx][p]->load();
        return fallback;
    };

    // Save dry signal for wet/dry blend
    juce::AudioBuffer<float> dryBuf;
    if (blend < 0.9999f)
        dryBuf.makeCopyOf (buffer);

    auto block = juce::dsp::AudioBlock<float> (buffer);
    auto ctx   = juce::dsp::ProcessContextReplacing<float> (block);

    // ── Dispatch by layer type ────────────────────────────────────────────────
    if (cfg.type == "reverb")
    {
        juce::dsp::Reverb::Parameters rp;
        rp.roomSize  = param (0, 0.6f);
        rp.damping   = param (1, 0.4f);
        rp.dryLevel  = 0.0f;   // wet/dry handled externally via blend
        rp.wetLevel  = 1.0f;
        rp.width     = 1.0f;
        rp.freezeMode = 0.0f;
        reverbDsp[layerIdx].setParameters (rp);
        reverbDsp[layerIdx].process (ctx);
    }
    else if (cfg.type == "delay")
    {
        float delayMs  = param (0, 250.0f);
        float feedback = param (1, 0.3f);
        int   samples  = juce::jmin (
            (int) (delayMs * currentSampleRate / 1000.0),
            (int) delayState[layerIdx].buf[0].size() - 1);
        processDelayLayer (layerIdx, buffer, samples, feedback);
    }
    else if (cfg.type == "eq")
    {
        float cutoff = param (0, 1000.0f);
        float q      = param (1, 0.707f);
        float gainDb = param (2, 0.0f);
        *eqDsp[layerIdx].state = *juce::dsp::IIR::Coefficients<float>::makePeakFilter (
            currentSampleRate, (double) cutoff, (double) q, (double) juce::Decibels::decibelsToGain (gainDb));
        eqDsp[layerIdx].process (ctx);
    }
    else if (cfg.type == "chorus")
    {
        chorusDsp[layerIdx].setRate        (param (0, 1.0f));
        chorusDsp[layerIdx].setDepth       (param (1, 0.5f));
        chorusDsp[layerIdx].setCentreDelay (7.0f);
        chorusDsp[layerIdx].setFeedback    (0.0f);
        chorusDsp[layerIdx].setMix         (1.0f);
        chorusDsp[layerIdx].process (ctx);
    }
    else if (cfg.type == "compressor")
    {
        compressorDsp[layerIdx].setThreshold (param (0, -20.0f));
        compressorDsp[layerIdx].setRatio     (param (1,   4.0f));
        compressorDsp[layerIdx].setAttack    (param (2,  10.0f));
        compressorDsp[layerIdx].setRelease   (100.0f);
        compressorDsp[layerIdx].process (ctx);
    }
    else if (cfg.type == "distortion")
    {
        float drive   = param (0, 2.0f);
        float outGain = param (1, 0.0f); // dB
        buffer.applyGain (drive);
        distortionDsp[layerIdx].process (ctx);
        buffer.applyGain (juce::Decibels::decibelsToGain (outGain));
    }

    // ── Apply blend (wet/dry mix) ─────────────────────────────────────────────
    if (blend < 0.9999f)
    {
        for (int ch = 0; ch < numCh; ++ch)
        {
            auto*       wet = buffer.getWritePointer (ch);
            const auto* dry = dryBuf.getReadPointer  (ch);
            for (int s = 0; s < numSamples; ++s)
                wet[s] = blend * wet[s] + (1.0f - blend) * dry[s];
        }
    }
}

//==============================================================================
void MultiEffectAudioProcessor::processDelayLayer (int layerIdx,
                                                    juce::AudioBuffer<float>& buffer,
                                                    int delaySamples, float feedback)
{
    auto& ds       = delayState[layerIdx];
    const int nS   = buffer.getNumSamples();
    const int nCh  = juce::jmin (buffer.getNumChannels(), 2);

    for (int ch = 0; ch < nCh; ++ch)
    {
        auto*       samp    = buffer.getWritePointer (ch);
        auto&       buf     = ds.buf[(size_t) ch];
        int&        wPos    = ds.writePos[(size_t) ch];
        const int   bufSize = (int) buf.size();

        if (bufSize == 0) continue;

        for (int s = 0; s < nS; ++s)
        {
            int   rPos    = (wPos - delaySamples + bufSize) % bufSize;
            float delayed = buf[(size_t) rPos];
            buf[(size_t) wPos] = samp[s] + feedback * delayed;
            wPos  = (wPos + 1) % bufSize;
            samp[s] = delayed;
        }
    }
}

//==============================================================================
// AudioProcessor boilerplate
//==============================================================================
const juce::String MultiEffectAudioProcessor::getName() const { return CHIBI_PLUGIN_NAME; }
bool MultiEffectAudioProcessor::acceptsMidi()  const { return false; }
bool MultiEffectAudioProcessor::producesMidi() const { return false; }
bool MultiEffectAudioProcessor::isMidiEffect() const { return false; }
double MultiEffectAudioProcessor::getTailLengthSeconds() const { return 6.0; }

int  MultiEffectAudioProcessor::getNumPrograms()             { return 1; }
int  MultiEffectAudioProcessor::getCurrentProgram()          { return 0; }
void MultiEffectAudioProcessor::setCurrentProgram (int)      {}
const juce::String MultiEffectAudioProcessor::getProgramName (int) { return {}; }
void MultiEffectAudioProcessor::changeProgramName (int, const juce::String&) {}

bool MultiEffectAudioProcessor::hasEditor() const { return true; }
juce::AudioProcessorEditor* MultiEffectAudioProcessor::createEditor()
{
    return new MultiEffectEditor (*this);
}

void MultiEffectAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml (state.createXml());
    copyXmlToBinary (*xml, destData);
}

void MultiEffectAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState (getXmlFromBinary (data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName (apvts.state.getType()))
        apvts.replaceState (juce::ValueTree::fromXml (*xmlState));
}

//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MultiEffectAudioProcessor();
}
