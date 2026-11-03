import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.043, green: 0.071, blue: 0.114, alpha: 1.0)
        window.rootViewController = PetViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
