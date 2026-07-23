import AVFoundation
import Foundation

final class PlaybackHost {
    private let player = AVPlayer()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var requestedVolume: Float = 0.86
    private var muted = false
    private var lastError = ""

    init() {
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self] _ in
            self?.publishState()
        }
        publish(["type": "ready"])
        publishState()
    }

    deinit {
        if let observer = timeObserver { player.removeTimeObserver(observer) }
        if let observer = endObserver { NotificationCenter.default.removeObserver(observer) }
    }

    func handle(_ command: [String: Any]) {
        guard let type = command["type"] as? String else { return }
        switch type {
        case "load":
            load(command)
        case "play":
            lastError = ""
            player.play()
            publishState()
        case "pause":
            player.pause()
            publishState()
        case "seek":
            seek(seconds: number(command["position"]))
        case "volume":
            requestedVolume = Float(min(max(number(command["volume"]), 0), 1))
            applyVolume()
            publishState()
        case "mute":
            muted = command["muted"] as? Bool ?? false
            applyVolume()
            publishState()
        case "stop":
            player.pause()
            player.replaceCurrentItem(with: nil)
            lastError = ""
            publishState()
        case "shutdown":
            player.pause()
            exit(0)
        default:
            break
        }
    }

    private func load(_ command: [String: Any]) {
        guard
            let rawUrl = command["url"] as? String,
            let url = URL(string: rawUrl),
            ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "")
        else {
            lastError = "The native renderer rejected the stream URL"
            publishState()
            return
        }

        if let observer = endObserver {
            NotificationCenter.default.removeObserver(observer)
            endObserver = nil
        }

        requestedVolume = Float(min(max(number(command["volume"], fallback: 0.86), 0), 1))
        muted = command["muted"] as? Bool ?? false
        lastError = ""
        let item = AVPlayerItem(url: url)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { _ in
            publish(["type": "ended"])
        }
        player.replaceCurrentItem(with: item)
        applyVolume()
        let position = max(0, number(command["position"]))
        let autoplay = command["autoplay"] as? Bool ?? true
        if position > 0 {
            player.seek(
                to: CMTime(seconds: position, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            ) { [weak self] _ in
                if autoplay { self?.player.play() }
                self?.publishState()
            }
        } else {
            if autoplay { player.play() }
            publishState()
        }
    }

    private func seek(seconds: Double) {
        let duration = finiteSeconds(player.currentItem?.duration)
        let target = duration > 0 ? min(max(seconds, 0), duration) : max(seconds, 0)
        player.seek(
            to: CMTime(seconds: target, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        ) { [weak self] _ in self?.publishState() }
    }

    private func applyVolume() {
        player.volume = muted ? 0 : requestedVolume
    }

    private func publishState() {
        if let item = player.currentItem, item.status == .failed {
            lastError = item.error?.localizedDescription ?? "The native renderer could not decode this track"
        }
        publish([
            "type": "state",
            "isPlaying": player.timeControlStatus == .playing,
            "progress": finiteSeconds(player.currentTime()),
            "duration": finiteSeconds(player.currentItem?.duration),
            "volume": Double(requestedVolume),
            "muted": muted,
            "error": lastError,
        ])
    }
}

func number(_ value: Any?, fallback: Double = 0) -> Double {
    if let value = value as? NSNumber { return value.doubleValue }
    return fallback
}

func finiteSeconds(_ time: CMTime?) -> Double {
    guard let time, time.isNumeric else { return 0 }
    let seconds = CMTimeGetSeconds(time)
    return seconds.isFinite && seconds >= 0 ? seconds : 0
}

func publish(_ object: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(object) else { return }
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

let host = PlaybackHost()
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard
            let data = line.data(using: .utf8),
            let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { continue }
        DispatchQueue.main.async { host.handle(command) }
    }
    DispatchQueue.main.async { exit(0) }
}
RunLoop.main.run()
