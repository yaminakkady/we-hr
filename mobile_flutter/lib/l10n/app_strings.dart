/// We HR — Bilingual Localization Strings (Arabic RTL & English LTR)
class AppStrings {
  static const Map<String, Map<String, String>> values = {
    'ar': {
      'appTitle': 'We HR | الحضور الذكي للموظفين',
      'loginTitle': 'تسجيل الدخول إلى حساب الموظف',
      'email': 'البريد الإلكتروني',
      'password': 'كلمة المرور',
      'signIn': 'تسجيل الدخول',
      'nearestWorkplace': 'أقرب موقع عمل معتمد',
      'distance': 'المسافة الحالية',
      'accuracy': 'دقة GPS',
      'insideGeofence': 'داخل نطاق السياج الجغرافي المسموح',
      'outsideGeofence': 'خارج نطاق السياج الجغرافي المعتمد',
      'refreshLocation': 'تحديث قراءة الموقع (GPS)',
      'biometricPromptReason': 'يرجى تأكيد هويتك بالبصمة الحيوية لتسجيل حركة الحضور في We HR',
      'checkIn': 'تسجيل حضور (Check-In)',
      'checkOut': 'تسجيل انصراف (Check-Out)',
      'breakStart': 'بدء استراحة',
      'breakEnd': 'إنهاء استراحة',
      'syncOffline': 'مزامنة الحركات المعلقة',
      'locationExplanation': 'يتم قراءة موقعك الجغرافي فقط لحظة تسجيل الحضور للتحقق من وجودك داخل مقر العمل، ولا يتم تتبعك في الخلفية.',
    },
    'en': {
      'appTitle': 'We HR | Smart Employee Attendance',
      'loginTitle': 'Employee Account Sign In',
      'email': 'Work Email',
      'password': 'Password',
      'signIn': 'Sign In',
      'nearestWorkplace': 'Nearest Authorized Workplace',
      'distance': 'Current Distance',
      'accuracy': 'GPS Accuracy',
      'insideGeofence': 'Inside Permitted Workplace Geofence',
      'outsideGeofence': 'Outside Permitted Workplace Geofence',
      'refreshLocation': 'Refresh GPS Location Reading',
      'biometricPromptReason': 'Authenticate with your fingerprint or Face ID to record We HR attendance',
      'checkIn': 'Check-In',
      'checkOut': 'Check-Out',
      'breakStart': 'Start Break',
      'breakEnd': 'End Break',
      'syncOffline': 'Sync Pending Offline Events',
      'locationExplanation': 'Your GPS location is read only at the moment of attendance submission to verify workplace proximity. No background tracking is performed.',
    },
  };

  static String tr(String localeCode, String key) {
    final map = values[localeCode] ?? values['ar']!;
    return map[key] ?? key;
  }
}
