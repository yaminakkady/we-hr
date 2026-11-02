import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../services/location_geofence_service.dart';

/// Platform admin mode: hosts the web Admin Console (`/admin`) inside the app so the
/// mobile and web admin experiences are always identical.
///
/// Bridge (JavaScript channel `WeHrNative`):
/// - page -> app `ready`   : console loaded, app hands over the session token + language
/// - page -> app `locate`  : app reads GPS natively and answers `window.weHrNativeLocation(...)`
/// - page -> app `signout` : console signed out (or session expired), app returns to login
class AdminConsoleScreen extends StatefulWidget {
  final String baseUrl;
  final String token;
  final String localeCode;
  final VoidCallback onSignOut;

  const AdminConsoleScreen({
    super.key,
    required this.baseUrl,
    required this.token,
    required this.localeCode,
    required this.onSignOut,
  });

  @override
  State<AdminConsoleScreen> createState() => _AdminConsoleScreenState();
}

class _AdminConsoleScreenState extends State<AdminConsoleScreen> {
  late final WebViewController _controller;
  final _locationService = LocationGeofenceService();
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    final origin = Uri.parse(widget.baseUrl).origin;
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF4F7FB))
      ..addJavaScriptChannel('WeHrNative', onMessageReceived: _onBridgeMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          // Keep the console on the We HR server; never navigate to other sites in-app.
          onNavigationRequest: (request) => Uri.parse(request.url).origin == origin
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
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
      )
      ..loadRequest(Uri.parse('${widget.baseUrl}/admin'));
  }

  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    switch (message.message) {
      case 'ready':
        await _controller.runJavaScript(
          'window.weHrAdminSignIn(${jsonEncode(widget.token)}, ${jsonEncode(widget.localeCode)});',
        );
        break;
      case 'locate':
        try {
          final pos = await _locationService.acquireFreshLocation();
          await _controller.runJavaScript(
            'window.weHrNativeLocation(${jsonEncode({
              'latitude': pos.latitude,
              'longitude': pos.longitude,
              'accuracy': pos.accuracy,
            })});',
          );
        } catch (e) {
          await _controller.runJavaScript(
            'window.weHrNativeLocation(${jsonEncode({'error': e.toString()})});',
          );
        }
        break;
      case 'signout':
        widget.onSignOut();
        break;
    }
  }

  void _retry() {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    _controller.loadRequest(Uri.parse('${widget.baseUrl}/admin'));
  }

  @override
  Widget build(BuildContext context) {
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 48),
              const SizedBox(height: 12),
              Text(_loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _retry, child: const Text('Retry / إعادة المحاولة')),
              TextButton(onPressed: widget.onSignOut, child: const Text('Sign out / تسجيل الخروج')),
            ],
          ),
        ),
      );
    }
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_loading) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
