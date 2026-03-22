cmake_minimum_required(VERSION 3.22)
project(ReverbPlateV1 VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ─── JUCE ────────────────────────────────────────────────────────────────────
# Assumes JUCE is available via FetchContent or a local path.
# Set JUCE_PATH to your JUCE root, or let FetchContent download it.

include(FetchContent)

FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        7.0.12
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(JUCE)

# ─── Plugin Target ───────────────────────────────────────────────────────────
juce_add_plugin(ReverbPlate
    # Plugin Identity
    PLUGIN_NAME             "Reverb Plate"
    PLUGIN_MANUFACTURER     "Chibitek Labs"
    PLUGIN_MANUFACTURER_CODE CHBT
    PLUGIN_CODE             RvPl

    # Formats
    FORMATS                 AU VST3 Standalone

    # Capabilities
    IS_SYNTH                FALSE
    NEEDS_MIDI_INPUT        FALSE
    NEEDS_MIDI_OUTPUT       FALSE
    IS_MIDI_EFFECT          FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE

    # Bundle / product IDs
    BUNDLE_ID               com.chibitek.reverb-plate
    PRODUCT_NAME            "Reverb Plate"
    COMPANY_NAME            "Chibitek Labs"
    COMPANY_WEBSITE         "https://chibitek.com"
    COMPANY_EMAIL           "hello@chibitek.com"

    VST3_CATEGORIES         "Fx|Reverb"
    AU_MAIN_TYPE            kAudioUnitType_Effect
)

target_sources(ReverbPlate
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp
)

target_include_directories(ReverbPlate
    PRIVATE
        Source
)

target_compile_definitions(ReverbPlate
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(ReverbPlate
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
