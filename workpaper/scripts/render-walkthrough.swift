// Reproducible captioned tour of real prototype screenshots. No third-party dependencies.
// Run through ./scripts/render-walkthrough.sh from any working directory on macOS.
import AppKit
import AVFoundation
import CoreVideo
import ImageIO

struct Slide {
    let filename: String
    let title: String
    let caption: String
}

let slides = [
    Slide(filename: "day5-overview.jpg", title: "01  Start with the return overview",
          caption: "The overview summarizes the supplied federal and California return. Follow a claim to inspect its support. The working context defaults to v3 as of June 23, 2026; totals remain supplied engine outputs, not a fully recomputed return."),
    Slide(filename: "day5-evidence.jpg", title: "02  Follow the evidence to the printed source",
          caption: "Trace capital gains to N1. The broker statement leaves basis unreported; D11 supports $19,100 of adjusted basis. A supported working correction changes N1 gain from $19,240 to $140 while preserving the engine original and evidence references."),
    Slide(filename: "day5-findings.jpg", title: "03  Inspect independent checks",
          caption: "The findings inbox derives the EIN mismatch, omitted supplemental basis, duplicate interest, and missing M18 from packet evidence. Brightpath's 260-lot reconciliation is a passing control. Broader tax checks remain an explicit backlog."),
    Slide(filename: "day5-replay.jpg", title: "04  Explore history without changing the draft",
          caption: "Replay reveals documents and messages only when available at the selected milestone. Version comparison derives 63 and 89 changed line values. The five supplied what-ifs stay tied to original v3 and never silently combine with working adjustments."),
    Slide(filename: "day5-filing.jpg", title: "05  Preserve decisions and frozen records",
          caption: "The N1 demonstration requires supported verification and exact-package reviewer, partner, and client approvals. Simulated attempts freeze history; successor and amendment branches preserve the original. Full-return readiness and public deployment remain outstanding.")
]

enum TourError: Error, CustomStringConvertible {
    case message(String)
    var description: String { if case .message(let s) = self { return s }; return "Video creation failed" }
}

func arguments() throws -> (URL, URL, Int, Int) {
    let args = Array(CommandLine.arguments.dropFirst())
    var input: String?, output: String?
    var seconds = 20, fps = 24
    var i = 0
    while i < args.count {
        guard i + 1 < args.count else { throw TourError.message("Missing value for \(args[i])") }
        let value = args[i + 1]
        switch args[i] {
        case "--input": input = value
        case "--output": output = value
        case "--seconds-per-slide": seconds = Int(value) ?? 0
        case "--fps": fps = Int(value) ?? 0
        default: throw TourError.message("Unknown argument: \(args[i])")
        }
        i += 2
    }
    guard let input, let output, (10...60).contains(seconds), (1...30).contains(fps) else {
        throw TourError.message("Usage: render-walkthrough --input DIR --output FILE.mp4 [--seconds-per-slide 20] [--fps 24]")
    }
    return (URL(fileURLWithPath: input), URL(fileURLWithPath: output), seconds, fps)
}

let width = 1600, height = 1000
let ink = NSColor(calibratedRed: 0.10, green: 0.17, blue: 0.17, alpha: 1)
let accent = NSColor(calibratedRed: 0.10, green: 0.36, blue: 0.30, alpha: 1)
let muted = NSColor(calibratedRed: 0.36, green: 0.41, blue: 0.40, alpha: 1)

func text(_ string: String, in rect: CGRect, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = ink) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineSpacing = 4
    (string as NSString).draw(in: rect, withAttributes: [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraph
    ])
}

func image(_ url: URL) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw TourError.message("Cannot read screenshot: \(url.path)")
    }
    return image
}

