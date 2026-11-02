import 'dart:convert';
import 'package:http/http.dart' as http;

/// HTTP client for communicating with the We HR multi-tenant backend.
class WeHrApiClient {
  final String baseUrl;
  String? _accessToken;

  WeHrApiClient({required this.baseUrl});

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  String? get accessToken => _accessToken;

  Map<String, String> _headers() {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
    };
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final uri = Uri.parse('$baseUrl/api/auth/login');
    final resp = await http
        .post(
          uri,
          headers: _headers(),
          body: jsonEncode({'email': email, 'password': password}),
        )
        .timeout(const Duration(seconds: 60));
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode == 200 && body['token'] != null) {
      _accessToken = body['token'] as String;
    }
    return body;
  }

  Future<Map<String, dynamic>> fetchEmployeeContext() async {
    final uri = Uri.parse('$baseUrl/api/employee/context');
    final resp = await http
        .get(uri, headers: _headers())
        .timeout(const Duration(seconds: 60));
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> submitAttendanceEvent(
    Map<String, dynamic> payload,
  ) async {
    final uri = Uri.parse('$baseUrl/api/attendance/events');
    final resp = await http
        .post(
          uri,
          headers: _headers(),
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 60));
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }
}
