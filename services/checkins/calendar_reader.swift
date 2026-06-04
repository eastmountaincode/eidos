import EventKit
import Foundation

enum CalendarReaderError: Error, CustomStringConvertible {
    case missingValue(String)
    case invalidNumber(String)
    case accessDenied(String)
    case unknownArgument(String)

    var description: String {
        switch self {
        case .missingValue(let name):
            return "Missing value for \(name)"
        case .invalidNumber(let value):
            return "Invalid number: \(value)"
        case .accessDenied(let reason):
            return "Calendar access denied: \(reason)"
        case .unknownArgument(let arg):
            return "Unknown argument: \(arg)"
        }
    }
}

struct Options {
    var startEpoch: TimeInterval = Date().timeIntervalSince1970
    var endEpoch: TimeInterval = Date().addingTimeInterval(36 * 60 * 60).timeIntervalSince1970
    var calendar = ""
}

func parseArgs(_ args: [String]) throws -> Options {
    var options = Options()
    var index = 1

    func nextValue(for name: String) throws -> String {
        guard index + 1 < args.count else {
            throw CalendarReaderError.missingValue(name)
        }
        index += 1
        return args[index]
    }

    while index < args.count {
        let arg = args[index]
        switch arg {
        case "--start-epoch":
            let value = try nextValue(for: arg)
            guard let parsed = TimeInterval(value) else {
                throw CalendarReaderError.invalidNumber(value)
            }
            options.startEpoch = parsed
        case "--end-epoch":
            let value = try nextValue(for: arg)
            guard let parsed = TimeInterval(value) else {
                throw CalendarReaderError.invalidNumber(value)
            }
            options.endEpoch = parsed
        case "--calendar":
            options.calendar = try nextValue(for: arg)
        default:
            throw CalendarReaderError.unknownArgument(arg)
        }
        index += 1
    }

    return options
}

func requestAccess(_ store: EKEventStore) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var errorDescription = ""

    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { accessGranted, error in
            granted = accessGranted
            errorDescription = error?.localizedDescription ?? ""
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { accessGranted, error in
            granted = accessGranted
            errorDescription = error?.localizedDescription ?? ""
            semaphore.signal()
        }
    }

    _ = semaphore.wait(timeout: .now() + 20)
    if !granted {
        throw CalendarReaderError.accessDenied(errorDescription.isEmpty ? "grant Calendar access to the Eidos check-ins calendar reader on the Mac mini" : errorDescription)
    }
}

func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

func writeJSON(_ object: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    if let output = String(data: data, encoding: .utf8) {
        print(output)
    }
}

func main() throws {
    let options = try parseArgs(CommandLine.arguments)
    let store = EKEventStore()
    try requestAccess(store)

    let calendars = store.calendars(for: .event).filter { calendar in
        options.calendar.isEmpty || calendar.title == options.calendar
    }
    let start = Date(timeIntervalSince1970: options.startEpoch)
    let end = Date(timeIntervalSince1970: options.endEpoch)
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let events = store.events(matching: predicate)
        .sorted { $0.startDate < $1.startDate }
        .map { event in
            [
                "title": event.title ?? "",
                "calendar": event.calendar.title,
                "start": isoString(event.startDate),
                "end": isoString(event.endDate),
                "all_day": event.isAllDay,
                "location": event.location ?? "",
                "notes": event.notes ?? "",
                "url": event.url?.absoluteString ?? "",
            ] as [String : Any]
        }

    try writeJSON([
        "start": isoString(start),
        "end": isoString(end),
        "events": events,
    ])
}

do {
    try main()
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
