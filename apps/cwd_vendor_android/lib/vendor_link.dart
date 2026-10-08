import 'app_config.dart';

enum VendorLinkKind { offer, allocation }

class VendorLink {
  const VendorLink(this.uri, this.kind);
  final Uri uri;
  final VendorLinkKind kind;

  String get title =>
      kind == VendorLinkKind.offer ? 'Booking offer' : 'Allocated trip';

  static VendorLink? parse(String input, {Uri? stagingOrigin}) {
    final origin = stagingOrigin ?? AppConfig.origin;
    if (origin == null) return null;
    // Accept a direct URL or a copied WhatsApp message containing the URL.
    final match = RegExp(r'https://[^\s<>]+').firstMatch(input);
    if (match == null) return null;
    final candidate = match.group(0)!
        .replaceAll(RegExp(r'[),.;]+$'), '')
        .replaceAll('"', '')
        .replaceAll("'", '');
    final uri = Uri.tryParse(candidate);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host != origin.host ||
        uri.hasPort ||
        uri.userInfo.isNotEmpty ||
        uri.path != '/vendor-booking' ||
        uri.hasFragment ||
        uri.queryParameters.length != 1) {
      return null;
    }
    final isOffer = uri.queryParameters.containsKey('offer');
    final isAllocation = uri.queryParameters.containsKey('allocation');
    if (isOffer == isAllocation) return null;
    final token = (isOffer
            ? uri.queryParameters['offer']
            : uri.queryParameters['allocation']) ??
        '';
    if (!RegExp(r'^[a-fA-F0-9]{64}$').hasMatch(token)) return null;
    return VendorLink(uri, isOffer ? VendorLinkKind.offer : VendorLinkKind.allocation);
  }
}
