package cloud.wehr.mobile

import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * MainActivity must extend FlutterFragmentActivity (not FlutterActivity)
 * so that AndroidX BiometricPrompt via `local_auth` can attach its lifecycle fragment.
 */
class MainActivity: FlutterFragmentActivity()
