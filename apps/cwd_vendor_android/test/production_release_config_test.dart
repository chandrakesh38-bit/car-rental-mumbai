import 'package:cwd_vendor_android/app_config.dart';
import 'package:cwd_vendor_android/vendor_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Signed release pins the official CWD production hostname', () {
    expect(AppConfig.productionRelease, isTrue);
    expect(AppConfig.ready, isTrue);
    expect(AppConfig.origin?.scheme, 'https');
    expect(AppConfig.origin?.host, 'carswithdriverindia.com');
  });

  test('Release accepts exact CWD links but never untrusted hosts', () {
    final token = List.filled(64, 'a').join();
    expect(
      VendorLink.parse('https://carswithdriverindia.com/vendor-booking?offer=$token'),
      isNotNull,
    );
    expect(
      VendorLink.parse('https://evil.example/vendor-booking?offer=$token'),
      isNull,
    );
    expect(
      VendorLink.parse('https://carswithdriverindia.com.evil.example/vendor-booking?offer=$token'),
      isNull,
    );
    expect(
      VendorLink.parse('http://carswithdriverindia.com/vendor-booking?offer=$token'),
      isNull,
    );
  });
}
