# My lil acid bass: VST3 instrument (and a standalone app) built on JUCE.
# Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see LICENSE)
cmake_minimum_required(VERSION 3.22)
project(MyLilAcidBassline VERSION 0.1.0)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 9.0.4
    GIT_SHALLOW ON)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(MyLilAcidBassline
    COMPANY_NAME "A_Development"
    PLUGIN_MANUFACTURER_CODE Adev
    PLUGIN_CODE Ab2x
    FORMATS VST3 Standalone
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    NEEDS_WEBVIEW2 TRUE
    PRODUCT_NAME "My lil acid bass"
    VST3_CATEGORIES Instrument Synth
    COPY_PLUGIN_AFTER_BUILD FALSE)

# The window is the web page itself: the same index.html, acidbass.js, factory.js and ui-bridge.js the web version ships.
juce_add_binary_data(AcidUi HEADER_NAME "AcidUiData.h" NAMESPACE AcidUi SOURCES
    ../index.html ../acidbass.js ../factory.js ../ui-bridge.js ui/juce-frontend.js)

target_sources(MyLilAcidBassline PRIVATE Source/PluginProcessor.cpp Source/PluginProcessor.h Source/AcidVoice.h Source/Maps.h Source/DriveStage.h Source/DelayStage.h Source/ReverbStage.h
    Source/ParamBridge.h Source/Editor.h Source/Editor.cpp)
target_include_directories(MyLilAcidBassline PUBLIC Source)
target_compile_definitions(MyLilAcidBassline PUBLIC JUCE_WEB_BROWSER=1 JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(MyLilAcidBassline PRIVATE AcidUi juce::juce_audio_utils juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)

# A headless smoke test: drives the real processor with MIDI and checks what comes out (no host needed).
enable_testing()
juce_add_console_app(MyLilAcidBasslineTest PRODUCT_NAME "MyLilAcidBasslineTest")
# The test compiles the processor itself rather than linking the plugin target, so it sees the JUCE modules directly.
target_sources(MyLilAcidBasslineTest PRIVATE Tests/smoke.cpp Source/PluginProcessor.cpp)
target_include_directories(MyLilAcidBasslineTest PRIVATE Source)
target_compile_definitions(MyLilAcidBasslineTest PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
target_link_libraries(MyLilAcidBasslineTest PRIVATE juce::juce_audio_utils juce::juce_dsp juce::juce_recommended_config_flags)
add_test(NAME smoke COMMAND MyLilAcidBasslineTest)
