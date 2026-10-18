// Packages an actual screen recording; never synthesizes UI movement or narration.
// Use package-live-recording.sh. macOS system frameworks only, no installations.
import AVFoundation
import Foundation
import ImageIO

enum RecordingError: Error, CustomStringConvertible {
    case message(String)
    var description: String { if case .message(let value) = self { return value }; return "Recording error" }
}

struct Options {
    let input: URL
    let output: URL?
    let qaDirectory: URL?
    let ranges: String?
}

func options() throws -> Options {
    let arguments = Array(CommandLine.arguments.dropFirst())
    var values: [String: String] = [:]
    let allowed = ["--input", "--output", "--qa-dir", "--keep-ranges"]
    guard arguments.count % 2 == 0 else { throw RecordingError.message("Arguments must be flag/value pairs") }
    for i in stride(from: 0, to: arguments.count, by: 2) {
        guard allowed.contains(arguments[i]), values[arguments[i]] == nil else { throw RecordingError.message("Unknown or repeated option: \(arguments[i])") }
        values[arguments[i]] = arguments[i + 1]
    }
    guard let input = values["--input"] else {
        throw RecordingError.message("Usage: package-live-recording.sh --input RAW.mov [--output LIVE_WALKTHROUGH.mp4] [--keep-ranges 2:45,52:106] [--qa-dir artifacts/live-video-qa]. Omitting --output only inspects the input.")
    }
    return Options(input: URL(fileURLWithPath: input).standardizedFileURL,
                   output: values["--output"].map { URL(fileURLWithPath: $0).standardizedFileURL },
                   qaDirectory: values["--qa-dir"].map { URL(fileURLWithPath: $0).standardizedFileURL },
                   ranges: values["--keep-ranges"])
}

func keepRanges(_ specification: String?, duration: Double) throws -> [CMTimeRange] {
    guard duration.isFinite, duration > 0 else { throw RecordingError.message("Input has no finite positive duration") }
    guard let specification else { return [CMTimeRange(start: .zero, end: CMTime(seconds: duration, preferredTimescale: 600))] }
    var previousEnd = 0.0
    return try specification.split(separator: ",", omittingEmptySubsequences: false).map { range in
        let pair = range.split(separator: ":", omittingEmptySubsequences: false)
        guard pair.count == 2, let start = Double(pair[0]), let end = Double(pair[1]),
              start.isFinite, end.isFinite, start >= previousEnd, end > start, end <= duration + 0.001 else {
            throw RecordingError.message("Invalid keep range '\(range)'. Use ordered, nonoverlapping START_SECONDS:END_SECONDS within the source duration.")
        }
        previousEnd = end
        return CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600), end: CMTime(seconds: min(end, duration), preferredTimescale: 600))
    }
}

struct TrackReport: Codable {
    let width: Int
    let height: Int
    let nominalFramesPerSecond: Float
    let estimatedBitsPerSecond: Float
}
struct RecordingReport: Codable {
    let file: String
    let durationSeconds: Double
    let byteCount: Int64
    let videoTracks: [TrackReport]
    let audioTrackCount: Int
    let audioDisclosure: String
    let retainedSourceRanges: [[Double]]?
    let expectedOutputDurationSeconds: Double?
    let decodedFrames: [String]
    let notes: [String]
}

func inspect(_ url: URL, qaDirectory: URL?, retained: [CMTimeRange]?) async throws -> RecordingReport {
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration).seconds
    let videos = try await asset.loadTracks(withMediaType: .video)
    let audios = try await asset.loadTracks(withMediaType: .audio)
    guard !videos.isEmpty, duration > 0 else { throw RecordingError.message("No playable video track") }
    var reports: [TrackReport] = []
    for video in videos {
        let size = try await video.load(.naturalSize)
        let transform = try await video.load(.preferredTransform)
        let displayed = CGRect(origin: .zero, size: size).applying(transform)
        let fps = try await video.load(.nominalFrameRate)
        let bitrate = try await video.load(.estimatedDataRate)
        reports.append(TrackReport(width: Int(abs(displayed.width)), height: Int(abs(displayed.height)), nominalFramesPerSecond: fps, estimatedBitsPerSecond: bitrate))
    }
    var frames: [String] = []
    if let qaDirectory {
        let fm = FileManager.default
        try fm.createDirectory(at: qaDirectory, withIntermediateDirectories: true)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.15, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.15, preferredTimescale: 600)
        // Actual decoded frames at five separated points for readability/privacy review.
        for (index, fraction) in [0.02, 0.25, 0.50, 0.75, 0.98].enumerated() {
            let seconds = min(max(0, duration * fraction), max(0, duration - 0.1))
            let target = qaDirectory.appendingPathComponent(String(format: "frame-%02d-%06.1fs.png", index + 1, seconds))
            guard !fm.fileExists(atPath: target.path) else { throw RecordingError.message("QA frame already exists; select a fresh QA directory: \(target.path)") }
            let frame = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
            guard let writer = CGImageDestinationCreateWithURL(target as CFURL, "public.png" as CFString, 1, nil) else { throw RecordingError.message("Cannot create preview image") }
            CGImageDestinationAddImage(writer, frame.image, nil)
            guard CGImageDestinationFinalize(writer) else { throw RecordingError.message("Cannot save preview image") }
            frames.append(target.path)
        }
    }
    let bytes = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
    return RecordingReport(file: url.path, durationSeconds: duration, byteCount: bytes?.int64Value ?? 0, videoTracks: reports,
                           audioTrackCount: audios.count,
                           audioDisclosure: audios.isEmpty ? "No audio track: silent recording; no narration is included." : "Audio track present. Listen to confirm speech, audibility and privacy; track presence alone does not prove narration.",
                           retainedSourceRanges: retained?.map { [$0.start.seconds, $0.end.seconds] },
                           expectedOutputDurationSeconds: retained?.reduce(0) { $0 + $1.duration.seconds },
                           decodedFrames: frames,
                           notes: ["Frames are decoded from the supplied recording, not reconstructed screenshots.", "Inspect the decoded frames for readable text and unintended private content.", "Explicit cuts preserve source order and audio/video alignment; no pointer movement or actions are fabricated."])
}

