// Read video metadata and extract two actual frames for visual QA.
// xcrun swift scripts/verify-walkthrough.swift submission/WALKTHROUGH.mp4 artifacts
import AVFoundation
import ImageIO
import Foundation

func verify() async throws {
guard CommandLine.arguments.count == 3 else {
    print("Usage: verify-walkthrough.swift VIDEO.mp4 OUTPUT_DIRECTORY")
    exit(1)
}
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let destination = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: source)
let duration = try await asset.load(.duration)
let tracks = try await asset.loadTracks(withMediaType: .video)
guard let track = tracks.first else { throw NSError(domain: "VideoQA", code: 1, userInfo: [NSLocalizedDescriptionKey: "No video track"]) }
let size = try await track.load(.naturalSize)
let rate = try await track.load(.nominalFrameRate)
print("Duration: \(duration.seconds)s; size: \(Int(size.width))×\(Int(size.height)); frame rate: \(rate)fps; tracks: \(tracks.count)")
guard abs(duration.seconds - 100) < 0.1, size.width == 1600, size.height == 1000 else {
    throw NSError(domain: "VideoQA", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unexpected duration or frame size"])
}
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
for (seconds, name) in [(1.0, "day5-video-overview.png"), (81.0, "day5-video-filing.png")] {
    let frame = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
    let target = destination.appendingPathComponent(name)
    guard let writer = CGImageDestinationCreateWithURL(target as CFURL, "public.png" as CFString, 1, nil) else { throw NSError(domain: "VideoQA", code: 3) }
    CGImageDestinationAddImage(writer, frame.image, nil)
    guard CGImageDestinationFinalize(writer) else { throw NSError(domain: "VideoQA", code: 4) }
    print("Frame saved: \(target.path)")
}
}

do { try await verify() }
catch { FileHandle.standardError.write(Data("Video verification failed: \(error)\n".utf8)); exit(1) }
