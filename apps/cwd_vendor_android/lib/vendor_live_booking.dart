import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'vendor_live_api.dart';
import 'vendor_live_dashboard.dart';
import 'vendor_live_trip.dart';

class VendorLiveBooking extends StatefulWidget {
  const VendorLiveBooking({super.key,required this.api,required this.booking,
    required this.isAllocation,required this.allowChanges,required this.onChanged});
  final VendorLiveApi api;
  final Map<String,dynamic> booking;
  final bool isAllocation;
  final bool allowChanges;
  final Future<void> Function() onChanged;
  @override
  State<VendorLiveBooking> createState()=>_VendorLiveBookingState();
}
class _VendorLiveBookingState extends State<VendorLiveBooking> {
  bool busy=false;
  Map<String,dynamic> get item=>widget.booking;
  Map<String,dynamic> data(dynamic val)=>val is Map
    ?Map<String,dynamic>.from(val):<String,dynamic>{};
  String val(dynamic x)=>x?.toString()??'';
  void inform(String message){
    if(mounted)ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content:Text(message)));
  }
  Future<void> perform(String action,Map<String,dynamic> payload)async {
    if(!widget.allowChanges){inform('CWD activation pending.');return;}
    if(busy)return;
    setState(()=>busy=true);
    try {
      await widget.api.action(action,payload);
      await widget.onChanged();
      if(mounted)Navigator.pop(context,true);
    }catch(e){inform(e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> accept() async {
    final available=(item['selectable_vehicles'] as List? ??[])
      .whereType<Map>().map((x)=>Map<String,dynamic>.from(x)).toList();
    if(available.isEmpty){inform('No approved matching car. Contact CWD.');return;}
    String selected=val(available.first['id']);
    final yes=await showDialog<bool>(context:context,
      builder:(ctx)=>StatefulBuilder(builder:(ctx,setDialog)=>
        AlertDialog(title:const Text('Accept Booking'),
          content:Column(mainAxisSize:MainAxisSize.min,children:[
            const Text('Select your registered matching car. '
              'Payout stays unchanged.'),
            DropdownButtonFormField<String>(
              initialValue:selected,
              isExpanded:true,
              items:available.map((car)=>DropdownMenuItem<String>(
                value:val(car['id']),
                child:Text(val(car['vehicle_number'])+' · '+
                  val(car['make_model']),overflow:TextOverflow.ellipsis))).toList(),
              onChanged:(choice)=>setDialog(()=>selected=choice??selected)),
            const Text('Cancellation will be locked after acceptance.',
              style:TextStyle(fontSize:12,color:partnerMuted)),
          ]),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(ctx,false),
              child:const Text('Back')),
            FilledButton(onPressed:()=>Navigator.pop(ctx,true),
              child:const Text('Confirm Accept')),
          ])));
    if(yes==true)await perform('respond_offer',{
      'offer_id':item['id'],'response':'accepted','vehicle_id':selected});
  }
  Future<void> decline({bool accepted=false})async{
    const reasons=['Car unavailable','Driver unavailable',
      'Already booked','Other'];
    String reason='Car unavailable';
    final field=TextEditingController();
    final ok=await showDialog<bool>(context:context,
      builder:(ctx)=>StatefulBuilder(builder:(ctx,setDialog)=>
        AlertDialog(title:Text(accepted?'Cancel Booking':'Decline Booking'),
          content:Column(mainAxisSize:MainAxisSize.min,children:[
            const Text('Frequent cancellations may reduce future offers.',
              style:TextStyle(fontSize:12)),
            DropdownButtonFormField<String>(
              initialValue:reason,
              items:reasons.map((r)=>DropdownMenuItem(
                value:r,child:Text(r))).toList(),
              onChanged:(v)=>setDialog(()=>reason=v??reason)),
            if(reason=='Other')TextField(controller:field,
              decoration:const InputDecoration(labelText:'Reason')),
          ]),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(ctx,false),
              child:const Text('Back')),
            FilledButton(onPressed:()=>Navigator.pop(ctx,true),
              child:const Text('Confirm')),
          ])));
    final why=reason=='Other'?field.text.trim():reason;
    field.dispose();
    if(ok==true&&why.isNotEmpty){
      await perform(accepted?'cancel_accepted_offer':'respond_offer',{
        'offer_id':item['id'],'reason':why,
        if(!accepted)'response':'declined',
      });
    }
  }
  Future<void> mapTo(String address)async{
    final link=Uri.parse('https://www.google.com/maps/dir/?api=1&destination='+
      Uri.encodeComponent(address));
    await launchUrl(link,mode:LaunchMode.externalApplication);
  }
  Widget row(String label,dynamic value)=>Padding(
    padding:const EdgeInsets.symmetric(vertical:6),
    child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      SizedBox(width:112,child:Text(label,
        style:const TextStyle(fontSize:12,color:partnerMuted))),
      Expanded(child:Text(val(value),style:
        const TextStyle(fontWeight:FontWeight.w600,fontSize:13))),
    ]),
  );
  Widget group(String title,List<Widget> content)=>Card(
    color:Colors.white,
    margin:const EdgeInsets.symmetric(horizontal:13,vertical:8),
    child:Padding(padding:const EdgeInsets.all(16),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontSize:18,
          fontWeight:FontWeight.w800,color:partnerInk)),
        const SizedBox(height:10),...content,
      ])));
  Widget navButton(String label,String where)=>FilledButton.icon(
    style:FilledButton.styleFrom(backgroundColor:partnerTeal,
      minimumSize:const Size.fromHeight(45)),
    onPressed:where.trim().isEmpty?null:()=>mapTo(where),
    icon:const Icon(Icons.navigation),label:Text(label));
  @override
  Widget build(BuildContext context){
    final allocated=widget.isAllocation;
    final customer=data(item['customer']),rates=data(item['pricing']);
    final earning=data(item['final_earning']);
    final status=val(item['status']);
    return Scaffold(
      backgroundColor:partnerSurface,
      appBar:AppBar(backgroundColor:partnerTeal,foregroundColor:Colors.white,
        title:Text('Booking · '+status)),
      body:busy?const Center(child:CircularProgressIndicator()):
        ListView(children:[
          group('Booking Details',[
            row('Booking ID',item['booking_id']),
            row('Trip Type',item['trip_type']),
            row('Vehicle',item['vehicle_required']),
            row('Estimated Earning',money(item['estimated_payout'])),
            row('Pickup',allocated?item['pickup_at']:item['start_at']),
            row('Final Drop',item['final_drop_at']),
          ]),
          group('Rates',[
            row('KM/day',rates['minimum_km_per_day']),
            row('Rate/KM',money(rates['vendor_km_rate'])),
            row('Driver Allowance',money(rates['vendor_da'])),
            row('Night',money(rates['vendor_night'])),
          ]),
          if(!allocated)group('Pickup & Destination',[
            row('Pickup Area',item['pickup_area']),
            row('Destination Area',item['destination_area']),
            if(status=='offered')...[
              FilledButton(onPressed:widget.allowChanges?accept:null,
                child:const Text('Accept Booking')),
              OutlinedButton(onPressed:widget.allowChanges
                ?()=>decline():null,child:const Text('Decline Booking')),
            ],
            if(status=='accepted')...[
              const Text('Waiting for CWD admin allocation.'),
              OutlinedButton(onPressed:
                item['cancel_unlocked']==true&&widget.allowChanges
                  ?()=>decline(accepted:true):null,
                child:const Text('Cancel Locked · Admin Control')),
            ],
          ]),
          if(allocated)group('Customer & Trip Details',[
            row('Customer',customer['customer_name']),
            TextButton.icon(icon:const Icon(Icons.phone),
              onPressed:()=>launchUrl(Uri(scheme:'tel',
                path:val(customer['customer_mobile']))),
              label:Text(val(customer['customer_mobile']))),
            row('Pickup Address',customer['pickup_address']),
            navButton('Navigate to Pickup',val(customer['pickup_address'])),
            const Divider(height:25),
            row('Destination',customer['drop_address']),
            navButton('Navigate to Destination',val(customer['drop_address'])),
            const Divider(height:25),
            row('Vehicle Plate',item['vehicle_number']),
            row('Driver',item['driver_name']),
            row('Driver Mobile',item['driver_mobile']),
            if(status=='allocated'||status=='ongoing')
              OutlinedButton.icon(onPressed:widget.allowChanges
                ?()=>VendorLiveTrip.driverDialog(context,widget.api,
                  item,widget.onChanged):null,
                icon:const Icon(Icons.edit),label:const Text('Driver Details')),
          ]),
          if(allocated&&status=='allocated')group('Start Trip',[
            FilledButton(onPressed:widget.allowChanges
              ?()=>VendorLiveTrip.tripDialog(context,widget.api,
                item,widget.onChanged,start:true):null,
              child:const Text('START TRIP')),
          ]),
          if(allocated&&status=='ongoing')group('Trip Ongoing',[
            row('Starting KM',data(item['trip'])['starting_odometer']),
            FilledButton(onPressed:widget.allowChanges
              ?()=>VendorLiveTrip.tripDialog(context,widget.api,
                item,widget.onChanged,start:false):null,
              child:const Text('END TRIP')),
          ]),
          if(allocated&&status=='completed')group('Final Earning',[
            if(earning.isEmpty)const Text(
              'Final payout is available after CWD admin review.'),
            if(earning.isNotEmpty)...[
              row('Billable KM',earning['billable_km']),
              row('Driver Allowance',money(earning['vendor_da'])),
              row('Night',money(earning['vendor_night'])),
              row('Toll',money(earning['toll'])),
              row('Parking',money(earning['parking'])),
              row('State Tax',money(earning['state_tax'])),
              row('Penalty',money(earning['penalty'])),
              row('Final Earning',money(earning['vendor_final_payout'])),
            ],
          ]),
          if(allocated)group('Cancellation',[
            OutlinedButton.icon(onPressed:null,
              icon:Icon(Icons.lock),label:Text('Cancel Locked')),
            const Text('Contact CWD admin for trip changes.'),
          ]),
        ]),
    );
  }
}
