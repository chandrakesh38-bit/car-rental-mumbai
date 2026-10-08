import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cwd_vendor_android/cwd_partner_splash.dart';

void main() {
  testWidgets('CWD Partner skyline splash displays immediately and opens login',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: CwdPartnerSplash(
          child: Scaffold(body: Center(child: Text('Vendor login ready'))),
        ),
      ),
    );

    expect(find.byKey(const Key('cwd-partner-splash-screen')), findsOneWidget);
    expect(find.byKey(const Key('cwd-circular-logo')), findsOneWidget);
    expect(find.text('CWD Partner'), findsOneWidget);
    expect(find.text('Vendor login ready'), findsNothing);

    await tester.pump(const Duration(milliseconds: 2400));
    await tester.pumpAndSettle();
    expect(find.text('Vendor login ready'), findsOneWidget);
    expect(find.byKey(const Key('cwd-partner-splash-screen')), findsNothing);
  });

  testWidgets('Splash does not wait for an arbitrary extra delay',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: CwdPartnerSplash(
          duration: Duration(milliseconds: 250),
          child: Text('Ready'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('Ready'), findsOneWidget);
  });
}
