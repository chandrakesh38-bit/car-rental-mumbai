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
  Map<String,dynamic>? _latest;
  Map<String,dynamic> get item=>_latest??widget.booking;
  Future<void> refreshDetail()async{
    final response=await widget.api.dashboard();
    final list=(response[widget.isAllocation?'allocations':'offers'] as List?)??[];
    for(final value in list){
      if(value is! Map)continue;
      if(value['id']==widget.booking['id']&&mounted){
        setState(()=>_latest=Map<String,dynamic>.from(value));
        break;
      }
    }
    await widget.onChanged();
  }
  Map<String,dynamic> data(dynamic val)=>val is Map
    ?Map<String,dynamic>.from(val):<String,dynamic>{};
  String val(dynamic x)=>x?.toString()??'';
  String localDate(dynamic input){
    final d=DateTime.tryParse(input?.toString()??'')?.toLocal();
    if(d==null)return 'Date to be confirmed';
    final hour=d.hour%12==0?12:d.hour%12;
    return d.day.toString().padLeft(2,'0')+'/' +
      d.month.toString().padLeft(2,'0')+'/'+d.year.toString()+
      ' · '+hour.toString()+':'+d.minute.toString().padLeft(2,'0')+
      (d.hour>=12?' PM':' AM');
  }
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
      if(mounted)Navigator.pop(context,action=='respond_offer'&&payload['response']=='accepted'?'accepted':true);
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
    final stops=customer['stops'] is List
      ?(customer['stops'] as List).map((e)=>e.toString()).toList()
      :<String>[];
    final earning=data(item['final_earning']);
    final status=val(item['status']);
    final localTrip=val(item['trip_type']).toLowerCase().contains('local');
    final detailsReady=val(item['vehicle_number']).trim().isNotEmpty&&
      val(item['driver_name']).trim().isNotEmpty&&
      RegExp(r'^[6-9][0-9]{9}$').hasMatch(val(item['driver_mobile']));
    final eligibleAt=DateTime.tryParse(val(item['can_start_at']));
    final mayStart=item['early_start_approved']==true||
      (eligibleAt!=null&&!DateTime.now().isBefore(eligibleAt));
    return Scaffold(
      backgroundColor:partnerSurface,
      appBar:AppBar(backgroundColor:partnerTeal,foregroundColor:Colors.white,
        title:const Text('Booking Details')),
      body:busy?const Center(child:CircularProgressIndicator()):
        ListView(children:[
          group('Booking Details',[
            row('Booking ID',item['booking_id']),
            row('Trip Type',item['trip_type']),
            row('Vehicle',item['vehicle_required']),
            row('Aapko milega',money(item['estimated_payout'])),
            row('Trip KM',item['estimated_km']),
            row('Pickup',localDate(allocated?item['pickup_at']:item['start_at'])),
            row('Final Drop',localDate(item['final_drop_at'])),
          ]),
          group('Payment Details',[
            if(!localTrip)...[
              row('Trip KM',item['estimated_km']),
              row('Min. KM/day','200 KM'),
              row('Rate per KM',money(rates['vendor_km_rate'])+'/KM'),
              row('Extra KM',money(rates['vendor_km_rate'])+'/KM'),
              row('Driver bhatta',money(rates['vendor_da'])+'/day'),
              row('Night charge',money(rates['vendor_night'])),
              row('Night timing','10:01 PM – 5:59 AM'),
            ],
            if(localTrip)...[
              row('Package',rates['local_package']),
              row('Extra KM',money(rates['vendor_km_rate'])+'/KM'),
              row('Extra hour',money(rates['local_extra_hour'])),
            ],
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
              const Text('CWD will assign your booking soon.'),
              OutlinedButton(onPressed:
                item['cancel_unlocked']==true&&widget.allowChanges
                  ?()=>decline(accepted:true):null,
                child:Text(item['cancel_unlocked']==true
                  ?'Cancel Booking':'Cancel? Call CWD')),
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
            if(stops.isNotEmpty)...[
              const Text('Intermediate Stops',style:TextStyle(
                fontWeight:FontWeight.w800,color:partnerInk)),
              ...stops.asMap().entries.map((entry)=>Column(
                crossAxisAlignment:CrossAxisAlignment.stretch,children:[
                  row('Stop '+(entry.key+1).toString(),entry.value),
                  navButton('Navigate to Stop '+(entry.key+1).toString(),
                    entry.value),
                  const SizedBox(height:8),
                ])),
              const Divider(height:25),
            ],
            row('Final Drop',customer['drop_address']),
            navButton('Navigate to Final Drop',val(customer['drop_address'])),
            const Divider(height:25),
            row('Vehicle Plate',item['vehicle_number']),
            row('Driver',item['driver_name']),
            row('Driver Mobile',item['driver_mobile']),
            if(status=='allocated'||status=='ongoing')
              OutlinedButton.icon(onPressed:widget.allowChanges
                ?()=>VendorLiveTrip.driverDialog(context,widget.api,
                  item,refreshDetail):null,
                icon:const Icon(Icons.edit),label:const Text('Driver Details')),
          ]),
          if(allocated&&status=='allocated')group('Start Trip',[
            if(!detailsReady)const Text('Save driver details first.'),
            if(detailsReady&&!mayStart)Text(
              'Start Trip opens 3 hours before pickup. Available '+localDate(item['can_start_at']),
              style:const TextStyle(color:partnerMuted)),
            FilledButton(onPressed:widget.allowChanges&&detailsReady&&mayStart
              ?()=>VendorLiveTrip.tripDialog(context,widget.api,
                item,refreshDetail,start:true):null,
              child:const Text('START TRIP')),
          ]),
          if(allocated&&status=='ongoing')group('Trip Ongoing',[
            row('Starting KM',data(item['trip'])['starting_odometer']),
            FilledButton(onPressed:widget.allowChanges
              ?()=>VendorLiveTrip.tripDialog(context,widget.api,
                item,refreshDetail,start:false):null,
              child:const Text('END TRIP')),
          ]),
          if(allocated&&status=='completed')group('Final Earning',[
            if(earning.isEmpty)const Text(
              'Trip submitted. Final payout is available after CWD admin review.'),
            if(earning.isEmpty&&data(item['trip'])['review_status']=='query_vendor')
              const Text('CWD has requested a trip clarification. Contact admin.',
                style:TextStyle(color:Colors.deepOrange)),
            if(earning.isNotEmpty)...[
              row('Billable KM',earning['billable_km']),
              row('Vendor KM Rate',money(earning['vendor_km_rate'])),
              row('Driver Allowance',money(earning['vendor_da'])),
              row('Night',money(earning['vendor_night'])),
              row('Toll',money(earning['toll'])),
              row('Parking',money(earning['parking'])),
              row('State Tax',money(earning['state_tax'])),
              row('Approved Other',money(earning['approved_other'])),
              row('Penalty',money(earning['penalty'])),
              row('Final Earning',money(earning['vendor_final_payout'])),
              row('Payment Status',earning['payout_status']=='paid'
                ?'Paid':'Pending payout'),
              if(earning['payout_due_at']!=null)row(
                'Payout Due',localDate(earning['payout_due_at'])),
              if(earning['paid_at']!=null)row(
                'Paid On',localDate(earning['paid_at'])),
              if(earning['utr_reference']!=null)row(
                'Payment Ref.',earning['utr_reference']),
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
