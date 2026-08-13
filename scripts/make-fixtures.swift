// Generate real barcode images for testing the decode pipeline.
//
//   swift scripts/make-fixtures.swift test-fixtures
//
// Uses CoreImage generators, so the output is genuine scannable symbology
// rather than a decorative pattern.

import CoreImage
import AppKit
import Foundation

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "test-fixtures"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let GS = "\u{1d}"

/// (filename, payload, description)
let cases: [(String, String, String)] = [
    ("gs1-qr-basic", "010345312000001117271125", "GTIN + expiry"),
    ("gs1-qr-lot", "01034531200000111727112510ABCD1234", "GTIN + expiry + lot"),
    ("gs1-qr-fnc1-lot", "010345312000001110AB17CD\(GS)17271125", "lot containing '17' — needs FNC1"),
    ("gs1-qr-numeric-lot", "0103453120000011\(GS)100114\(GS)17271125", "numeric lot '0114'"),
    ("gs1-qr-serial", "0103453120000011\(GS)2112345678\(GS)10LOT9\(GS)17271125", "with serial"),
    ("gs1-qr-parens", "(01)03453120000011(17)271125(10)ABCD1234", "human-readable form"),
    ("ean13", "5012345678900", "plain EAN-13 payload"),
    ("hibc-qr", "+A99912345/$$3271125LOT42A", "HIBC IVDR/UDI"),
]

func writePNG(_ image: CIImage, to path: String) {
    let scaled = image.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
    let rep = NSCIImageRep(ciImage: scaled)
    let img = NSImage(size: rep.size)
    img.addRepresentation(rep)
    guard let tiff = img.tiffRepresentation,
          let bmp = NSBitmapImageRep(data: tiff),
          let png = bmp.representation(using: .png, properties: [:]) else {
        print("  ! failed to encode \(path)")
        return
    }
    try? png.write(to: URL(fileURLWithPath: path))
}

for (name, payload, note) in cases {
    guard let filter = CIFilter(name: "CIQRCodeGenerator") else { continue }
    // ISO-8859-1 preserves the FNC1 (0x1d) byte, which UTF-8 would re-encode.
    filter.setValue(payload.data(using: .isoLatin1), forKey: "inputMessage")
    filter.setValue("H", forKey: "inputCorrectionLevel")

    guard let out = filter.outputImage else {
        print("  ! generator failed for \(name)")
        continue
    }
    writePNG(out, to: "\(outDir)/\(name).png")
    print("  \(name).png — \(note)")
}

// A Code 128 for linear-symbology coverage.
if let f = CIFilter(name: "CICode128BarcodeGenerator") {
    f.setValue("5012345678900".data(using: .ascii), forKey: "inputMessage")
    if let out = f.outputImage {
        writePNG(out, to: "\(outDir)/code128-ean.png")
        print("  code128-ean.png — Code 128 linear")
    }
}

print("\nWrote fixtures to \(outDir)/")
