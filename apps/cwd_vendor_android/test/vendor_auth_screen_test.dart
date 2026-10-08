import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cwd_vendor_android/vendor_auth_screen.dart';

void main(){
  testWidgets('Vendor login and all OTP boxes use a numeric-only keyboard',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home:VendorAuthGate()));
      await tester.pumpAndSettle();
      final phone=tester.widget<TextField>(
        find.byKey(const Key('vendor-mobile-input')));
      expect(phone.keyboardType,TextInputType.number);
      expect(phone.inputFormatters,isNotEmpty);
      await tester.ensureVisible(find.text('Preview numeric OTP keypad'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview numeric OTP keypad'));
      await tester.pumpAndSettle();
      for(var i=0;i<4;i++){
        final box=tester.widget<TextField>(
          find.byKey(Key('vendor-otp-digit-'+i.toString())));
        expect(box.keyboardType,TextInputType.number);
        expect(box.inputFormatters,isNotEmpty);
      }
      expect(find.text('No OTP was sent. This preview only checks the '
        'numeric keypad and the four input boxes.'),findsOneWidget);
      expect(tester.widget<FilledButton>(
        find.ancestor(of:find.text('Verify & Proceed'),
          matching:find.byType(FilledButton))).onPressed,isNull);
    });
}
