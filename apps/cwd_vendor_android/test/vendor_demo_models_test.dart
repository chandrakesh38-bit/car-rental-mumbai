import 'package:cwd_vendor_android/vendor_demo_models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final cars = makeDemoVehicles();

  test('Offer summary has area only, no PII keys', () {
    final booking = makeDemoBookings(cars).first;
    final safe = booking.visibleSummary();
    expect(safe['pickup_area'], 'Vikhroli, Mumbai');
    expect(safe.containsKey('exact_pickup'), isFalse);
    expect(safe.containsKey('customer_phone'), isFalse);
    expect(safe.containsKey('customer_name'), isFalse);
    expect(booking.isAllotted, isFalse);
  });

  test('Accept requires a matching car and does not change payout', () {
    final booking = makeDemoBookings(cars).first;
    final payout = booking.payout;
    expect(() => booking.acceptWithVehicle('carens01'), throwsArgumentError);
    booking.acceptWithVehicle('dzire02');
    expect(booking.status, VendorBookingStatus.accepted);
    expect(booking.selectedVehicleId, 'dzire02');
    expect(booking.payout, payout);
    expect(booking.isAllotted, isFalse);
  });

  test('Cancellation needs a reason, Other needs notes', () {
    final booking = makeDemoBookings(cars).first;
    expect(() => booking.cancel(reason: ''), throwsArgumentError);
    expect(() => booking.cancel(reason: 'Other'), throwsArgumentError);
    booking.cancel(reason: 'Other', note: 'Fixture reason');
    expect(booking.status, VendorBookingStatus.cancelled);
    expect(booking.cancelNote, 'Fixture reason');
  });

  test('After Accept, Cancel is locked until verified admin enables', () {
    final booking = makeDemoBookings(cars).first;
    booking.acceptWithVehicle('dzire01');
    expect(booking.canCancel, isFalse);
    expect(() => booking.cancel(reason: 'Driver unavailable'), throwsStateError);
    booking.setAdminCancellationPermission(true);
    expect(booking.canCancel, isTrue);
    booking.cancel(reason: 'Driver unavailable');
    expect(booking.status, VendorBookingStatus.cancelled);
  });

  test('Allocated cancellation is locked until admin enables', () {
    final booking = makeDemoBookings(cars)
        .firstWhere((b) => b.status == VendorBookingStatus.allocated);
    expect(booking.canCancel, isFalse);
    expect(() => booking.cancel(reason: 'Driver unavailable'), throwsStateError);
    booking.setAdminCancellationPermission(true);
    booking.cancel(reason: 'Driver unavailable');
    expect(booking.status, VendorBookingStatus.allocated);
    expect(booking.cancellationRequested, isTrue);
    expect(booking.isAllotted, isTrue);
  });

  test('Completed breakdown is internally consistent and final is separate', () {
    final done = makeDemoBookings(cars)
        .firstWhere((b) => b.status == VendorBookingStatus.completed);
    expect(done.finalEarning?.fixedKm, 480);
    expect(done.finalEarning?.extraKmFare, 360);
    expect(done.finalEarning?.extraHoursFare, 0);
    expect(done.finalEarning?.toll, 700);
    expect(done.finalEarning?.parking, 150);
    expect(done.finalEarning?.total, 6100);
    expect(done.approvedFinalEarning, 6100);
    const localExtras = VendorDemoEarning(
      fixedKm: 80, fixedFare: 1900, extraHours: 2,
      extraHourRate: 100, extraKm: 10, extraKmRate: 13);
    expect(localExtras.extraHoursFare, 200);
    expect(localExtras.extraKmFare, 130);
    final open = makeDemoBookings(cars).first;
    expect(open.approvedFinalEarning, isNull);
  });

  test('Booked days cannot be blocked', () {
    final car = makeDemoVehicles().first;
    final booked = car.booked.first;
    expect(car.canBlock(booked.start, booked.end), isFalse);
    expect(() => car.block(booked.start, booked.end), throwsStateError);
    final future = DateTime.now().add(const Duration(days: 60));
    car.block(future, future);
    expect(car.isBlocked(future), isTrue);
    car.removeBlock(car.blocked.single);
    expect(car.isBlocked(future), isFalse);
  });

  test('Completed and Cancelled remain separate statuses', () {
    final items = makeDemoBookings(cars);
    expect(
      items.where((b) => b.status == VendorBookingStatus.completed).length,
      1,
    );
    expect(
      items.where((b) => b.status == VendorBookingStatus.cancelled).length,
      1,
    );
  });
}
