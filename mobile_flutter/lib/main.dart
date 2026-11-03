import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'services/native_bridge.dart';

/// The We HR server. Every screen (sign-in, attendance, HR dashboard, admin console) is the
/// website served from here, so any change deployed to the server reaches this app instantly.
const String weHrServerUrl = String.fromEnvironment(
  'WE_HR_API_URL',
  defaultValue: 'https://we-hr.onrender.com',
);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WeHrMobileApp());
}

class WeHrMobileApp extends StatelessWidget {
  const WeHrMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'We HR',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F4C81)),
        useMaterial3: true,
      ),
      home: const WebShellPage(),
    );
  }
}

/// Thin native shell: shows the We HR web app full-screen and answers its native calls
/// (GPS, fingerprint / Face ID, device info) through [NativeBridge].
class WebShellPage extends StatefulWidget {
  const WebShellPage({super.key});

  @override
  State<WebShellPage> createState() => _WebShellPageState();
}

class _WebShellPageState extends State<WebShellPage> {
  late final WebViewController _controller;
  late final NativeBridge _bridge;
  final String _origin = Uri.parse(weHrServerUrl).origin;
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF4F7FB))
      ..setNavigationDelegate(
        NavigationDelegate(
          // Stay on the We HR server; never browse other sites inside the app.
          onNavigationRequest: (request) => Uri.parse(request.url).origin == _origin
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
          onPageStarted: (_) => setState(() => _loading = true),
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              setState(() {
                _loading = false;
                _loadError = error.description;
              });
            }
          },
        ),
      );
    _bridge = NativeBridge(_controller);
    _controller
      ..addJavaScriptChannel('WeHrNative', onMessageReceived: _bridge.handle)
      ..loadRequest(Uri.parse(weHrServerUrl));
  }

  void _retry() {
    setState(() {
      _loadError = null;
      _loading = true;
    });
    _controller.loadRequest(Uri.parse(weHrServerUrl));
  }

  Future<void> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0F4C81),
        body: SafeArea(
          bottom: false,
          child: ColoredBox(
            color: const Color(0xFFF4F7FB),
            child: _loadError != null ? _buildOffline() : _buildWeb(),
          ),
        ),
      ),
    );
  }

  Widget _buildWeb() {
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_loading) const LinearProgressIndicator(minHeight: 3),
      ],
    );
  }

  Widget _buildOffline() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 56, color: Color(0xFF475569)),
            const SizedBox(height: 16),
            const Text(
              'تعذر الاتصال بخادم We HR\nCould not reach the We HR server',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(_loadError ?? '', textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF475569))),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _retry,
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة المحاولة / Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
