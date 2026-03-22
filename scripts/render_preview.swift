/**
 * render_preview.swift — Chris Plugin Platform
 * Author: Chibitek Labs
 * Date: 2026-03-22
 * Description: Renders a MIDI note through an AU plugin and writes a stereo 44100 Hz WAV file.
 *   Instrument plugins (kAudioUnitType_MusicDevice): MIDI noteOn → render → noteOff
 *   Effect plugins (kAudioUnitType_Effect): sine wave at note frequency → render through plugin
 * Usage: ./render_preview --plugin <path.component> --note <midi 0-127> --duration <seconds> --output <file.wav>
 * Build: swiftc render_preview.swift -o render_preview -framework AVFoundation -framework AudioUnit -framework CoreAudio
 */

import Foundation
import AVFoundation
import AudioUnit
import CoreAudio

// MARK: - Helpers

func fail(_ msg: String) -> Never {
    fputs("Error: \(msg)\n", stderr)
    exit(1)
}

/// Convert a 4-character string to an OSType (FourCC).
func fourCC(_ s: String) -> OSType {
    var result: OSType = 0
    for (i, scalar) in s.prefix(4).unicodeScalars.enumerated() {
        result |= OSType(scalar.value) << (UInt32(3 - i) * 8)
    }
    return result
}

/// MIDI note number → frequency in Hz (A4 = MIDI 69 = 440 Hz).
func midiNoteToFrequency(_ note: UInt8) -> Double {
    return 440.0 * pow(2.0, (Double(note) - 69.0) / 12.0)
}

// MARK: - Argument parsing

struct RenderArgs {
    var pluginPath: String
    var note: UInt8
    var duration: Double
    var outputPath: String
}

func parseArgs() -> RenderArgs {
    var pluginPath: String? = nil
    var note: UInt8 = 60
    var duration: Double = 2.0
    var outputPath: String = "preview.wav"

    let argv = CommandLine.arguments
    var i = 1
    while i < argv.count {
        switch argv[i] {
        case "--plugin":
            i += 1
            guard i < argv.count else { fail("--plugin requires a value") }
            pluginPath = argv[i]
        case "--note":
            i += 1
            guard i < argv.count, let n = UInt8(argv[i]), n <= 127 else { fail("--note must be 0-127") }
            note = n
        case "--duration":
            i += 1
            guard i < argv.count, let d = Double(argv[i]), d > 0 else { fail("--duration must be positive") }
            duration = min(d, 30.0)
        case "--output":
            i += 1
            guard i < argv.count else { fail("--output requires a value") }
            outputPath = argv[i]
        default:
            fputs("Warning: unknown argument '\(argv[i])'\n", stderr)
        }
        i += 1
    }

    guard let path = pluginPath, !path.isEmpty else {
        fail("--plugin <path.component> is required")
    }
    return RenderArgs(pluginPath: path, note: note, duration: duration, outputPath: outputPath)
}

// MARK: - Load component description from bundle

func loadComponentDescription(from bundlePath: String) -> (AudioComponentDescription, Bool) {
    let bundleURL = URL(fileURLWithPath: bundlePath)
    guard FileManager.default.fileExists(atPath: bundlePath) else {
        fail("Plugin bundle not found at \(bundlePath)")
    }
    guard let bundle = Bundle(url: bundleURL),
          let plist = bundle.infoDictionary,
          let audioComponents = plist["AudioComponents"] as? [[String: Any]],
          let info = audioComponents.first else {
        fail("Cannot read AudioComponents from \(bundlePath)/Contents/Info.plist")
    }

    let typeStr = info["type"] as? String ?? "aufx"
    let subtypeStr = info["subtype"] as? String ?? "????"
    let mfrStr = info["manufacturer"] as? String ?? "????"

    let desc = AudioComponentDescription(
        componentType: fourCC(typeStr),
        componentSubType: fourCC(subtypeStr),
        componentManufacturer: fourCC(mfrStr),
        componentFlags: 0,
        componentFlagsMask: 0
    )

    let isInstrument = desc.componentType == kAudioUnitType_MusicDevice ||
                       desc.componentType == kAudioUnitType_MusicEffect

    return (desc, isInstrument)
}

// MARK: - Stage plugin into Components search path

/// Temporarily symlinks the .component into ~/Library/Audio/Plug-Ins/Components/
/// so that CoreAudio can find it via AudioComponentFindNext.
/// Returns the symlink path so it can be cleaned up.
func stagePlugin(at sourcePath: String) -> String? {
    let fm = FileManager.default
    let componentsDir = (NSHomeDirectory() as NSString).appendingPathComponent(
        "Library/Audio/Plug-Ins/Components"
    )
    try? fm.createDirectory(atPath: componentsDir, withIntermediateDirectories: true)

    let componentName = (sourcePath as NSString).lastPathComponent
    let destPath = (componentsDir as NSString).appendingPathComponent(componentName)

    // Remove stale symlink if present
    if fm.fileExists(atPath: destPath) {
        try? fm.removeItem(atPath: destPath)
    }

    do {
        try fm.createSymbolicLink(atPath: destPath, withDestinationPath: sourcePath)
        return destPath
    } catch {
        fputs("Warning: could not stage plugin (\(error)). Proceeding without staging.\n", stderr)
        return nil
    }
}

func removeStaged(_ path: String?) {
    guard let path = path else { return }
    try? FileManager.default.removeItem(atPath: path)
}

// MARK: - Offline rendering

let sampleRate: Double = 44100.0
let channelCount: AVAudioChannelCount = 2

