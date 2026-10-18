// Encodes timestamped screenshots captured continuously during real UI interaction.
// Repeats only the latest observed frame at its manifest time. Optional explicit
// timing edits cap gaps/add holds; no invented pointer or UI animation is added.
import AVFoundation
import CoreVideo
import Foundation
import ImageIO

struct CaptureFrame: Decodable {
    let path: String
    let timestampMs: Double
    let sourceTimestampMs: Double?
}
struct CaptureEdit: Codable {
    let sourceManifest: String
    let sourceDurationMs: Double
    let gapCapMs: Double
    let closingHoldMs: Double
    let addedNarrationHoldMs: Double
    let trimmedGapCount: Int
    let timingDisclosure: String
    let sceneTimingDisclosure: String
}
struct CaptureManifest: Decodable {
    let frames: [CaptureFrame]
    let durationMs: Double
    let width: Int?
    let height: Int?
    let captureEdit: CaptureEdit?
}
struct CaptureReport: Encodable {
    let manifest: String
    let output: String
    let captureMethod: String
    let audioDisclosure: String
    let sourceFrameCount: Int
    let uniqueTimestampCount: Int
    let sourceCaptureDurationSeconds: Double
    let editedOutputDurationSeconds: Double
    let captureEdit: CaptureEdit?
    let firstObservedFrameSeconds: Double
    let outputFrameCount: Int
    let outputFramesPerSecond: Int
    let outputWidth: Int
    let outputHeight: Int
    let averageObservedFramesPerSecond: Double
    let medianCaptureIntervalSeconds: Double
    let longestCaptureGapSeconds: Double
    let playbackSpeedWithinRetainedIntervals: Double
    let notes: [String]
}
enum CaptureError: Error, CustomStringConvertible {
    case message(String)
    var description: String { if case .message(let value) = self { return value }; return "Capture encoding failed" }
}

func screenshot(_ path: String) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw CaptureError.message("Unreadable actual capture frame: \(path)")
    }
    return image
}

func buffer(image: CGImage?, width: Int, height: Int) throws -> CVPixelBuffer {
    var result: CVPixelBuffer?
    let attributes: [CFString: Any] = [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true]
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attributes as CFDictionary, &result) == kCVReturnSuccess,
          let result else { throw CaptureError.message("Cannot allocate video pixel buffer") }
    CVPixelBufferLockBaseAddress(result, [])
    defer { CVPixelBufferUnlockBaseAddress(result, []) }
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(result), width: width, height: height, bitsPerComponent: 8,
                                  bytesPerRow: CVPixelBufferGetBytesPerRow(result), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else {
        throw CaptureError.message("Cannot create video drawing context")
    }
    context.setFillColor(CGColor(gray: 0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    if let image {
        let ratio = min(Double(width) / Double(image.width), Double(height) / Double(image.height))
        let w = Double(image.width) * ratio, h = Double(image.height) * ratio
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: (Double(width) - w) / 2, y: (Double(height) - h) / 2, width: w, height: h))
    }
    return result
}

