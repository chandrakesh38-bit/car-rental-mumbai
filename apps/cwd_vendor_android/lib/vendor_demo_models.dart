/// Internal UX fixtures only. No database, customer, token or network access.
enum VendorBookingStatus {
  newOffer,
  accepted,
  allocated,
  ongoing,
  completed,
  cancelled,
}

extension VendorBookingStatusText on VendorBookingStatus {
  String get label => switch (this) {
        VendorBookingStatus.newOffer => 'New Offer',
        VendorBookingStatus.accepted => 'Accepted',
        VendorBookingStatus.allocated => 'Allocated',
        VendorBookingStatus.ongoing => 'Ongoing',
        VendorBookingStatus.completed => 'Completed',
        VendorBookingStatus.cancelled => 'Cancelled',
      };
}

const cancellationReasons = <String>[
  'Vehicle unavailable',
  'Driver unavailable',
  'Already committed on another trip',
  'Vehicle under maintenance',
  'Out of service area',
  'Payout issue',
  'Personal emergency',
  'Other',
];

class VendorDemoBooking {
  VendorDemoBooking({
    required this.id,
    required this.carModel,
    required this.pickupArea,
    required this.dropArea,
    required this.pickupAt,
    required this.dropAt,
    required this.tripType,
    required this.payout,
    required this.matchingVehicleIds,
    required this.status,
    this.selectedVehicleId,
    this.cancelReason,
    this.cancelNote,
    this.cancellationRequested = false,
    this.adminCancellationAllowed = false,
    this.includedKm = 240,
    this.extraKmRate = 11,
    this.extraHourRate = 100,
    this.nightRate = 300,
    this.customerName,
    this.customerMobile,
    this.fullPickupAddress,
    this.fullDropAddress,
    this.finalEarning,
  });

  final String id;
  final String carModel;
  final String pickupArea;
  final String dropArea;
  final DateTime pickupAt;
  final DateTime dropAt;
  final String tripType;
  final int payout;
  final List<String> matchingVehicleIds;
  VendorBookingStatus status;
  String? selectedVehicleId;
  String? cancelReason;
  String? cancelNote;
  bool cancellationRequested;
  bool adminCancellationAllowed;
  final int includedKm;
  final int extraKmRate;
  final int extraHourRate;
  final int nightRate;
  final String? customerName;
  final String? customerMobile;
  final String? fullPickupAddress;
  final String? fullDropAddress;
  final VendorDemoEarning? finalEarning;

  bool get canCancel => status == VendorBookingStatus.newOffer ||
      (adminCancellationAllowed &&
          (status == VendorBookingStatus.accepted ||
           status == VendorBookingStatus.allocated));
  bool get isCompleted => status == VendorBookingStatus.completed;
  int? get approvedFinalEarning =>
      isCompleted ? finalEarning?.total : null;

  /// Admin permission comes from a verified backend response.
  /// Never expose an owner-toggle control in vendor screens.
  void setAdminCancellationPermission(bool allowed) {
    adminCancellationAllowed = allowed;
  }

  bool get isAllotted => switch (status) {
        VendorBookingStatus.allocated ||
        VendorBookingStatus.ongoing ||
        VendorBookingStatus.completed => true,
        _ => false,
      };

  /// Crucial: never construct the pre-allocation response from raw route text.
  /// The full customer address/contact must be supplied by the backend only
  /// after it has checked that this vendor owns the active allocation.
  Map<String, Object?> visibleSummary() => {
        'booking_id': id,
        'vehicle_required': carModel,
        'pickup_area': pickupArea,
        'destination_area': dropArea,
        'pickup_at': pickupAt.toIso8601String(),
        'return_at': dropAt.toIso8601String(),
        'trip_type': tripType,
        'estimated_vendor_payout': payout,
        'status': status.label,
        'selected_vendor_vehicle_id': selectedVehicleId,
        // No customer name, phone, or exact address in offer summaries.
      };

  /// Car choice is informational and NEVER changes an accepted offer payout.
  void acceptWithVehicle(String vehicleId) {
    if (status != VendorBookingStatus.newOffer) {
      throw StateError('Only a new offer can be accepted.');
    }
    if (!matchingVehicleIds.contains(vehicleId)) {
      throw ArgumentError('Choose an eligible matching vehicle.');
    }
    selectedVehicleId = vehicleId;
    status = VendorBookingStatus.accepted;
  }

