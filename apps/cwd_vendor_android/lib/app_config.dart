/// CWD Partner Android environment settings.
///
/// Normal builds remain safe-mode testing builds. A production release is
/// explicitly selected by the trusted, signed-release CI workflow only.
/// Production origin is pinned to CWD's official hostname: never a user
/// supplied URL, token, WebView redirect, or environment override.
class AppConfig {
  static const bool productionRelease =
      bool.fromEnvironment('CWD_PARTNER_PRODUCTION', defaultValue: false);

  static const String rawStagingUrl =
      String.fromEnvironment('CWD_VENDOR_STAGING_URL',
          defaultValue: 'https://car-rental-mumbai-git-testing-car-with-driver-operation-team.vercel.app');
  static const bool isolated =
      bool.fromEnvironment('CWD_VENDOR_STAGING_ISOLATED', defaultValue: false);

  static Uri? get origin {
    if (productionRelease) {
      return Uri(scheme: 'https', host: 'carswithdriverindia.com');
    }
    final value = Uri.tryParse(rawStagingUrl.trim());
    if (value == null ||
        value.scheme != 'https' ||
        value.host.isEmpty ||
        value.hasPort ||
        value.userInfo.isNotEmpty ||
        (value.path.isNotEmpty && value.path != '/') ||
        value.hasQuery ||
        value.hasFragment ||
        !value.host.startsWith('car-rental-mumbai-') ||
        !value.host.endsWith('.vercel.app')) {
      return null;
    }
    return Uri(scheme: 'https', host: value.host);
  }

  /// This only controls which server the app talks to. Server-side
  /// authentication, vendor ownership and write gates remain mandatory.
  static bool get ready =>
      productionRelease || (origin != null && isolated);
}
