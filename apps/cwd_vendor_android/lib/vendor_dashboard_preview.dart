import 'package:flutter/material.dart';
import 'vendor_demo_models.dart';

const teal = Color(0xFF1AA6A0);
const blue = Color(0xFF1B86A4);
const ink = Color(0xFF212733);
const muted = Color(0xFF6B7482);
const purple = Color(0xFF74658E);
const canvas = Color(0xFFF3F4F6);

String dateLabel(DateTime d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  final hour = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return d.day.toString() + ' ' + months[d.month - 1] + ' ' +
      d.year.toString() + ', ' + hour.toString() + ':' +
      d.minute.toString().padLeft(2, '0') + (d.hour < 12 ? ' AM' : ' PM');
}

String payout(int value) => '₹' + value.toString();
bool sameDate(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

BoxDecoration whiteCard() => BoxDecoration(
  color: Colors.white,
  borderRadius: BorderRadius.circular(19),
  border: Border.all(color: const Color(0xFFE0E3E7)),
  boxShadow: const [BoxShadow(color: Color(0x10000000),
    blurRadius: 9, offset: Offset(0, 3))],
);

Widget statusPill(String text) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(18),
    color: const Color(0xFFE3F4F3)),
  child: Text(text, style: const TextStyle(
    color: blue, fontSize: 11, fontWeight: FontWeight.w700)),
);

Widget detailLine(IconData icon, String value) => Padding(
  padding: const EdgeInsets.symmetric(vertical: 7),
  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Icon(icon, color: purple, size: 20),
    const SizedBox(width: 11),
    Expanded(child: Text(value,
      style: const TextStyle(color: ink, fontSize: 13, height: 1.4))),
  ]),
);

class VendorDashboardPreview extends StatefulWidget {
  const VendorDashboardPreview({super.key});
  @override
  State<VendorDashboardPreview> createState() => _VendorDashboardPreviewState();
}

class _VendorDashboardPreviewState extends State<VendorDashboardPreview> {
  late final List<VendorDemoVehicle> fleet = makeDemoVehicles();
  late final List<VendorDemoBooking> bookings = makeDemoBookings(fleet);
  int page = 0;
  VendorBookingStatus? filter;
  bool todayOnly = false;
  String vehicleId = 'dzire01';
  DateTime month = DateTime(DateTime.now().year, DateTime.now().month);

  int count(VendorBookingStatus status) =>
      bookings.where((b) => b.status == status).length;
  int get todayCount => bookings.where((b) =>
      sameDate(b.pickupAt, DateTime.now()) &&
      b.status == VendorBookingStatus.allocated).length;

  void goBookings({VendorBookingStatus? status, bool today = false}) {
    setState(() { page = 1; filter = status; todayOnly = today; });
  }