func main() throws {
    let args = Array(CommandLine.arguments.dropFirst())
    guard args.count == 4, args[0] == "--manifest", args[2] == "--output" else {
        throw CaptureError.message("Usage: assemble-live-capture.sh --manifest artifacts/live-capture/manifest.json --output submission/LIVE_WALKTHROUGH.mp4")
    }
    let manifestURL = URL(fileURLWithPath: args[1]).standardizedFileURL
    let output = URL(fileURLWithPath: args[3]).standardizedFileURL
    let fm = FileManager.default
    guard output.pathExtension.lowercased() == "mp4", !fm.fileExists(atPath: output.path) else {
        throw CaptureError.message("Choose a NEW .mp4 output. Existing files are never overwritten.")
    }
    let manifest = try JSONDecoder().decode(CaptureManifest.self, from: Data(contentsOf: manifestURL))
    guard manifest.durationMs.isFinite, manifest.durationMs > 0, !manifest.frames.isEmpty else { throw CaptureError.message("Manifest must have frames and the actual positive capture durationMs") }
    for frame in manifest.frames {
        guard frame.timestampMs.isFinite, frame.timestampMs >= 0, frame.timestampMs <= manifest.durationMs,
              frame.path.hasPrefix("/"), fm.fileExists(atPath: frame.path) else {
            throw CaptureError.message("Invalid timestamp or missing absolute frame path: \(frame.path)")
        }
    }
    // Stable chronological order; if two observations share a timestamp, the later
    // manifest entry is the last known observation for that exact instant.
    let frames = manifest.frames.enumerated().sorted { a,b in
        a.element.timestampMs == b.element.timestampMs ? a.offset < b.offset : a.element.timestampMs < b.element.timestampMs
    }.map(\.element)
    let firstImage = try screenshot(frames[0].path)
    let sourceWidth = manifest.width ?? firstImage.width, sourceHeight = manifest.height ?? firstImage.height
    guard (128...4096).contains(sourceWidth), (128...4096).contains(sourceHeight) else { throw CaptureError.message("Canvas dimensions must be 128–4096 pixels; specify width/height in manifest if needed") }
    let width = sourceWidth + sourceWidth % 2, height = sourceHeight + sourceHeight % 2
    let fps = 24
    let frameCount = Int(ceil(manifest.durationMs / 1000 * Double(fps)))
    try fm.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
    let temporary = output.deletingLastPathComponent().appendingPathComponent(".live-capture-\(UUID().uuidString).mp4")
    defer { try? fm.removeItem(at: temporary) }
    let writer = try AVAssetWriter(outputURL: temporary, fileType: .mp4)
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]
    ])
    videoInput.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height
    ])
    guard writer.canAdd(videoInput) else { throw CaptureError.message("H.264 output unavailable") }
    writer.add(videoInput)
    writer.shouldOptimizeForNetworkUse = true
    guard writer.startWriting() else { throw writer.error ?? CaptureError.message("Cannot start video encoding") }
    writer.startSession(atSourceTime: .zero)
    var observedIndex = -1
    var currentBuffer = try buffer(image: nil, width: width, height: height)
    for outputIndex in 0..<frameCount {
        while !videoInput.isReadyForMoreMediaData {
            if writer.status == .failed { throw writer.error ?? CaptureError.message("Video encoder failed") }
            Thread.sleep(forTimeInterval: 0.002)
        }
        let timeMs = Double(outputIndex) / Double(fps) * 1000
        var nextObserved = observedIndex
        while nextObserved + 1 < frames.count, frames[nextObserved + 1].timestampMs <= timeMs { nextObserved += 1 }
        if nextObserved != observedIndex {
            observedIndex = nextObserved
            currentBuffer = try autoreleasepool { try buffer(image: screenshot(frames[observedIndex].path), width: width, height: height) }
        }
        guard adaptor.append(currentBuffer, withPresentationTime: CMTime(value: Int64(outputIndex), timescale: Int32(fps))) else {
            throw writer.error ?? CaptureError.message("Could not append actual capture frame")
        }
        if outputIndex % (fps * 30) == 0 { print("Encoded \(outputIndex / fps)s / \(Int(ceil(manifest.durationMs / 1000)))s") }
    }
    videoInput.markAsFinished()
    writer.endSession(atSourceTime: CMTime(seconds: manifest.durationMs / 1000, preferredTimescale: 60000))
    let finished = DispatchSemaphore(value: 0)
    writer.finishWriting { finished.signal() }
    finished.wait()
    guard writer.status == .completed else { throw writer.error ?? CaptureError.message("Video encoding incomplete") }
    try fm.moveItem(at: temporary, to: output)
    let gaps = zip(frames.dropFirst(), frames).map { (($0.sourceTimestampMs ?? $0.timestampMs) - ($1.sourceTimestampMs ?? $1.timestampMs)) / 1000 }.sorted()
    let sourceDuration = (manifest.captureEdit?.sourceDurationMs ?? manifest.durationMs) / 1000
    let report = CaptureReport(manifest: manifestURL.path, output: output.path,
                               captureMethod: "Actual browser UI screenshots sampled during live interaction, assembled in their observed order. Timing edits, if any, are disclosed in captureEdit and the manifest.",
                               audioDisclosure: "Silent sampled browser capture. No audio track or narration is present.",
                               sourceFrameCount: frames.count, uniqueTimestampCount: Set(frames.map(\.timestampMs)).count,
                               sourceCaptureDurationSeconds: sourceDuration, editedOutputDurationSeconds: manifest.durationMs / 1000,
                               captureEdit: manifest.captureEdit, firstObservedFrameSeconds: (frames[0].sourceTimestampMs ?? frames[0].timestampMs) / 1000,
                               outputFrameCount: frameCount, outputFramesPerSecond: fps, outputWidth: width, outputHeight: height,
                               averageObservedFramesPerSecond: Double(frames.count) / sourceDuration,
                               medianCaptureIntervalSeconds: gaps.isEmpty ? 0 : gaps[gaps.count / 2], longestCaptureGapSeconds: gaps.last ?? 0,
                               playbackSpeedWithinRetainedIntervals: 1,
                               notes: ["Latest observed frame is held until the next real capture; 24fps is the encoded frame rate, not the capture sampling rate.",
                                       manifest.captureEdit?.timingDisclosure ?? "Source timestamps and playback speed are preserved. No synthetic cursor, actions, transitions, or animation are added.",
                                       "When timing is edited, each frame retains sourceTimestampMs in the edited manifest. Source gap statistics describe the original capture, not the edited playback.",
                                       "Black appears before the first actual observation if its timestamp is greater than zero. Differently sized frames are letterboxed, never cropped."])
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    let json = try encoder.encode(report)
    // Capture reports include local source paths: keep them beside the manifest,
    // normally in ignored artifacts/, instead of the shareable submission/ folder.
    let reportURL = manifestURL.deletingLastPathComponent().appendingPathComponent(output.deletingPathExtension().lastPathComponent + ".capture.json")
    guard !fm.fileExists(atPath: reportURL.path) else { throw CaptureError.message("Video saved, but report path already exists: \(reportURL.path)") }
    try json.write(to: reportURL, options: .atomic)
    print(String(decoding: json, as: UTF8.self))
}

do { try main() }
catch { FileHandle.standardError.write(Data("Live capture encoding failed: \(error)\n".utf8)); exit(1) }