func package(_ options: Options) async throws {
    let fm = FileManager.default
    guard fm.fileExists(atPath: options.input.path) else { throw RecordingError.message("Input recording does not exist: \(options.input.path)") }
    let asset = AVURLAsset(url: options.input)
    let duration = try await asset.load(.duration).seconds
    let ranges = try keepRanges(options.ranges, duration: duration)
    var inspectedURL = options.input
    if let output = options.output {
        guard output.pathExtension.lowercased() == "mp4", output != options.input, !fm.fileExists(atPath: output.path) else {
            throw RecordingError.message("Output must be a new .mp4 file, distinct from the original. Existing files are never overwritten.")
        }
        let composition = AVMutableComposition()
        let tracks = try await asset.loadTracks(withMediaType: .video) + asset.loadTracks(withMediaType: .audio)
        guard tracks.contains(where: { $0.mediaType == .video }) else { throw RecordingError.message("Input contains no video") }
        for sourceTrack in tracks {
            guard let target = composition.addMutableTrack(withMediaType: sourceTrack.mediaType, preferredTrackID: kCMPersistentTrackID_Invalid) else { throw RecordingError.message("Cannot preserve source media track") }
            target.preferredTransform = try await sourceTrack.load(.preferredTransform)
            let trackRange = try await sourceTrack.load(.timeRange)
            var destinationTime = CMTime.zero
            for range in ranges {
                let intersection = CMTimeRangeGetIntersection(trackRange, otherRange: range)
                if intersection.isValid, intersection.duration.seconds > 0 {
                    let destination = CMTimeAdd(destinationTime, CMTimeSubtract(intersection.start, range.start))
                    try target.insertTimeRange(intersection, of: sourceTrack, at: destination)
                }
                destinationTime = CMTimeAdd(destinationTime, range.duration)
            }
        }
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { throw RecordingError.message("Cannot create the local video exporter") }
        try fm.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
        let temporary = output.deletingLastPathComponent().appendingPathComponent(".live-recording-\(UUID().uuidString).mp4")
        defer { try? fm.removeItem(at: temporary) }
        exporter.shouldOptimizeForNetworkUse = true
        try await exporter.export(to: temporary, as: .mp4)
        let producedDuration = try await AVURLAsset(url: temporary).load(.duration).seconds
        let expectedDuration = ranges.reduce(0) { $0 + $1.duration.seconds }
        guard abs(producedDuration - expectedDuration) < 0.25 else { throw RecordingError.message("Exported duration differs from retained source ranges") }
        try fm.moveItem(at: temporary, to: output)
        inspectedURL = output
    } else if options.ranges != nil {
        throw RecordingError.message("--keep-ranges requires --output; inspect-only mode never changes the source")
    }
    let report = try await inspect(inspectedURL, qaDirectory: options.qaDirectory, retained: options.output == nil ? nil : ranges)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    let json = try encoder.encode(report)
    if let directory = options.qaDirectory {
        let target = directory.appendingPathComponent("recording-report.json")
        guard !fm.fileExists(atPath: target.path) else { throw RecordingError.message("QA report already exists") }
        try json.write(to: target, options: .atomic)
    }
    print(String(decoding: json, as: UTF8.self))
}

do { try await package(options()) }
catch { FileHandle.standardError.write(Data("Recording packaging failed: \(error)\n".utf8)); exit(1) }