func makeFrame(slide: Slide, screenshot: CGImage, index: Int, progress: Double) throws -> CVPixelBuffer {
    var optionalBuffer: CVPixelBuffer?
    let attrs: [CFString: Any] = [kCVPixelBufferCGImageCompatibilityKey: true, kCVPixelBufferCGBitmapContextCompatibilityKey: true]
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &optionalBuffer) == kCVReturnSuccess,
          let buffer = optionalBuffer else { throw TourError.message("Cannot allocate a video frame") }
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else {
        throw TourError.message("Cannot draw a video frame")
    }
    context.setFillColor(NSColor(calibratedRed: 0.96, green: 0.96, blue: 0.93, alpha: 1).cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
    defer { NSGraphicsContext.restoreGraphicsState() }

    text("MIRAFLORES WORKPAPER", in: CGRect(x: 40, y: 951, width: 650, height: 25), size: 17, weight: .semibold, color: accent)
    text("Captioned screenshot tour · local prototype", in: CGRect(x: 985, y: 951, width: 575, height: 25), size: 17, color: muted)
    text(slide.title, in: CGRect(x: 40, y: 900, width: 1520, height: 46), size: 32, weight: .semibold)

    // The in-app browser may have a narrow viewport. Preserve its readable scale
    // by placing the caption alongside portrait captures instead of shrinking them.
    let portraitCapture = CGFloat(screenshot.width) / CGFloat(screenshot.height) < 1.2
    let frame = portraitCapture
        ? CGRect(x: 40, y: 80, width: 740, height: 800)
        : CGRect(x: 40, y: 228, width: 1520, height: 650)
    context.setFillColor(NSColor.white.cgColor)
    context.fill(frame)
    let scale = min(frame.width / CGFloat(screenshot.width), frame.height / CGFloat(screenshot.height))
    let rendered = CGSize(width: CGFloat(screenshot.width) * scale, height: CGFloat(screenshot.height) * scale)
    let imageRect = CGRect(x: frame.midX - rendered.width / 2, y: frame.midY - rendered.height / 2, width: rendered.width, height: rendered.height)
    context.interpolationQuality = .high
    context.draw(screenshot, in: imageRect)
    context.setStrokeColor(NSColor(calibratedWhite: 0.80, alpha: 1).cgColor)
    context.setLineWidth(1)
    context.stroke(frame)

    if portraitCapture {
        text("WHAT TO NOTICE", in: CGRect(x: 830, y: 825, width: 730, height: 30), size: 18, weight: .semibold, color: accent)
        text(slide.caption, in: CGRect(x: 830, y: 160, width: 730, height: 630), size: 30)
    } else {
        text(slide.caption, in: CGRect(x: 40, y: 75, width: 1520, height: 126), size: 26)
    }
    text("Static UI captures; no live interaction or real filing is shown.", in: CGRect(x: 40, y: 28, width: 1300, height: 28), size: 18, color: muted)
    text("\(index + 1) / \(slides.count)", in: CGRect(x: 1450, y: 28, width: 110, height: 28), size: 18, weight: .medium, color: muted)
    context.setFillColor(accent.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: CGFloat(width) * progress, height: 8))
    return buffer
}

func render() throws {
    let (inputDirectory, output, secondsPerSlide, fps) = try arguments()
    let images = try slides.map { try image(inputDirectory.appendingPathComponent($0.filename)) }
    let fm = FileManager.default
    try fm.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
    // Write a temporary sibling and replace only after successful encoding.
    let temporary = output.deletingLastPathComponent().appendingPathComponent(".walkthrough-\(UUID().uuidString).mp4")
    defer { try? fm.removeItem(at: temporary) }
    let writer = try AVAssetWriter(outputURL: temporary, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width, AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]
    ]
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    videoInput.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height
    ])
    guard writer.canAdd(videoInput) else { throw TourError.message("H.264 output unavailable") }
    writer.add(videoInput)
    writer.shouldOptimizeForNetworkUse = true
    guard writer.startWriting() else { throw writer.error ?? TourError.message("Cannot start video writer") }
    writer.startSession(atSourceTime: .zero)
    let framesPerSlide = secondsPerSlide * fps
    let totalFrames = slides.count * framesPerSlide
    var cachedFrame: CVPixelBuffer?
    for frameNumber in 0..<totalFrames {
        while !videoInput.isReadyForMoreMediaData {
            if writer.status == .failed { throw writer.error ?? TourError.message("Encoding failed") }
            Thread.sleep(forTimeInterval: 0.002)
        }
        let index = frameNumber / framesPerSlide
        // Reuse the immutable slide frame. This is deliberately a static screenshot tour.
        if frameNumber % framesPerSlide == 0 {
            cachedFrame = try makeFrame(slide: slides[index], screenshot: images[index], index: index, progress: Double(index + 1) / Double(slides.count))
            print("Rendered section \(index + 1)/\(slides.count): \(slides[index].title)")
        }
        let success = adaptor.append(cachedFrame!, withPresentationTime: CMTime(value: Int64(frameNumber), timescale: Int32(fps)))
        guard success else { throw writer.error ?? TourError.message("Could not append frame \(frameNumber)") }
    }
    videoInput.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: Int64(totalFrames), timescale: Int32(fps)))
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else { throw writer.error ?? TourError.message("Encoding did not complete") }
    if fm.fileExists(atPath: output.path) { _ = try fm.replaceItemAt(output, withItemAt: temporary) }
    else { try fm.moveItem(at: temporary, to: output) }
    print("Saved \(output.path) (\(slides.count * secondsPerSlide)s, \(width)×\(height), \(fps)fps, H.264, captioned static screenshots)")
}

do { try render() }
catch { FileHandle.standardError.write(Data("\(error)\n".utf8)); exit(1) }
