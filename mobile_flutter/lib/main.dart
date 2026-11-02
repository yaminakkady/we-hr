import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:geolocator/geolocator.dart';
import 'l10n/app_strings.dart';
import 'services/biometric_auth_service.dart';
import 'services/location_geofence_service.dart';
import 'services/offline_attendance_queue.dart';
import 'services/we_hr_api_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const WeHrMobileApp());
}

class WeHrMobileApp extends StatefulWidget {
  const WeHrMobileApp({super.key});

  @override
  State<WeHrMobileApp> createState() => _WeHrMobileAppState();
}

class _WeHrMobileAppState extends State<WeHrMobileApp> {
  Locale _locale = const Locale('ar');

  void _toggleLocale() {
    setState(() {
      _locale = _locale.languageCode == 'ar'
          ? const Locale('en')
          : const Locale('ar');
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'We HR',
      debugShowCheckedModeBanner: false,
      locale: _locale,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F4C81)),
        useMaterial3: true,
      ),
      home: AttendanceHomePage(
        localeCode: _locale.languageCode,
        onToggleLocale: _toggleLocale,
      ),
    );
  }
}

class AttendanceHomePage extends StatefulWidget {
  final String localeCode;
  final VoidCallback onToggleLocale;

  const AttendanceHomePage({
    super.key,
    required this.localeCode,
    required this.onToggleLocale,
  });

  @override
  State<AttendanceHomePage> createState() => _AttendanceHomePageState();
}

class _AttendanceHomePageState extends State<AttendanceHomePage> {
  final _api = WeHrApiClient(
    baseUrl: const String.fromEnvironment(
      'WE_HR_API_URL',
      defaultValue: 'http://10.0.2.2:3000',
    ),
  );
  final _locationService = LocationGeofenceService();
  final _biometricService = BiometricAuthService();
  final _offlineQueue = OfflineAttendanceQueue();

  final _emailCtrl = TextEditingController(text: 'ahmed.saeed@niledelta.eg');
  final _passwordCtrl = TextEditingController(text: 'WeHR@2026');

  bool _isAuthenticated = false;
  bool _isBusy = false;
  String? _statusBanner;
  Map<String, dynamic>? _employeeContext;
  Position? _currentPosition;
  double? _previewDistanceMeters;

  String _tr(String key) => AppStrings.tr(widget.localeCode, key);

  Future<void> _handleLogin() async {
    setState(() {
      _isBusy = true;
      _statusBanner = null;
    });
    try {
      final res = await _api.login(_emailCtrl.text.trim(), _passwordCtrl.text);
      if (res['ok'] == true) {
        final ctx = await _api.fetchEmployeeContext();
        setState(() {
          _isAuthenticated = true;
          _employeeContext = ctx;
        });
        await _refreshGpsReading();
      } else {
        setState(() {
          _statusBanner = res['message']?.toString() ?? 'Login failed';
        });
      }
    } catch (e) {
      setState(() {
        _statusBanner = 'Network error: $e';
      });
    } finally {
      setState(() => _isBusy = false);
    }
  }

  Future<void> _refreshGpsReading() async {
    try {
      final pos = await _locationService.acquireFreshLocation();
      final workplaces =
          (_employeeContext?['authorizedWorkplaces'] as List<dynamic>?) ?? [];
      double? dist;
      if (workplaces.isNotEmpty) {
        final wp = workplaces.first as Map<String, dynamic>;
        dist = LocationGeofenceService.calculateHaversineMeters(
          pos.latitude,
          pos.longitude,
          (wp['latitude'] as num).toDouble(),
          (wp['longitude'] as num).toDouble(),
        );
      }
      setState(() {
        _currentPosition = pos;
        _previewDistanceMeters = dist;
      });
    } catch (e) {
      setState(() {
        _statusBanner = 'Location error: $e';
      });
    }
  }

