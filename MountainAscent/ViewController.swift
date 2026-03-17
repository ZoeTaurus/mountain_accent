import UIKit
import WebKit

class ViewController: UIViewController, WKNavigationDelegate {

    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        // Create WebView after layout is complete (so we have correct dimensions)
        if webView == nil {
            setupWebView()
        }
    }

    func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.backgroundColor = .black
        webView.isOpaque = false

        view.addSubview(webView)

        guard let htmlPath = Bundle.main.path(forResource: "index", ofType: "html") else {
            print("Could not find index.html")
            return
        }

        let htmlUrl = URL(fileURLWithPath: htmlPath)
        webView.loadFileURL(htmlUrl, allowingReadAccessTo: htmlUrl.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Set canvas size after page loads
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.setCanvasSize()
        }
    }

    func setCanvasSize() {
        let w = Int(view.bounds.width)
        let h = Int(view.bounds.height)

        print("Setting canvas to: \(w) x \(h)")

        let js = """
        (function() {
            var w = \(w);
            var h = \(h);

            CONFIG.CANVAS.WIDTH = w;
            CONFIG.CANVAS.HEIGHT = h;

            var canvas = document.getElementById('gameCanvas');
            if (canvas) {
                canvas.width = w;
                canvas.height = h;
                canvas.style.width = w + 'px';
                canvas.style.height = h + 'px';
            }

            if (Renderer && Renderer.canvas) {
                Renderer.canvas.width = w;
                Renderer.canvas.height = h;
            }

            console.log('Canvas resized to: ' + w + 'x' + h);
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    override var prefersStatusBarHidden: Bool {
        return true
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .landscape
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        return true
    }
}
