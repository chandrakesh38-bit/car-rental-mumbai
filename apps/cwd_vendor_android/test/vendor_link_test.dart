import 'package:cwd_vendor_android/app_config.dart';
import 'package:cwd_vendor_android/vendor_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final stage = Uri.parse('https://car-rental-mumbai-git-testing-example.vercel.app');
  final token = List.filled(64, 'a').join();

  test('No stage URL means fail closed', () {
    expect(AppConfig.ready, isFalse);
    expect(VendorLink.parse('https://carswithdriverindia.com/vendor-booking?offer=$token'), isNull);
  });

  test('Valid staging offer link', () {
    final link = VendorLink.parse(
      'https://car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?offer=$token',
      stagingOrigin: stage,
    );
    expect(link, isNotNull);
    expect(link!.kind, VendorLinkKind.offer);
  });

  test('Valid staging allocation link in WhatsApp text', () {
    final link = VendorLink.parse(
      'CWD OFFER: open https://car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?allocation=$token',
      stagingOrigin: stage,
    );
    expect(link?.kind, VendorLinkKind.allocation);
  });

  test('Reject production origin, extra query keys, and short tokens', () {
    expect(
      VendorLink.parse('https://carswithdriverindia.com/vendor-booking?offer=$token',
          stagingOrigin: stage),
      isNull,
    );
    expect(
      VendorLink.parse(
        'https://car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?offer=$token&x=1',
        stagingOrigin: stage,
      ),
      isNull,
    );
    expect(
      VendorLink.parse(
        'https://car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?offer=bad',
        stagingOrigin: stage,
      ),
      isNull,
    );
  });

  test('Reject malicious userinfo and fragment', () {
    expect(
      VendorLink.parse(
        'https://evil.test@car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?offer=$token',
        stagingOrigin: stage,
      ),
      isNull,
    );
    expect(
      VendorLink.parse(
        'https://car-rental-mumbai-git-testing-example.vercel.app/vendor-booking?offer=$token#x',
        stagingOrigin: stage,
      ),
      isNull,
    );
  });
}