func buildSineBuffer(note: UInt8, frameCount: AVAudioFrameCount, format: AVAudioFormat) -> AVAudioPCMBuffer? {
    guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
    buf.frameLength = frameCount
    let freq = midiNoteToFrequency(note)
    let twoPi = 2.0 * Double.pi

    for ch in 0..<Int(channelCount) {
        guard let chData = buf.floatChannelData?[ch] else { continue }
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            // Brief envelope: 5ms attack, 50ms release at end
            let attackFrames = Int(0.005 * sampleRate)
            let releaseFrames = Int(0.05 * sampleRate)
            var env = 1.0
            if frame < attackFrames { env = Double(frame) / Double(attackFrames) }
            let fromEnd = Int(frameCount) - frame
            if fromEnd < releaseFrames { env = Double(fromEnd) / Double(releaseFrames) }
            chData[frame] = Float(env * 0.5 * sin(twoPi * freq * t))
        }
    }
    return buf
}

func renderPlugin(
    engine: AVAudioEngine,
    avUnit: AVAudioUnit,
    isInstrument: Bool,
    note: UInt8,
    duration: Double,
    outputPath: String
) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: channelCount)!
    let totalFrames = AVAudioFrameCount(duration * sampleRate)

    // Build graph
    let mainMixer = engine.mainMixerNode
    engine.connect(avUnit, to: mainMixer, format: format)

    if !isInstrument {
        // Source node feeding sine wave into the effect
        let playerNode = AVAudioPlayerNode()
        engine.attach(playerNode)
        engine.connect(playerNode, to: avUnit, format: format)

        guard let sineBuffer = buildSineBuffer(note: note, frameCount: totalFrames, format: format) else {
            throw NSError(domain: "render_preview", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create sine buffer"])
        }

        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        try engine.start()

        playerNode.scheduleBuffer(sineBuffer, completionHandler: nil)
        playerNode.play()
    } else {
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        try engine.start()

        // Send MIDI noteOn
        if let midiIn = avUnit.auAudioUnit.scheduleMIDIEventListBlock {
            // Build noteOn MIDIEventList
            var eventList = MIDIEventList()
            let ump = MIDIEventPacket()
            _ = ump // suppress unused warning; use lower-level MIDI if MIDIEventList unavailable
        }

        // Fallback: use the older scheduleMIDIEventBlock API
        avUnit.auAudioUnit.scheduleMIDIEventBlock?(0 /* immediately */, 0, 3, [0x90, note, 100])
    }

    // Open output WAV file
    let outputURL = URL(fileURLWithPath: outputPath)
    let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: 2,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
    ]
    let outputFile = try AVAudioFile(forWriting: outputURL, settings: settings)

    // Render in chunks
    let chunkSize: AVAudioFrameCount = 4096
    guard let renderBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunkSize) else {
        throw NSError(domain: "render_preview", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot alloc render buffer"])
    }

    var framesRendered: AVAudioFrameCount = 0
    while framesRendered < totalFrames {
        let framesToRender = min(chunkSize, totalFrames - framesRendered)
        renderBuffer.frameLength = framesToRender

        let status = try engine.renderOffline(framesToRender, to: renderBuffer)

        switch status {
        case .success:
            try outputFile.write(from: renderBuffer)
        case .insufficientDataFromInputNode:
            break // no more input
        case .error:
            throw NSError(domain: "render_preview", code: 3, userInfo: [NSLocalizedDescriptionKey: "Engine render returned error"])
        case .cannotDoInCurrentContext:
            throw NSError(domain: "render_preview", code: 4, userInfo: [NSLocalizedDescriptionKey: "Cannot render in current context"])
        @unknown default:
            break
        }

        framesRendered += framesToRender
        if status == .insufficientDataFromInputNode { break }
    }

    // Send noteOff for instruments
    if isInstrument {
        avUnit.auAudioUnit.scheduleMIDIEventBlock?(0, 0, 3, [0x80, note, 0])
    }

    engine.stop()
    engine.disableManualRenderingMode()

    fputs("Rendered \(framesRendered) frames to \(outputPath)\n", stderr)
}

// MARK: - Main

let args = parseArgs()
let (componentDesc, isInstrument) = loadComponentDescription(from: args.pluginPath)

// Stage plugin so CoreAudio can find it
let stagedPath = stagePlugin(at: args.pluginPath)

// Brief delay to let CoreAudio rescan
Thread.sleep(forTimeInterval: 0.2)

// Instantiate via AVAudioEngine
let engine = AVAudioEngine()
let semaphore = DispatchSemaphore(value: 0)
var instantiationError: Error? = nil
var avAudioUnit: AVAudioUnit? = nil

AVAudioUnit.instantiate(with: componentDesc, options: [.loadOutOfProcess]) { unit, error in
    if let error = error {
        // Try in-process as fallback
        AVAudioUnit.instantiate(with: componentDesc, options: [.loadInProcess]) { unit2, error2 in
            avAudioUnit = unit2
            instantiationError = error2
            semaphore.signal()
        }
    } else {
        avAudioUnit = unit
        semaphore.signal()
    }
}
semaphore.wait()

if let err = instantiationError {
    removeStaged(stagedPath)
    fail("Failed to instantiate AU component: \(err.localizedDescription)")
}

guard let auUnit = avAudioUnit else {
    removeStaged(stagedPath)
    fail("AU component instantiation returned nil")
}

engine.attach(auUnit)

do {
    try renderPlugin(
        engine: engine,
        avUnit: auUnit,
        isInstrument: isInstrument,
        note: args.note,
        duration: args.duration,
        outputPath: args.outputPath
    )
} catch {
    removeStaged(stagedPath)
    fail("Render failed: \(error.localizedDescription)")
}

removeStaged(stagedPath)
exit(0)
