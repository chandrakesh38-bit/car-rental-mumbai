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

  testWidgets('Mobile can receive and edit digits, move cursor, and block letters',
    (tester) async {
      await tester.pumpWidget(const MaterialApp(home:VendorAuthGate()));
      await tester.pumpAndSettle();
      final field=find.byKey(const Key('vendor-mobile-input'));
      await tester.ensureVisible(field);
      await tester.tap(field);
      await tester.pump();
      final phone=tester.widget<TextField>(field);
      expect(phone.readOnly,false);
      expect(phone.enabled,true);
      expect(phone.enableInteractiveSelection,true);
      expect(phone.showCursor,true);
      expect(phone.keyboardType,
        const TextInputType.numberWithOptions(decimal:false,signed:false));
      expect(tester.testTextInput.isVisible,isTrue);
      expect(phone.decoration?.hintText,'Enter 10-digit number');

      await tester.enterText(field,'9876543210');
      await tester.pump();
      expect(phone.controller!.text,'9876543210');

      phone.controller!.selection=const TextSelection.collapsed(offset:3);
      expect(phone.controller!.selection.baseOffset,3);
      tester.testTextInput.updateEditingValue(const TextEditingValue(
        text:'987543210',selection:TextSelection.collapsed(offset:3)));
      await tester.pump();
      expect(phone.controller!.text,'987543210');
      expect(phone.controller!.selection.baseOffset,3);
      tester.testTextInput.updateEditingValue(const TextEditingValue(
        text:'9876543210',selection:TextSelection.collapsed(offset:4)));
      await tester.pump();
      expect(phone.controller!.text,'9876543210');
      expect(phone.controller!.selection.baseOffset,4);

      // Paste/alphanumeric keyboard streams are cleaned to digits.
      tester.testTextInput.updateEditingValue(const TextEditingValue(
        text:'98abc76543210',selection:TextSelection.collapsed(offset:13)));
      await tester.pump();
      expect(phone.controller!.text,'9876543210');
      tester.testTextInput.updateEditingValue(const TextEditingValue(
        text:'98765432101234',selection:TextSelection.collapsed(offset:14)));
      await tester.pump();
      expect(phone.controller!.text,'9876543210');
    });
}