  Future<void> _submitAttendance(String eventType) async {
    if (_isBusy) return;
    setState(() {
      _isBusy = true;
      _statusBanner = null;
    });

    try {
      // Step 1: Acquire fresh GPS reading
      await _refreshGpsReading();
      final pos = _currentPosition;
      if (pos == null) {
        setState(() {
          _statusBanner = 'Unable to acquire valid GPS reading.';
        });
        return;
      }

      // Step 2: Invoke Operating-System BiometricPrompt / LocalAuthentication
      final emp = _employeeContext?['employee'] as Map<String, dynamic>? ?? {};
      final bool requireBiometric = emp['require_biometric'] == true;
      final bool allowException = emp['allow_biometric_exception'] == true;

      final bioResult = await _biometricService.authenticateForAttendance(
        localizedReason: _tr('biometricPromptReason'),
        requireBiometricOnly: requireBiometric && !allowException,
        allowAdminBiometricException: allowException,
      );

      if (!bioResult.osAuthenticated) {
        setState(() {
          _statusBanner =
              'Biometric check failed (${bioResult.errorCode}): ${bioResult.errorMessage ?? ''}';
        });
        return;
      }

      // Step 3: Build authoritative request with unique idempotency key
      final workplaces =
          (_employeeContext?['authorizedWorkplaces'] as List<dynamic>?) ?? [];
      final wpId = workplaces.isNotEmpty
          ? (workplaces.first as Map<String, dynamic>)['id']
          : emp['default_workplace_id'];

      final nowIso = DateTime.now().toUtc().toIso8601String();
      final payload = <String, dynamic>{
        'eventType': eventType,
        'idempotencyKey':
            'flutter-${DateTime.now().millisecondsSinceEpoch}-${emp['id']}',
        'workplaceId': wpId,
        'latitude': pos.latitude,
        'longitude': pos.longitude,
        'accuracyMeters': pos.accuracy,
        'locationTimestamp': pos.timestamp.toUtc().toIso8601String(),
        'deviceTimestamp': nowIso,
        'isMockLocation': pos.isMocked,
        'auth': bioResult.toApiJson(
          deviceIdentifier: 'MOBILE-${emp['employee_code']}',
          devicePlatform: 'android',
          deviceModel: 'Flutter Mobile Handset',
          osVersion: 'OS-Verified',
        ),
      };

      try {
        final result = await _api.submitAttendanceEvent(payload);
        setState(() {
          _statusBanner =
              '${result['code']}: ${result['message']}';
        });
        _employeeContext = await _api.fetchEmployeeContext();
      } catch (_) {
        // Network unreachable: enqueue in Pending Offline Queue (never claim accepted!)
        await _offlineQueue.enqueuePendingEvent(payload);
        setState(() {
          _statusBanner =
              'Offline: Saved as PENDING synchronization. Will revalidate when online.';
        });
      }
    } finally {
      setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_tr('appTitle')),
        actions: [
          TextButton(
            onPressed: widget.onToggleLocale,
            child: Text(widget.localeCode == 'ar' ? 'English' : 'العربية'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: !_isAuthenticated ? _buildLoginView() : _buildAttendanceView(),
      ),
    );
  }

  Widget _buildLoginView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          _tr('loginTitle'),
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _emailCtrl,
          decoration: InputDecoration(labelText: _tr('email')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _passwordCtrl,
          obscureText: true,
          decoration: InputDecoration(labelText: _tr('password')),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _isBusy ? null : _handleLogin,
          child: Text(_tr('signIn')),
        ),
        if (_statusBanner != null) ...[
          const SizedBox(height: 16),
          Text(_statusBanner!, style: const TextStyle(color: Colors.red)),
        ],
      ],
    );
  }

  Widget _buildAttendanceView() {
    return ListView(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_tr('locationExplanation')),
                const SizedBox(height: 8),
                if (_previewDistanceMeters != null)
                  Text('${_tr('distance')}: ${_previewDistanceMeters}m'),
                if (_currentPosition != null)
                  Text('${_tr('accuracy')}: ${_currentPosition!.accuracy.toStringAsFixed(1)}m'),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _isBusy ? null : _refreshGpsReading,
                  child: Text(_tr('refreshLocation')),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            FilledButton(
              onPressed: _isBusy ? null : () => _submitAttendance('check_in'),
              child: Text(_tr('checkIn')),
            ),
            OutlinedButton(
              onPressed: _isBusy ? null : () => _submitAttendance('break_start'),
              child: Text(_tr('breakStart')),
            ),
            OutlinedButton(
              onPressed: _isBusy ? null : () => _submitAttendance('break_end'),
              child: Text(_tr('breakEnd')),
            ),
            FilledButton.tonal(
              onPressed: _isBusy ? null : () => _submitAttendance('check_out'),
              child: Text(_tr('checkOut')),
            ),
          ],
        ),
        if (_statusBanner != null) ...[
          const SizedBox(height: 16),
          Card(
            color: Colors.blueGrey.shade50,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_statusBanner!),
            ),
          ),
        ],
      ],
    );
  }
}