  void cancel({required String reason, String note = ''}) {
    final cleaned = note.trim();
    if (!cancellationReasons.contains(reason)) {
      throw ArgumentError('A valid cancellation reason is required.');
    }
    if (reason == 'Other' && cleaned.isEmpty) {
      throw ArgumentError('Please specify the cancellation reason.');
    }
    if (!canCancel) {
      throw StateError('Cancellation is locked. Only CWD admin can enable it.');
    }
    cancelReason = reason;
    cancelNote = cleaned.isEmpty ? null : cleaned;
    if (status == VendorBookingStatus.allocated) {
      cancellationRequested = true;
      adminCancellationAllowed = false;
    } else {
      status = VendorBookingStatus.cancelled;
      adminCancellationAllowed = false;
    }
  }
}

/// Fictional UI amounts only. Real totals must use approved settlement ledger.
class VendorDemoEarning {
  const VendorDemoEarning({
    required this.fixedKm,
    required this.fixedFare,
    this.driverAllowance = 0,
    this.extraKm = 0,
    this.extraKmRate = 0,
    this.extraHours = 0,
    this.extraHourRate = 0,
    this.nights = 0,
    this.nightRate = 0,
    this.toll = 0,
    this.parking = 0,
    this.stateTax = 0,
    this.otherApproved = 0,
    this.deductions = 0,
  });

  final int fixedKm;
  final int fixedFare;
  final int driverAllowance;
  final int extraKm;
  final int extraKmRate;
  final int extraHours;
  final int extraHourRate;
  final int nights;
  final int nightRate;
  final int toll;
  final int parking;
  final int stateTax;
  final int otherApproved;
  final int deductions;

  int get extraKmFare => extraKm * extraKmRate;
  int get extraHoursFare => extraHours * extraHourRate;
  int get nightFare => nights * nightRate;
  int get total => fixedFare + driverAllowance + extraKmFare +
      extraHoursFare + nightFare + toll + parking + stateTax +
      otherApproved - deductions;
}

class VendorDemoVehicle {
  VendorDemoVehicle({
    required this.id,
    required this.model,
    required this.number,
    List<DateTimeRangeDemo>? booked,
  }) : booked = booked ?? [];

  final String id;
  final String model;
  final String number;
  final List<DateTimeRangeDemo> booked;
  final List<DateTimeRangeDemo> blocked = [];

  bool isBooked(DateTime day) => booked.any((range) => range.includes(day));
  bool isBlocked(DateTime day) => blocked.any((range) => range.includes(day));
  bool canBlock(DateTime from, DateTime to) {
    final proposed = DateTimeRangeDemo(from, to);
    return !booked.any((range) => range.overlaps(proposed));
  }

  void block(DateTime from, DateTime to) {
    if (!canBlock(from, to)) {
      throw StateError('Booked dates cannot be blocked.');
    }
    blocked.add(DateTimeRangeDemo(from, to));
  }

  void removeBlock(DateTimeRangeDemo block) => blocked.remove(block);
}

class DateTimeRangeDemo {
  const DateTimeRangeDemo(this.start, this.end);
  final DateTime start;
  final DateTime end;