  Future<void> openBooking(VendorDemoBooking b) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => BookingPreview(
        booking: b, fleet: fleet, onChange: () {
          if (mounted) setState(() {});
        })));
    if (mounted) setState(() {});
  }

  void notify(String s) {
    if (mounted) ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(s)));
  }

  Widget demoNotice() => Container(
    padding: const EdgeInsets.all(12),
    margin: const EdgeInsets.only(bottom: 17),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF0D8),
      borderRadius: BorderRadius.circular(12)),
    child: const Row(children: [
      Icon(Icons.science_outlined, size: 21, color: Color(0xFF93641F)),
      SizedBox(width: 10),
      Expanded(child: Text('UI DEMO • Fictional data only. '
        'No real bookings or fleet records are changed.',
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
    ]),
  );

  Widget header() => Container(
    decoration: const BoxDecoration(
      gradient: LinearGradient(colors: [blue, teal])),
    padding: const EdgeInsets.fromLTRB(20, 19, 20, 24),
    child: Row(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(11),
        child: Image.asset('assets/images/cwd-logo.png',
          width: 54, height: 54, fit: BoxFit.cover,
          errorBuilder: (_, error, stack) =>
            const Icon(Icons.directions_car, size: 48, color: Colors.white)),
      ),
      const SizedBox(width: 12),
      const Expanded(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('CWD Vendor', style: TextStyle(fontSize: 23,
            fontWeight: FontWeight.w800, color: Colors.white)),
          Text('Car With Driver India',
            style: TextStyle(fontSize: 12, color: Color(0xFFE6FAF9))),
        ])),
      IconButton(onPressed: () => setState(() => page = 3),
        icon: const CircleAvatar(
          backgroundColor: Colors.white, radius: 21,
          child: Icon(Icons.person, color: teal, size: 27))),
    ]),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: canvas,
    body: SafeArea(child: Column(children: [
      header(),
      Expanded(child: switch (page) {
        0 => home(),
        1 => bookingList(),
        2 => fleetScreen(),
        _ => profileScreen(),
      }),
    ])),
    bottomNavigationBar: NavigationBar(
      height: 71,
      backgroundColor: Colors.white,
      selectedIndex: page,
      indicatorColor: const Color(0xFFD8F3F0),
      onDestinationSelected: (index) =>
          setState(() { page = index; filter = null; todayOnly = false; }),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.receipt_long_outlined),
          selectedIcon: Icon(Icons.receipt_long), label: 'Bookings'),
        NavigationDestination(icon: Icon(Icons.directions_car_outlined),
          selectedIcon: Icon(Icons.directions_car), label: 'Fleet'),
        NavigationDestination(icon: Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person), label: 'Profile'),
      ],
    ),
  );

  Widget homeCard(String title, IconData icon, int count, VoidCallback open) =>
      Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: whiteCard(),
        child: InkWell(
          onTap: open, borderRadius: BorderRadius.circular(19),
          child: Padding(padding: const EdgeInsets.symmetric(
            horizontal: 17, vertical: 23),
            child: Row(children: [
              Container(width: 46, height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F0FA),
                  borderRadius: BorderRadius.circular(11)),
                child: Icon(icon, color: purple, size: 25)),
              const SizedBox(width: 16),
              Expanded(child: Text(title,
                style: const TextStyle(fontSize: 17,
                  fontWeight: FontWeight.w600, color: ink))),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
                  color: const Color(0xFFF4E9FA)),
                child: Text(count.toString(), style: const TextStyle(
                  fontWeight: FontWeight.w800, color: purple))),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, color: ink),
            ]),
          ),
        ),
      );

  Widget home() => ListView(
    padding: const EdgeInsets.fromLTRB(17, 20, 17, 28),
    children: [
      demoNotice(),
      const Text('Vendor Operations', style: TextStyle(fontSize: 20,
        color: ink, fontWeight: FontWeight.w800)),
      const SizedBox(height: 7),
      const Text('Simple booking management, all in one place',
        style: TextStyle(color: muted, fontSize: 13)),
      const SizedBox(height: 16),
      homeCard('New Bookings', Icons.auto_awesome_outlined,
        count(VendorBookingStatus.newOffer),
        () => goBookings(status: VendorBookingStatus.newOffer)),
      homeCard("Today's Pickups", Icons.today_outlined, todayCount,
        () => goBookings(today: true)),
      homeCard('Ongoing Trips', Icons.route_outlined,
        count(VendorBookingStatus.ongoing),
        () => goBookings(status: VendorBookingStatus.ongoing)),
      homeCard('Completed', Icons.task_alt_outlined,
        count(VendorBookingStatus.completed),
        () => goBookings(status: VendorBookingStatus.completed)),
      homeCard('Cancelled Bookings', Icons.cancel_outlined,
        count(VendorBookingStatus.cancelled),
        () => goBookings(status: VendorBookingStatus.cancelled)),
    ],
  );

  Widget bookingList() {
    final list = bookings.where((b) {
      if (todayOnly) {
        return sameDate(b.pickupAt, DateTime.now()) &&
          b.status == VendorBookingStatus.allocated;
      }
      return filter == null || b.status == filter;
    }).toList()..sort((a, b) => a.pickupAt.compareTo(b.pickupAt));
    final filters = <VendorBookingStatus?>[
      null, VendorBookingStatus.newOffer, VendorBookingStatus.accepted,
      VendorBookingStatus.allocated, VendorBookingStatus.ongoing,
      VendorBookingStatus.completed, VendorBookingStatus.cancelled,
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 25),
      children: [
        demoNotice(),
        Row(children: [
          Expanded(child: Text(todayOnly ? "Today's Pickups" : 'All Bookings',
            style: const TextStyle(fontSize: 21,
              fontWeight: FontWeight.w800))),
          if (todayOnly) TextButton(
            onPressed: () => goBookings(), child: const Text('All')),
        ]),
        const SizedBox(height: 12),
        if (!todayOnly) SizedBox(height: 46,
          child: ListView(scrollDirection: Axis.horizontal,
            children: filters.map((item) => Padding(
              padding: const EdgeInsets.only(right: 7),
              child: ChoiceChip(
                selected: item == filter,
                selectedColor: const Color(0xFFD9F1EF),
                label: Text(item?.label ?? 'All'),
                onSelected: (_) => setState(() => filter = item)),
            )).toList(),
          )),
        const SizedBox(height: 12),
        if (list.isEmpty) const Padding(
          padding: EdgeInsets.symmetric(vertical: 65),
          child: Column(children: [
            Icon(Icons.directions_car_outlined, size: 65, color: muted),
            SizedBox(height: 17),
            Text('No Bookings', style: TextStyle(fontSize: 21,
              fontWeight: FontWeight.w800)),
            SizedBox(height: 7),
            Text('No demo bookings in this category.'),
          ]),
        ) else ...list.map(bookingCard),
      ],
    );
  }

  Widget bookingCard(VendorDemoBooking b) => Container(
    margin: const EdgeInsets.only(bottom: 13),
    padding: const EdgeInsets.all(17),
    decoration: whiteCard(),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(child: Text(b.id, style: const TextStyle(
            color: muted, fontSize: 12))),
          statusPill(b.status.label),
        ]),
        const SizedBox(height: 9),
        Text(b.carModel, style: const TextStyle(
          fontSize: 17, fontWeight: FontWeight.w800, color: ink)),
        const Divider(height: 23),
        detailLine(Icons.route_outlined, b.tripType),
        detailLine(Icons.calendar_month_outlined,
          dateLabel(b.pickupAt) + ' → ' + dateLabel(b.dropAt)),
        detailLine(Icons.location_on_outlined,
          b.pickupArea + ' → ' + b.dropArea),
        detailLine(Icons.currency_rupee_outlined,
          'Estimated Vendor Payout: ' + payout(b.payout)),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => openBooking(b),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(46)),
          child: const Text('View Details'),
        ),
      ],
    ),
  );

  VendorDemoVehicle get currentCar =>
      fleet.firstWhere((car) => car.id == vehicleId);

  Widget fleetScreen() => ListView(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
    children: [
      demoNotice(),
      const Text('Manage Fleet',
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 21)),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: whiteCard(),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Your Fleet', style: TextStyle(
              fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text('Select a car to manage availability',
              style: TextStyle(color: muted)),
            const SizedBox(height: 12),
            ...fleet.map((car) => ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFE9F6F5),
                child: Icon(Icons.directions_car, color: blue)),
              title: Text(car.number, style: const TextStyle(
                fontWeight: FontWeight.w800)),
              subtitle: Text(car.model),
              trailing: Icon(car.id == vehicleId
                ? Icons.check_circle : Icons.chevron_right,
                color: car.id == vehicleId ? teal : muted),
              onTap: () => setState(() => vehicleId = car.id),
            )),
          ],
        ),
      ),
      const SizedBox(height: 15),
      calendarCard(),
    ],
  );

  Widget calendarCard() {
    final car = currentCar;
    final first = DateTime(month.year, month.month);
    final offset = first.weekday % 7;
    final days = DateTime(first.year, first.month + 1, 0).day;
    final cells = ((offset + days + 6) ~/ 7) * 7;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun',
      'Jul','Aug','Sep','Oct','Nov','Dec'];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: whiteCard(),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(car.number, style: const TextStyle(
            fontWeight: FontWeight.w800, fontSize: 17)),
          const SizedBox(height: 10),
          const Wrap(spacing: 12, runSpacing: 7, children: [
            _Legend('Available', teal),
            _Legend('Booked', Color(0xFFC14450)),
            _Legend('Blocked', Color(0xFF606C7D)),
          ]),
          const SizedBox(height: 9),
          Row(children: [
            Expanded(child: Text(
              monthNames[first.month-1] + ' ' + first.year.toString(),
              style: const TextStyle(fontWeight: FontWeight.w800,
                fontSize: 17))),
            IconButton(
              icon: const Icon(Icons.chevron_left),
              onPressed: () => setState(() =>
                month = DateTime(month.year, month.month-1))),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () => setState(() =>
                month = DateTime(month.year, month.month+1))),
          ]),
          GridView.count(
            crossAxisCount: 7, childAspectRatio: 1,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 3, crossAxisSpacing: 3,
            children: [
              ...['S','M','T','W','T','F','S'].map(
                (label) => Center(child: Text(label,
                  style: const TextStyle(color: muted,
                    fontWeight: FontWeight.w700)))),
              ...List.generate(cells, (index) {
                final n = index - offset + 1;
                if (n < 1 || n > days) return const SizedBox.shrink();
                final day = DateTime(month.year, month.month, n);
                final booked = car.isBooked(day);
                final blocked = car.isBlocked(day);
                final color = booked ? const Color(0xFFB43C48) :
                  blocked ? const Color(0xFF606C7D) : teal;
                final bg = booked ? const Color(0xFFFFECEE) :
                  blocked ? const Color(0xFFE9EBEE) :
                  const Color(0xFFE7F6F3);
                return InkWell(
                  onTap: () => notify(booked ? 'Booked, cannot block.' :
                    blocked ? 'Blocked day.' : 'Available day.'),
                  child: Container(
                    decoration: BoxDecoration(
                      color: bg, borderRadius: BorderRadius.circular(8)),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(n.toString(), style: TextStyle(
                          color: color, fontWeight: FontWeight.w700)),
                        Container(width: 4, height: 4,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle, color: color)),
                      ],
                    ),
                  ),
                );
              }),
            ],
          ),
          const SizedBox(height: 14),
          const Text('Upcoming Blocks',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
          if (car.blocked.isEmpty)
            const Padding(padding: EdgeInsets.symmetric(vertical: 13),
              child: Text('No blocked dates.', style: TextStyle(color: muted)))
          else ...car.blocked.map((range) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.block_outlined),
            title: const Text('Block Period'),
            subtitle: Text(dateLabel(range.start).split(',').first +
              ' – ' + dateLabel(range.end).split(',').first),
            trailing: IconButton(
              tooltip: 'Delete block',
              icon: const Icon(Icons.delete_outline,
                color: Color(0xFFBF4250)),
              onPressed: () => setState(() => car.removeBlock(range))),
          )),
          const SizedBox(height: 9),
          FilledButton.icon(
            onPressed: blockCar,
            icon: const Icon(Icons.event_busy_outlined),
            label: const Text('Temporarily Block Car'),
            style: FilledButton.styleFrom(
              backgroundColor: teal, minimumSize: const Size.fromHeight(47))),
          const SizedBox(height: 8),
          const Text('Demo-only changes. Nothing is saved to the server.',
            style: TextStyle(color: muted, fontSize: 11)),
        ],
      ),
    );
  }

  Future<void> blockCar() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final range = await showDateRangePicker(
      context: context, firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
      helpText: 'Block a car',
    );
    if (range == null) return;
    try {
      setState(() => currentCar.block(range.start, range.end));
      notify('Date block saved in demo only.');
    } on StateError {
      notify('Your selection overlaps existing booked dates.');
    }
  }

  Widget profileScreen() => ListView(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 26),
    children: [
      demoNotice(),
      const Text('Manage Profile',
        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 21)),
      const SizedBox(height: 13),
      Container(
        padding: const EdgeInsets.all(18),
        decoration: whiteCard(),
        child: const Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Demo Vendor', style: TextStyle(
              fontSize: 20, fontWeight: FontWeight.w800)),
            SizedBox(height: 5),
            Text('CWD verification and login will be connected later',
              style: TextStyle(color: muted)),
            Divider(height: 30),
            Text('Vendor Reliability / Rating',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            SizedBox(height: 10),
            Row(children: [
              Icon(Icons.star_border, color: purple),
              SizedBox(width: 8),
              Text('Not rated yet', style: TextStyle(
                fontWeight: FontWeight.w700)),
            ]),
            SizedBox(height: 9),
            Text('Acceptance, cancellation and on-time performance '
              'will appear only after authenticated vendor data exists.',
              style: TextStyle(color: muted, fontSize: 12)),
          ],
        ),
      ),
      const SizedBox(height: 14),
      Container(
        decoration: whiteCard(),
        child: ListTile(
          leading: const Icon(Icons.directions_car, color: purple),
          title: const Text('Manage Fleet'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => setState(() => page = 2),
        ),
      ),
    ],
  );
}

