import 'dart:async';
import 'dart:convert';
import 'dart:io';

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
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF18181B)),
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
  static const int _maxWakeAttempts = 35;

  late final WebViewController _controller;
  late final NativeBridge _bridge;
  final String _origin = Uri.parse(weHrServerUrl).origin;
  bool _serverReady = false;
  bool _pageReady = false;
  String? _loadError;
  int _wakeAttempt = 0;
  bool _disposed = false;

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
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() => _pageReady = false);
          },
          onPageFinished: (_) async {
            final title = (await _controller.getTitle()) ?? '';
            if (!mounted) return;
            if (title.toLowerCase().contains('render - application loading')) {
              setState(() => _pageReady = false);
              _wakeServerAndLoad();
              return;
            }
            setState(() => _pageReady = true);
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              if (!mounted) return;
              setState(() {
                _pageReady = false;
                _loadError = error.description;
              });
            }
          },
        ),
      );
    _bridge = NativeBridge(_controller);
    _controller.addJavaScriptChannel('WeHrNative', onMessageReceived: _bridge.handle);
    _wakeServerAndLoad();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// Polls `/api/health` before loading the WebView URL so Render's cold-start
  /// "WELCOME TO RENDER / APPLICATION LOADING" screen is never shown to the user.
  Future<void> _wakeServerAndLoad() async {
    if (_disposed) return;
    setState(() {
      _serverReady = false;
      _pageReady = false;
      _loadError = null;
      _wakeAttempt = 0;
    });

    final healthUri = Uri.parse('$weHrServerUrl/api/health');

    for (var attempt = 1; attempt <= _maxWakeAttempts; attempt++) {
      if (_disposed || !mounted) return;
      setState(() => _wakeAttempt = attempt);

      final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
      try {
        final request = await client.getUrl(healthUri);
        request.headers.set(HttpHeaders.acceptHeader, 'application/json');
        request.headers.set(HttpHeaders.cacheControlHeader, 'no-cache');
        final response = await request.close().timeout(const Duration(seconds: 8));
        final body = await response.transform(utf8.decoder).join();

        if (response.statusCode == 200) {
          final parsed = jsonDecode(body);
          if (parsed is Map && parsed['ok'] == true) {
            if (_disposed || !mounted) return;
            setState(() => _serverReady = true);
            await _controller.loadRequest(Uri.parse(weHrServerUrl));
            return;
          }
        }
      } catch (_) {
        // Server is still waking up or momentarily unreachable; retry after delay.
      } finally {
        client.close(force: true);
      }

      if (attempt < _maxWakeAttempts) {
        await Future<void>.delayed(const Duration(seconds: 2));
      }
    }

    if (_disposed || !mounted) return;
    setState(() {
      _loadError = 'Server is taking too long to respond. Please tap Retry.';
    });
  }

  void _retry() {
    _wakeServerAndLoad();
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
        backgroundColor: const Color(0xFF18181B),
        body: SafeArea(
          bottom: false,
          child: ColoredBox(
            color: const Color(0xFFEEF0F4),
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
        if (!_serverReady || !_pageReady) _buildAppLoading(),
      ],
    );
  }

  Widget _buildAppLoading() {
    return ColoredBox(
      color: const Color(0xFFEEF0F4),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: const Color(0xFF18181B),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x2818181B),
                      blurRadius: 20,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: const Text(
                  'We',
                  style: TextStyle(
                    color: Color(0xFFD4F759),
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'We HR',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF111827),
                ),
              ),
              const SizedBox(height: 20),
              const CircularProgressIndicator(
                color: Color(0xFF18181B),
                strokeWidth: 3,
              ),
              const SizedBox(height: 18),
              const Text(
                'جارٍ تحميل تطبيق We HR…',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF18181B),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _wakeAttempt > 1
                    ? 'App loading… please wait ($_wakeAttempt)'
                    : 'App loading… please wait',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFF6B7280),
                ),
              ),
            ],
          ),
        ),
      ),
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
