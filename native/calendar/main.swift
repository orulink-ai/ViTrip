import AppKit
import EventKit
import Foundation

struct CalendarEntry: Codable {
    let id: String
    let title: String
    let start: String
    let end: String
    let timeZone: String
    let location: String
    let notes: String
    let url: String?
    let reminderMinutes: Int?
}
struct Request: Decodable {
    let action: String
    let journeyId: String?
    let title: String?
    let accountId: String?
    let events: [CalendarEntry]?
    let statePath: String?
}
struct SavedEntry: Codable {
    var eventIdentifier: String
    var start: String
    var end: String
}
struct SyncState: Codable {
    let accountId: String
    let calendarId: String
    var entries: [String: SavedEntry]
}
enum SyncError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let value) = self { return value }; return nil }
}

let args = CommandLine.arguments
guard args.count == 3 else { exit(2) }
let outputURL = URL(fileURLWithPath: args[2])
func respond(_ response: [String: Any]) -> Never {
    do {
        let data = try JSONSerialization.data(withJSONObject: response)
        try data.write(to: outputURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: outputURL.path)
    } catch { exit(3) }
    exit(0)
}
let request: Request
do { request = try JSONDecoder().decode(Request.self, from: Data(contentsOf: URL(fileURLWithPath: args[1]))) }
catch { respond(["error": "无法读取日历同步请求：\(error.localizedDescription)"]) }

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let store = EKEventStore()
if request.action == "status" { respond(["authorization": EKEventStore.authorizationStatus(for: .event).rawValue]) }
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
func date(_ value: String) throws -> Date {
    guard let result = iso.date(from: value) else { throw SyncError.message("活动日期无效") }
    return result
}
func accounts() -> [EKSource] {
    // CalDAV sources include iCloud; local calendars never sync to an iPhone.
    return store.sources.filter { source in
        source.sourceType == .calDAV && store.calendars(for: .event).contains {
            $0.source.sourceIdentifier == source.sourceIdentifier && $0.allowsContentModifications
        }
    }.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
}
func persist(_ state: SyncState, to url: URL) throws {
    try JSONEncoder().encode(state).write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
}
func synchronize() throws -> [String: Any] {
    guard let journeyId = request.journeyId, let title = request.title,
          let accountId = request.accountId, let entries = request.events,
          let statePath = request.statePath, !entries.isEmpty,
          let source = accounts().first(where: { $0.sourceIdentifier == accountId }) else {
        throw SyncError.message("日历账户不可用，请在 Mac 系统设置中开启 iCloud 日历后重试")
    }
    let stateURL = URL(fileURLWithPath: statePath)
    var saved: SyncState?
    if FileManager.default.fileExists(atPath: statePath) {
        saved = try JSONDecoder().decode(SyncState.self, from: Data(contentsOf: stateURL))
        if saved?.accountId != accountId {
            throw SyncError.message("本旅行已同步到另一个账户，请选择原账户，避免重复创建日程")
        }
    }
    let calendar: EKCalendar
    if let calendarId = saved?.calendarId, let existing = store.calendar(withIdentifier: calendarId) {
        guard existing.source.sourceIdentifier == accountId && existing.allowsContentModifications else {
            throw SyncError.message("旅行日历已不可写，请检查日历账户")
        }
        calendar = existing
    } else {
        calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = title
        calendar.source = source
        try store.saveCalendar(calendar, commit: true)
    }
    var state = SyncState(accountId: accountId, calendarId: calendar.calendarIdentifier, entries: saved?.entries ?? [:])
    // Save the calendar identity before any events, so an interrupted retry reuses it.
    try persist(state, to: stateURL)
    if calendar.title != title { calendar.title = title; try store.saveCalendar(calendar, commit: true) }
    var created = 0
    var updated = 0
    for entry in entries {
        let start = try date(entry.start)
        let end = try date(entry.end)
        guard start < end, let zone = TimeZone(identifier: entry.timeZone) else { throw SyncError.message("活动时间或时区无效") }
        let marker = "[ViTrip:\(journeyId):\(entry.id)]"
        var existing = state.entries[entry.id].flatMap { store.event(withIdentifier: $0.eventIdentifier) }
        if existing?.calendar.calendarIdentifier != calendar.calendarIdentifier { existing = nil }
        if existing == nil {
            // Recover after iCloud changes an identifier or a crash occurs after saving an event.
            var ranges = [(start, end)]
            if let old = state.entries[entry.id] { ranges.append((try date(old.start), try date(old.end))) }
            for (lower, upper) in ranges {
                let predicate = store.predicateForEvents(withStart: lower.addingTimeInterval(-86400), end: upper.addingTimeInterval(86400), calendars: [calendar])
                existing = store.events(matching: predicate).first { $0.notes?.contains(marker) == true }
                if existing != nil { break }
            }
        }
        let event = existing ?? EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = entry.title
        event.startDate = start
        event.endDate = end
        event.timeZone = zone
        event.isAllDay = false
        event.location = entry.location
        event.notes = [entry.notes, marker].filter { !$0.isEmpty }.joined(separator: "\n\n")
        event.url = entry.url.flatMap { URL(string: $0) }
        event.alarms = entry.reminderMinutes.map { [EKAlarm(relativeOffset: -Double($0 * 60))] } ?? []
        // Persist the pending range before the write; recovery searches both old and new dates.
        let oldIdentifier = existing?.eventIdentifier ?? ""
        state.entries[entry.id] = SavedEntry(eventIdentifier: oldIdentifier, start: entry.start, end: entry.end)
        try persist(state, to: stateURL)
        try store.save(event, span: .thisEvent, commit: true)
        state.entries[entry.id] = SavedEntry(eventIdentifier: event.eventIdentifier, start: entry.start, end: entry.end)
        try persist(state, to: stateURL)
        if existing == nil { created += 1 } else { updated += 1 }
    }
    return ["created": created, "updated": updated, "removed": 0, "calendarTitle": calendar.title]
}
func perform() {
    do {
        switch request.action {
        case "accounts": respond(["accounts": accounts().map { ["id": $0.sourceIdentifier, "title": $0.title] }])
        case "sync": respond(try synchronize())
        default: respond(["error": "不支持的日历操作"])
        }
    } catch { respond(["error": "日历同步未完成，已写入的日程会在重试时复用：\(error.localizedDescription)"]) }
}
let completion: (Bool, Error?) -> Void = { granted, error in
    DispatchQueue.main.async {
        guard granted else {
            respond(["code": "calendar-permission-denied", "error": "未获得日历完整访问权限。请在系统设置 → 隐私与安全性 → 日历中允许 ViTrip 日历同步，然后重试。\(error.map { "（\($0.localizedDescription)）" } ?? "")"])
        }
        perform()
    }
}
if #available(macOS 14.0, *) { store.requestFullAccessToEvents(completion: completion) }
else { store.requestAccess(to: .event, completion: completion) }
app.run()
