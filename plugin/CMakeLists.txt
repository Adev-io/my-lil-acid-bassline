# Acid Bass 2: VST3 instrument (and a standalone app) built on JUCE.
# Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see LICENSE)
cmake_minimum_required(VERSION 3.22)
project(AcidBass2 VERSION 0.1.0)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 9.0.4
    GIT_SHALLOW ON)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(AcidBass2
    COMPANY_NAME "A_Development"
    PLUGIN_MANUFACTURER_CODE Adev
    PLUGIN_CODE Ab2x
    FORMATS VST3 Standalone
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    PRODUCT_NAME "Acid Bass 2"
    VST3_CATEGORIES Instrument Synth
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(AcidBass2 PRIVATE Source/PluginProcessor.cpp Source/PluginProcessor.h Source/AcidVoice.h)
target_include_directories(AcidBass2 PUBLIC Source)
target_compile_definitions(AcidBass2 PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(AcidBass2 PRIVATE juce::juce_audio_utils juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)

# A headless smoke test: drives the real processor with MIDI and checks what comes out (no host needed).
enable_testing()
juce_add_console_app(AcidBass2Test PRODUCT_NAME "AcidBass2Test")
# The test compiles the processor itself rather than linking the plugin target, so it sees the JUCE modules directly.
target_sources(AcidBass2Test PRIVATE Tests/smoke.cpp Source/PluginProcessor.cpp)
target_include_directories(AcidBass2Test PRIVATE Source)
target_compile_definitions(AcidBass2Test PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(AcidBass2Test PRIVATE juce::juce_audio_utils juce::juce_dsp juce::juce_recommended_config_flags)
add_test(NAME smoke COMMAND AcidBass2Test)
