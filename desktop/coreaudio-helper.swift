import CoreAudio
import Foundation

struct OutputDevice: Codable {
    let deviceId: String
    let label: String
    let selected: Bool
}

enum HelperError: Error, CustomStringConvertible {
    case audio(OSStatus, String)
    case invalidArguments
    case deviceNotFound

    var description: String {
        switch self {
        case let .audio(status, operation): return "\(operation) failed with CoreAudio status \(status)"
        case .invalidArguments: return "Usage: coreaudio-helper list | set <device-uid>"
        case .deviceNotFound: return "The requested CoreAudio output device was not found"
        }
    }
}

func check(_ status: OSStatus, _ operation: String) throws {
    if status != noErr { throw HelperError.audio(status, operation) }
}

func deviceIds() throws -> [AudioDeviceID] {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    try check(AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size), "Read device-list size")
    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var devices = Array(repeating: AudioDeviceID(0), count: count)
    try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &devices), "Read device list")
    return devices
}

func stringProperty(_ device: AudioDeviceID, _ selector: AudioObjectPropertySelector) throws -> String {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var value: CFString = "" as CFString
    var size = UInt32(MemoryLayout<CFString>.size)
    try check(AudioObjectGetPropertyData(device, &address, 0, nil, &size, &value), "Read device property")
    return value as String
}

func hasOutput(_ device: AudioDeviceID) -> Bool {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyStreams,
        mScope: kAudioDevicePropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    return AudioObjectGetPropertyDataSize(device, &address, 0, nil, &size) == noErr && size > 0
}

func defaultOutputDevice() throws -> AudioDeviceID {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var device = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    try check(AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device), "Read default output")
    return device
}

func setDefaultOutput(_ device: AudioDeviceID) throws {
    for selector in [kAudioHardwarePropertyDefaultOutputDevice, kAudioHardwarePropertyDefaultSystemOutputDevice] {
        var address = AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var mutableDevice = device
        let size = UInt32(MemoryLayout<AudioDeviceID>.size)
        try check(AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, size, &mutableDevice), "Set default output")
    }
}

func listOutputs() throws -> [OutputDevice] {
    let selected = try defaultOutputDevice()
    return try deviceIds().filter(hasOutput).map { device in
        OutputDevice(
            deviceId: try stringProperty(device, kAudioDevicePropertyDeviceUID),
            label: try stringProperty(device, kAudioObjectPropertyName),
            selected: device == selected
        )
    }.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
}

func run() throws {
    let arguments = CommandLine.arguments.dropFirst()
    guard let command = arguments.first else { throw HelperError.invalidArguments }
    if command == "list" {
        let data = try JSONEncoder().encode(listOutputs())
        FileHandle.standardOutput.write(data)
        return
    }
    if command == "set", arguments.count == 2 {
        let requestedUid = String(arguments.last!)
        for device in try deviceIds() where hasOutput(device) {
            if try stringProperty(device, kAudioDevicePropertyDeviceUID) == requestedUid {
                try setDefaultOutput(device)
                let data = try JSONEncoder().encode(listOutputs())
                FileHandle.standardOutput.write(data)
                return
            }
        }
        throw HelperError.deviceNotFound
    }
    throw HelperError.invalidArguments
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