class _Legend extends StatelessWidget {
  const _Legend(this.label, this.color);
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min, children: [
      CircleAvatar(radius: 5, backgroundColor: color),
      const SizedBox(width: 5),
      Text(label, style: const TextStyle(color: muted, fontSize: 12)),
    ],
  );
}

class BookingPreview extends StatefulWidget {
  const BookingPreview({
    super.key,
    required this.booking,
    required this.fleet,
    required this.onChange,
  });
  final VendorDemoBooking booking;
  final List<VendorDemoVehicle> fleet;
  final VoidCallback onChange;
  @override
  State<BookingPreview> createState() => _BookingPreviewState();
}

class _BookingPreviewState extends State<BookingPreview> {
  String? selected;
  @override
  void initState() {
    super.initState();
    selected = widget.booking.selectedVehicleId;
  }

  void inform(String s) =>
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(s)));

  Future<void> accept() async {
    if (selected == null) {
      inform('Select a matching car before accepting.');
      return;
    }
    final answer = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Accept this offer?'),
        content: Text('The estimated payout remains ' +
          payout(widget.booking.payout) +
          '. Customer contact details unlock only after CWD admin allotment.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Back')),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Accept')),
        ],
      ),
    );
    if (answer != true) return;
    setState(() => widget.booking.acceptWithVehicle(selected!));
    widget.onChange();
    inform('Demo accepted; awaiting CWD admin allotment.');
  }

  Future<void> cancel() async {
    String? reason;
    final details = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true,
      showDragHandle: true,
      builder: (sheet) => StatefulBuilder(
        builder: (context, update) => Padding(
          padding: EdgeInsets.fromLTRB(
            19, 7, 19, MediaQuery.viewInsetsOf(context).bottom + 20),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Cancel Booking', style: TextStyle(
                  fontSize: 21, fontWeight: FontWeight.w800)),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: reason,
                  decoration: const InputDecoration(
                    labelText: 'Cancellation reason *',
                    border: OutlineInputBorder()),
                  items: cancellationReasons.map((item) =>
                    DropdownMenuItem(value: item, child: Text(item))).toList(),
                  onChanged: (value) => update(() => reason = value),
                ),
                if (reason == 'Other') ...[
                  const SizedBox(height: 11),
                  TextField(
                    controller: details, minLines: 2, maxLines: 3,
                    onChanged: (_) => update(() {}),
                    decoration: const InputDecoration(
                      hintText: 'Write your reason',
                      border: OutlineInputBorder()),
                  ),
                ],
                const SizedBox(height: 15),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF0DA),
                    borderRadius: BorderRadius.circular(12)),
                  child: const Row(children: [
                    Icon(Icons.warning_amber_rounded,
                      color: Color(0xFF95601F)),
                    SizedBox(width: 9),
                    Expanded(child: Text(
                      'Frequent booking cancellations can reduce your '
                      'chance of receiving future bookings.',
                      style: TextStyle(fontSize: 13,
                        fontWeight: FontWeight.w700))),
                  ]),
                ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: reason == null || 
                    (reason == 'Other' && details.text.trim().isEmpty)
                    ? null : () => Navigator.pop(sheet, true),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    backgroundColor: const Color(0xFFBB4551)),
                  child: Text(widget.booking.isAllotted
                    ? 'Request Admin Cancellation' : 'Confirm Cancel')),
                TextButton(
                  onPressed: () => Navigator.pop(sheet, false),
                  child: const Text('Go Back')),
              ],
            ),
          ),
        ),
      ),
    );
    final note = details.text;
    details.dispose();
    if (confirmed != true || reason == null || !mounted) return;
    setState(() => widget.booking.cancel(
      reason: reason!, note: note));
    widget.onChange();
    inform(widget.booking.cancellationRequested
      ? 'Demo: admin approval required for cancellation.'
      : 'Cancelled in demo only.');
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.booking;
    final canAccept = b.status == VendorBookingStatus.newOffer;
    final canCancel = canAccept ||
      b.status == VendorBookingStatus.accepted ||
      b.status == VendorBookingStatus.allocated;
    final options = widget.fleet.where((car) =>
      b.matchingVehicleIds.contains(car.id)).toList();
    return Scaffold(
      backgroundColor: canvas,
      appBar: AppBar(
        title: const Text('Booking Details'),
        foregroundColor: Colors.white,
        flexibleSpace: Container(decoration: const BoxDecoration(
          gradient: LinearGradient(colors: [blue, teal]))),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF0D8),
              borderRadius: BorderRadius.circular(12)),
            child: const Text('UI DEMO • No live booking actions',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
          ),
          const SizedBox(height: 13),
          Container(
            decoration: whiteCard(), padding: const EdgeInsets.all(17),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: Text(b.id, style: const TextStyle(
                    color: muted))),
                  statusPill(b.status.label),
                ]),
                const SizedBox(height: 12),
                Text(b.carModel, style: const TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 20)),
                const Divider(height: 25),
                detailLine(Icons.route_outlined, b.tripType),
                detailLine(Icons.calendar_today_outlined,
                  'Pickup: ' + dateLabel(b.pickupAt)),
                detailLine(Icons.event_available_outlined,
                  'Return / Drop: ' + dateLabel(b.dropAt)),
                detailLine(Icons.location_on_outlined,
                  'Pickup Area: ' + b.pickupArea),
                detailLine(Icons.flag_outlined,
                  'Destination Area: ' + b.dropArea),
                const Divider(height: 26),
                const Text('Estimated Vendor Payout',
                  style: TextStyle(fontSize: 13, color: muted)),
                Text(payout(b.payout), style: const TextStyle(
                  fontSize: 27, color: teal, fontWeight: FontWeight.w900)),
                const SizedBox(height: 5),
                const Text('Matching car selection does not change payout.',
                  style: TextStyle(fontSize: 12, color: muted)),
              ],
            ),
          ),
          const SizedBox(height: 13),
          Container(
            decoration: whiteCard(), padding: const EdgeInsets.all(17),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.isAllotted
                    ? 'Customer & Trip Details'
                    : 'Customer Details Locked',
                  style: const TextStyle(fontWeight: FontWeight.w800,
                    fontSize: 17)),
                const SizedBox(height: 10),
                if (!b.isAllotted) const Row(children: [
                  Icon(Icons.lock_outline, color: purple),
                  SizedBox(width: 9),
                  Expanded(child: Text('Only general areas are visible. '
                    'Customer name, phone and exact addresses remain hidden '
                    'until admin allocation.',
                    style: TextStyle(fontSize: 13, color: muted))),
                ]) else const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Demo customer · personal details masked'),
                    SizedBox(height: 6),
                    Text('Full pickup and drop details become available '
                      'here after verified CWD allocation.'),
                  ],
                ),
              ],
            ),
          ),
          if (options.isNotEmpty) ...[
            const SizedBox(height: 13),
            Container(
              decoration: whiteCard(), padding: const EdgeInsets.all(17),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Select Matching Car',
                    style: TextStyle(fontSize: 17,
                      fontWeight: FontWeight.w800)),
                  const SizedBox(height: 7),
                  const Text('Only compatible registered cars are listed.',
                    style: TextStyle(fontSize: 13, color: muted)),
                  const SizedBox(height: 11),
                  DropdownButtonFormField<String>(
                    initialValue: selected,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Matching vehicle'),
                    items: options.map((v) =>
                      DropdownMenuItem(value: v.id, child: Text(
                        v.model + ' · ' + v.number,
                        overflow: TextOverflow.ellipsis))).toList(),
                    onChanged: canAccept
                      ? (value) => setState(() => selected = value)
                      : null,
                  ),
                ],
              ),
            ),
          ],
          if (b.cancellationRequested) const Padding(
            padding: EdgeInsets.symmetric(vertical: 13),
            child: Text('Cancellation requested — awaiting CWD approval',
              style: TextStyle(color: Color(0xFF98621D),
                fontWeight: FontWeight.w700)),
          ),
          if (canAccept) ...[
            const SizedBox(height: 17),
            FilledButton.icon(
              onPressed: accept,
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Accept Booking'),
              style: FilledButton.styleFrom(
                backgroundColor: teal,
                minimumSize: const Size.fromHeight(50))),
          ],
          if (b.status == VendorBookingStatus.accepted) const Padding(
            padding: EdgeInsets.symmetric(vertical: 15),
            child: Text('Accepted. Waiting for CWD admin allotment.',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, color: teal)),
          ),
          if (canCancel && !b.cancellationRequested) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: cancel,
              icon: const Icon(Icons.cancel_outlined),
              label: Text(b.isAllotted
                ? 'Request Cancellation' : 'Cancel Booking'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                foregroundColor: const Color(0xFFB84550))),
          ],
        ],
      ),
    );
  }
}
