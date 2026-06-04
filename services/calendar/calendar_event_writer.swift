import EventKit
import Foundation

enum CalendarToolError: Error, CustomStringConvertible {
    case missingValue(String)
    case calendarNotFound(String)
    case accessDenied(String)
    case invalidNumber(String)
    case unknownArgument(String)

    var description: String {
        switch self {
        case .missingValue(let name):
            return "Missing value for \(name)"
        case .calendarNotFound(let name):
            return "Calendar not found: \(name)"
        case .accessDenied(let reason):
            return "Calendar access denied: \(reason)"
        case .invalidNumber(let value):
            return "Invalid number: \(value)"
        case .unknownArgument(let arg):
            return "Unknown argument: \(arg)"
        }
    }
}

struct Options {
    var listCalendars = false
    var calendar = "Events Ambient"
    var title = ""
    var startEpoch: TimeInterval = 0
    var endEpoch: TimeInterval = 0
    var location = ""
    var notes = ""
    var url = ""
    var allDay = false
}

func parseArgs(_ args: [String]) throws -> Options {
    var options = Options()
    var index = 1

    func nextValue(for name: String) throws -> String {
        guard index + 1 < args.count else {
            throw CalendarToolError.missingValue(name)
        }
        index += 1
        return args[index]
    }

    while index < args.count {
        let arg = args[index]
        switch arg {
        case "--list-calendars":
            options.listCalendars = true
        case "--calendar":
            options.calendar = try nextValue(for: arg)
        case "--title":
            options.title = try nextValue(for: arg)
        case "--start-epoch":
            let value = try nextValue(for: arg)
            guard let parsed = TimeInterval(value) else {
                throw CalendarToolError.invalidNumber(value)
            }
            options.startEpoch = parsed
        case "--end-epoch":
            let value = try nextValue(for: arg)
            guard let parsed = TimeInterval(value) else {
                throw CalendarToolError.invalidNumber(value)
            }
            options.endEpoch = parsed
        case "--location":
            options.location = try nextValue(for: arg)
        case "--notes":
            options.notes = try nextValue(for: arg)
        case "--url":
            options.url = try nextValue(for: arg)
        case "--all-day":
            options.allDay = true
        default:
            throw CalendarToolError.unknownArgument(arg)
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
        throw CalendarToolError.accessDenied(errorDescription.isEmpty ? "grant Calendar access to this Eidos calendar tool on the Mac mini" : errorDescription)
    }
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

    if options.listCalendars {
        let calendars = store.calendars(for: .event).map { $0.title }.sorted()
        try writeJSON(["calendars": calendars])
        return
    }

    guard let calendar = store.calendars(for: .event).first(where: { $0.title == options.calendar }) else {
        throw CalendarToolError.calendarNotFound(options.calendar)
    }

    let event = EKEvent(eventStore: store)
    event.calendar = calendar
    event.title = options.title
    event.startDate = Date(timeIntervalSince1970: options.startEpoch)
    event.endDate = Date(timeIntervalSince1970: options.endEpoch)
    event.isAllDay = options.allDay
    if !options.location.isEmpty {
        event.location = options.location
    }
    if !options.notes.isEmpty {
        event.notes = options.notes
    }
    if !options.url.isEmpty {
        event.url = URL(string: options.url)
    }

    try store.save(event, span: .thisEvent, commit: true)
    try writeJSON([
        "uid": event.eventIdentifier ?? "",
    ])
}

do {
    try main()
} catch {
    fputs("\(error)\n", stderr)
    exit(1)
}
