cmake_minimum_required(VERSION 3.22)
project(MultiEffectV1 VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ─── JUCE ────────────────────────────────────────────────────────────────────
include(FetchContent)

FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        7.0.12
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(JUCE)

# ─── Plugin Target ───────────────────────────────────────────────────────────
juce_add_plugin(MultiEffect
    PLUGIN_NAME             "Multi Effect"
    PLUGIN_MANUFACTURER     "Chibitek Labs"
    PLUGIN_MANUFACTURER_CODE CHBT
    PLUGIN_CODE             MuFx
    FORMATS                 AU VST3 Standalone
    IS_SYNTH                FALSE
    NEEDS_MIDI_INPUT        FALSE
    NEEDS_MIDI_OUTPUT       FALSE
    IS_MIDI_EFFECT          FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    BUNDLE_ID               com.chibitek.multi-effect
    PRODUCT_NAME            "Multi Effect"
    COMPANY_NAME            "Chibitek Labs"
    VST3_CATEGORIES         "Fx"
    AU_MAIN_TYPE            kAudioUnitType_Effect
)

# Generate JuceHeader.h
juce_generate_juce_header(MultiEffect)

target_sources(MultiEffect
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
)

target_compile_definitions(MultiEffect
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(MultiEffect
    PRIVATE
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_formats
        juce::juce_audio_plugin_client
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_core
        juce::juce_data_structures
        juce::juce_dsp
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