  static DateTime day(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  bool includes(DateTime date) {
    final d = day(date);
    return !d.isBefore(day(start)) && !d.isAfter(day(end));
  }

  bool overlaps(DateTimeRangeDemo other) {
    return !day(end).isBefore(day(other.start)) &&
        !day(other.end).isBefore(day(start));
  }
}

/// Explicitly fictional bookings. They are never synced to CWD.
List<VendorDemoBooking> makeDemoBookings(List<VendorDemoVehicle> cars) {
  final now = DateTime.now();
  DateTime on(int addDays, int hour) =>
      DateTime(now.year, now.month, now.day + addDays, hour);
  return [
    VendorDemoBooking(
      id: 'DEMO-OFFER-001',
      carModel: 'Maruti Suzuki Dzire',
      pickupArea: 'Vikhroli, Mumbai',
      dropArea: 'Pune',
      pickupAt: on(2, 7),
      dropAt: on(2, 21),
      tripType: 'Outstation · Round Trip',
      payout: 4400,
      matchingVehicleIds: const ['dzire01', 'dzire02'],
      status: VendorBookingStatus.newOffer,
    ),
    VendorDemoBooking(
      id: 'DEMO-OFFER-002',
      carModel: 'Maruti Suzuki Dzire',
      pickupArea: 'Powai, Mumbai',
      dropArea: 'Lonavala',
      pickupAt: on(4, 6),
      dropAt: on(4, 18),
      tripType: 'Outstation · One Way',
      payout: 3200,
      matchingVehicleIds: const ['dzire01', 'dzire02'],
      status: VendorBookingStatus.newOffer,
    ),
    VendorDemoBooking(
      id: 'DEMO-ALLOC-003',
      carModel: 'Kia Carens',
      pickupArea: 'Bandra, Mumbai',
      dropArea: 'Nashik',
      pickupAt: on(0, 10),
      dropAt: on(1, 19),
      tripType: 'Outstation · Round Trip',
      payout: 6800,
      matchingVehicleIds: const ['carens01'],
      selectedVehicleId: 'carens01',
      status: VendorBookingStatus.allocated,
      customerName: 'Demo Customer',
      customerMobile: '0000000000',
      fullPickupAddress: 'Bandra Kurla Complex, Mumbai, Maharashtra',
      fullDropAddress: 'Nashik, Maharashtra',
      includedKm: 480,
      extraKmRate: 12,
      extraHourRate: 100,
      nightRate: 300,
    ),
    VendorDemoBooking(
      id: 'DEMO-TRIP-004',
      carModel: 'Maruti Suzuki Dzire',
      pickupArea: 'Thane',
      dropArea: 'Mumbai Airport',
      pickupAt: on(-1, 12),
      dropAt: on(0, 17),
      tripType: 'Airport · One Way',
      payout: 2500,
      matchingVehicleIds: const ['dzire02'],
      selectedVehicleId: 'dzire02',
      status: VendorBookingStatus.ongoing,
      customerName: 'Demo Customer',
      customerMobile: '0000000000',
      fullPickupAddress: 'Thane Station, Thane, Maharashtra',
      fullDropAddress: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
      includedKm: 80,
      extraKmRate: 12,
      extraHourRate: 100,
      nightRate: 300,
    ),
    VendorDemoBooking(
      id: 'DEMO-DONE-005',
      carModel: 'Kia Carens',
      pickupArea: 'Navi Mumbai',
      dropArea: 'Alibaug',
      pickupAt: on(-4, 9),
      dropAt: on(-3, 20),
      tripType: 'Outstation · Round Trip',
      payout: 6100,
      matchingVehicleIds: const ['carens01'],
      status: VendorBookingStatus.completed,
      customerName: 'Demo Customer',
      customerMobile: '0000000000',
      fullPickupAddress: 'Nerul, Navi Mumbai, Maharashtra',
      fullDropAddress: 'Alibaug, Maharashtra',
      includedKm: 480,
      extraKmRate: 12,
      extraHourRate: 100,
      nightRate: 300,
      finalEarning: const VendorDemoEarning(
        fixedKm: 480,
        fixedFare: 4000,
        driverAllowance: 600,
        extraKm: 30,
        extraKmRate: 12,
        extraHours: 0, // Outstation has no separate hourly extras
        extraHourRate: 100,
        toll: 700,
        parking: 150,
        stateTax: 290,
      ),
    ),
    VendorDemoBooking(
      id: 'DEMO-CANCEL-006',
      carModel: 'Maruti Suzuki Dzire',
      pickupArea: 'Andheri, Mumbai',
      dropArea: 'Shirdi',
      pickupAt: on(3, 6),
      dropAt: on(3, 21),
      tripType: 'Outstation · Round Trip',
      payout: 4700,
      matchingVehicleIds: const ['dzire01'],
      status: VendorBookingStatus.cancelled,
      cancelReason: 'Vehicle unavailable',
    ),
  ];
}

List<VendorDemoVehicle> makeDemoVehicles() {
  final now = DateTime.now();
  DateTime on(int add) => DateTime(now.year, now.month, now.day + add);
  return [
    VendorDemoVehicle(
      id: 'dzire01', model: 'Maruti Suzuki Dzire', number: 'DEMO-MH01-0001',
      booked: [DateTimeRangeDemo(on(7), on(8))],
    ),
    VendorDemoVehicle(
      id: 'dzire02', model: 'Maruti Suzuki Dzire', number: 'DEMO-MH01-0002',
      booked: [DateTimeRangeDemo(on(-1), on(0))],
    ),
    VendorDemoVehicle(
      id: 'carens01', model: 'Kia Carens', number: 'DEMO-MH01-0003',
      booked: [DateTimeRangeDemo(on(0), on(1))],
    ),
  ];
}
