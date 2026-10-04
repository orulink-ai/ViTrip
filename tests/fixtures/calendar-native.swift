import Foundation
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let request = try JSONSerialization.jsonObject(with: Data(contentsOf: input)) as! [String: Any]
let context = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Resources/fixture.json")
let config = try JSONSerialization.jsonObject(with: Data(contentsOf: context)) as! [String: String]
let log = URL(fileURLWithPath: config["log"]!)
let entry = try JSONSerialization.data(withJSONObject: request)
if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil) }
let handle = try FileHandle(forWritingTo: log)
try handle.seekToEnd(); try handle.write(contentsOf: entry); try handle.write(contentsOf: Data("\n".utf8)); try handle.close()
var result: [String: Any] = ["accounts": [["id": "icloud", "title": "iCloud"]]]
if request["action"] as? String == "sync" {
  let state = URL(fileURLWithPath: request["statePath"] as! String)
  let count = (request["events"] as! [[String: Any]]).count
  let existing = FileManager.default.fileExists(atPath: state.path)
  result = ["created": existing ? 0 : count, "updated": existing ? count : 0, "removed": 0, "calendarTitle": request["title"]!]
  try Data("fixture".utf8).write(to: state)
}
try JSONSerialization.data(withJSONObject: result).write(to: output)
