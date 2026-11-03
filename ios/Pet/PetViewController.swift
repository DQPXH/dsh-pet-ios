import UIKit
import WebKit

/// Hosts the pet web layer in a full-bleed WKWebView.
///
/// iOS has no equivalent of Android's SYSTEM_ALERT_WINDOW, so the pet lives
/// inside this app's own screen instead of floating over other apps. Everything
/// else (animation set, tap reactions, drag + throw physics) is driven by the
/// bundled JS layer in `web/`, which keeps the port small and predictable.
final class PetViewController: UIViewController, WKScriptMessageHandler {

    private static let background = UIColor(red: 0.043, green: 0.071, blue: 0.114, alpha: 1.0)

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.background

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsPictureInPictureMediaPlayback = false
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        config.userContentController.add(self, name: "pet")

        let webView = WKWebView(frame: view.bounds, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = Self.background
        webView.scrollView.backgroundColor = Self.background
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isMultipleTouchEnabled = false
        webView.accessibilityIgnoresInvertColors = true
        if #available(iOS 16.4, *) {
            webView.isInspectable = false
        }
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        self.webView = webView

        loadPet()
    }

    private func loadPet() {
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            showFallback("web/index.html missing from bundle")
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    private func showFallback(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.8),
        ])
    }

    // MARK: - JS bridge

    func userContentController(_ userContentController: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        guard message.name == "pet" else { return }
        let body = message.body as? String ?? ""
        switch body {
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "soft": UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case "select": UISelectionFeedbackGenerator().selectionChanged()
        default: break
        }
    }

    // MARK: - Chrome

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var shouldAutorotate: Bool { false }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        webView.evaluateJavaScript("window.PetApp && PetApp.trimCaches && PetApp.trimCaches()")
    }
}
