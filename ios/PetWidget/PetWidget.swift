import SwiftUI
import WidgetKit

// MARK: - Data

struct PetEntry: TimelineEntry {
    let date: Date
    let frame: Int
    let line: String
}

private let petLines: [String] = [
    "Ciallo～(∠・ω< )⌒★",
    "主人今天也在忙呀",
    "记得喝水哦",
    "要不要休息一下",
    "我一直在这儿呢",
    "偷偷看一眼～",
    "今天也要加油",
    "桌面有点乱啦",
    "摸摸头就开心",
    "困了就去睡吧",
    "鲸鱼尾巴甩甩～",
    "想和小呆说话吗",
]

struct PetProvider: TimelineProvider {
    func placeholder(in context: Context) -> PetEntry {
        PetEntry(date: Date(), frame: 1, line: petLines[0])
    }

    func getSnapshot(in context: Context, completion: @escaping (PetEntry) -> Void) {
        completion(PetEntry(date: Date(), frame: Int.random(in: 1...10), line: petLines.randomElement() ?? ""))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PetEntry>) -> Void) {
        var entries: [PetEntry] = []
        let now = Date()
        // 12 poses over the next 8 hours; the system may thin this out, which is fine
        for i in 0..<12 {
            let date = now.addingTimeInterval(TimeInterval(i) * 40 * 60)
            entries.append(PetEntry(date: date,
                                    frame: ((i * 3) % 10) + 1,
                                    line: petLines[(i * 5) % petLines.count]))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Assets

func petImage(_ index: Int, head: Bool = false) -> Image {
    let name = String(format: "pet_%02d", index) + (head ? "_head" : "")
    if let ui = UIImage(named: name) {
        return Image(uiImage: ui)
    }
    return Image(systemName: "pawprint.fill")
}

// MARK: - Background

private struct PetBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.05, green: 0.08, blue: 0.13),
                                    Color(red: 0.10, green: 0.16, blue: 0.26)],
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color(red: 0.38, green: 0.55, blue: 0.80).opacity(0.35), .clear],
                           center: .init(x: 0.5, y: 0.62),
                           startRadius: 4, endRadius: 130)
        }
    }
}

extension View {
    @ViewBuilder
    func petWidgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { PetBackground() }
        } else {
            self.background(PetBackground())
        }
    }
}

// MARK: - Views

struct PetWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PetEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            circular
        case .accessoryRectangular:
            rectangular
        case .accessoryInline:
            Text("小呆 · \(entry.line)")
        default:
            home
        }
    }

    private var home: some View {
        VStack(spacing: 2) {
            petImage(entry.frame)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: .infinity)
            Text(entry.line)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 4)
                .padding(.bottom, 2)
        }
        .petWidgetBackground()
    }

    private var circular: some View {
        petImage(entry.frame, head: true)
            .resizable()
            .scaledToFill()
            .widgetAccentable()
            .petWidgetBackground()
    }

    private var rectangular: some View {
        HStack(spacing: 6) {
            petImage(entry.frame, head: true)
                .resizable()
                .scaledToFit()
            VStack(alignment: .leading, spacing: 1) {
                Text("小呆")
                    .font(.system(size: 12, weight: .semibold))
                Text(entry.line)
                    .font(.system(size: 11))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .petWidgetBackground()
    }
}

// MARK: - Widget

struct PetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PetWidget", provider: PetProvider()) { entry in
            PetWidgetView(entry: entry)
        }
        .configurationDisplayName("小呆")
        .description("桌面上的小女仆，会换姿势和碎碎念")
        .supportedFamilies([.systemSmall, .systemMedium,
                            .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct PetWidgetBundle: WidgetBundle {
    var body: some Widget {
        PetWidget()
    }
}
