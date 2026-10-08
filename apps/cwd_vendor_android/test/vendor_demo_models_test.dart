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

  test('Allocated cancellation requires admin approval', () {
    final booking = makeDemoBookings(cars)
        .firstWhere((b) => b.status == VendorBookingStatus.allocated);
    booking.cancel(reason: 'Driver unavailable');
    expect(booking.status, VendorBookingStatus.allocated);
    expect(booking.cancellationRequested, isTrue);
    expect(booking.isAllotted, isTrue);
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
