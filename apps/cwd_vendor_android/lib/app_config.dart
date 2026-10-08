/// Strictly preview-only configuration. A build is deliberately disabled unless
/// its owner explicitly confirms database and payment isolation.
class AppConfig {
  static const String rawStagingUrl =
      String.fromEnvironment('CWD_VENDOR_STAGING_URL', defaultValue: '');
  static const bool isolated =
      bool.fromEnvironment('CWD_VENDOR_STAGING_ISOLATED', defaultValue: false);

  static Uri? get origin {
    final value = Uri.tryParse(rawStagingUrl.trim());
    if (value == null ||
        value.scheme != 'https' ||
        value.host.isEmpty ||
        value.hasPort ||
        value.userInfo.isNotEmpty ||
        value.path.isNotEmpty && value.path != '/' ||
        value.hasQuery ||
        value.hasFragment ||
        !value.host.startsWith('car-rental-mumbai-') ||
        !value.host.endsWith('.vercel.app')) {
      return null;
    }
    return Uri(scheme: 'https', host: value.host);
  }

  static bool get ready => origin != null && isolated;
}
