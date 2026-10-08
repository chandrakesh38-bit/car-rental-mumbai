import 'dart:async';
import 'package:flutter/material.dart';
import 'vendor_auth_service.dart';
import 'vendor_feedback.dart';
import 'vendor_live_api.dart';
import 'vendor_live_booking.dart';

const partnerTeal=Color(0xFF00897B);
const partnerInk=Color(0xFF172C39);
const partnerMuted=Color(0xFF667785);
const partnerSurface=Color(0xFFF2F5F7);
String money(dynamic value){
  final number=num.tryParse(value?.toString()??'')??0;
  return '₹'+number.toStringAsFixed(number%1==0?0:2);
}

class VendorLiveDashboard extends StatefulWidget {
  const VendorLiveDashboard({super.key,required this.onLogout,this.vendorName});
  final VoidCallback onLogout;
  final String? vendorName;
  @override
  State<VendorLiveDashboard> createState()=>_VendorLiveDashboardState();
}

class _VendorLiveDashboardState extends State<VendorLiveDashboard>
    with WidgetsBindingObserver {
  final VendorLiveApi _api=VendorLiveApi();
  Timer? _refreshTimer;
  Map<String,dynamic>? data;
  Set<String>? knownOfferIds;
  String? errorMessage;
  int page=0;
  String filter='All';
  bool fetching=true;

  List<Map<String,dynamic>> records(String key)=>
    ((data?[key] as List?)??[]).whereType<Map>()
      .map((m)=>Map<String,dynamic>.from(m)).toList();

  @override
  void initState(){
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    reload();
    _refreshTimer=Timer.periodic(const Duration(seconds:60),
      (_){if(mounted)reload(quiet:true);});
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.resumed)reload(quiet:true);
  }
  @override
  void dispose(){
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    _api.dispose();
    super.dispose();
  }

  Future<void> reload({bool quiet=false}) async {
    if(!quiet&&mounted)setState(()=>fetching=true);
    try{
      final body=await _api.dashboard();
      if(!mounted)return;
      final current=((body['offers'] as List?)??[])
        .whereType<Map>().where((o)=>o['status']=='offered')
        .map((o)=>o['id'].toString()).toSet();
      if(knownOfferIds!=null&&current.difference(knownOfferIds!).isNotEmpty){
        VendorFeedback.newBooking();
      }
      knownOfferIds=current;
      setState((){
        data=body;
        errorMessage=null;
        fetching=false;
      });
    }on VendorAuthException catch(e){
      if(!mounted)return;
      setState((){
        errorMessage=e.message;
        fetching=false;
      });
      if(e.statusCode==401||e.statusCode==403)widget.onLogout();
    }catch(_){
      if(mounted)setState((){
        errorMessage='Could not connect to the CWD server.';
        fetching=false;
      });
    }
  }

  List<Map<String,dynamic>> get allBookings=>[
    ...records('offers').map((b)=>{...b,'_allocated':false}),
    ...records('allocations').map((b)=>{...b,'_allocated':true}),
  ];
  bool matches(Map<String,dynamic> b,String value){
    final status=b['status']?.toString()??'';
    if(value=='All')return true;
    if(value=='New')return status=='offered';
    if(value=='Ongoing')return status=='ongoing';
    if(value=='Completed')return status=='completed';
    if(value=='Cancelled')return ['declined','cancelled'].contains(status);
    if(value=="Today's Pickups"){
      if(status!='allocated')return false;
      final date=DateTime.tryParse(b['pickup_at']?.toString()??'')?.toLocal();
      final today=DateTime.now();
      return date!=null&&date.year==today.year&&
        date.month==today.month&&date.day==today.day;
    }
    return false;
  }
  void openBooking(Map<String,dynamic> booking){
    VendorFeedback.click();
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder:(_)=>VendorLiveBooking(
        api:_api,booking:booking,
        isAllocation:booking['_allocated']==true,
        allowChanges:data?['is_live_writes_enabled']==true,
        onChanged:reload,
      ),
    )).then((_)=>reload(quiet:true));
  }

  String dateLabel(dynamic value){
    final date=DateTime.tryParse(value?.toString()??'')?.toLocal();
    if(date==null)return 'Date to be confirmed';
    return date.day.toString()+'/'+date.month.toString()+'/'+date.year.toString()+
      ' · '+date.hour.toString().padLeft(2,'0')+':'+
      date.minute.toString().padLeft(2,'0');
  }

  Widget bookingCard(Map<String,dynamic> item){
    final allocated=item['_allocated']==true;
    final customer=item['customer'] is Map
      ?Map<String,dynamic>.from(item['customer']):<String,dynamic>{};
    final route=item['route'] is Map
      ?Map<String,dynamic>.from(item['route']):<String,dynamic>{};
    final pickup=allocated
      ?customer['pickup_address']??route['pickup_area']??''
      :item['pickup_area']??'';
    final drop=allocated
      ?customer['drop_address']??route['destination_area']??''
      :item['destination_area']??'';
    return Card(color:Colors.white,
      margin:const EdgeInsets.fromLTRB(13,5,13,7),
      shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(17)),
      child:InkWell(onTap:()=>openBooking(item),
        borderRadius:BorderRadius.circular(17),
        child:Padding(padding:const EdgeInsets.all(16),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[
              Expanded(child:Text(item['booking_id']?.toString()??'Booking',
                style:const TextStyle(fontWeight:FontWeight.w900,
                  fontSize:16,color:partnerInk))),
              Text(item['status']?.toString().toUpperCase()??'',
                style:const TextStyle(fontSize:11,
                  color:partnerTeal,fontWeight:FontWeight.w800)),
            ]),
            const SizedBox(height:9),
            Text(pickup.toString()+' → '+drop.toString(),
              maxLines:3,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:14,
                fontWeight:FontWeight.w600,color:partnerInk)),
            const SizedBox(height:7),
            Text(dateLabel(item['pickup_at']??item['start_at']),
              style:const TextStyle(color:partnerMuted,fontSize:12)),
            const SizedBox(height:9),
            Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
              const Text('Estimated Earning',
                style:TextStyle(color:partnerMuted,fontSize:12)),
              Text(money(item['estimated_payout']),
                style:const TextStyle(color:partnerTeal,
                  fontSize:19,fontWeight:FontWeight.w900)),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget home(){
    const filters=['New',"Today's Pickups",'Ongoing','Completed','Cancelled'];
    return RefreshIndicator(onRefresh:reload,
      child:ListView(children:[
        Padding(padding:const EdgeInsets.fromLTRB(19,19,16,15),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('Welcome, '+(widget.vendorName??'CWD Partner'),
              style:const TextStyle(fontSize:21,
                fontWeight:FontWeight.w900,color:partnerInk)),
            const SizedBox(height:6),
            const Text('Your bookings and earnings.',
              style:TextStyle(color:partnerMuted)),
          ])),
        GridView.count(crossAxisCount:2,childAspectRatio:1.8,
          physics:const NeverScrollableScrollPhysics(),
          shrinkWrap:true,
          padding:const EdgeInsets.symmetric(horizontal:13),
          crossAxisSpacing:7,mainAxisSpacing:7,
          children:filters.map((name)=>Card(color:Colors.white,
            child:InkWell(onTap:()=>setState((){
              page=1;filter=name;
            }),child:Padding(padding:const EdgeInsets.all(12),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(allBookings.where((b)=>matches(b,name)).length.toString(),
                  style:const TextStyle(fontSize:25,
                    fontWeight:FontWeight.w900,color:partnerTeal)),
                Text(name,style:const TextStyle(
                  fontSize:12,fontWeight:FontWeight.w700)),
              ]),
            )),
          )).toList(),
        ),
        const Padding(padding:EdgeInsets.fromLTRB(18,18,14,10),
          child:Text('Latest Bookings',
            style:TextStyle(fontSize:17,fontWeight:FontWeight.w900))),
        if(allBookings.isEmpty)const Padding(padding:EdgeInsets.all(25),
          child:Text('No bookings yet. New offers will appear here.',
            textAlign:TextAlign.center)),
        ...allBookings.take(6).map(bookingCard),
        const SizedBox(height:16),
      ]),
    );
  }
  Widget bookings(){
    const filters=['All','New',"Today's Pickups",'Ongoing','Completed',
      'Cancelled'];
    final items=allBookings.where((b)=>matches(b,filter)).toList();
    return Column(children:[
      SingleChildScrollView(scrollDirection:Axis.horizontal,
        padding:const EdgeInsets.symmetric(horizontal:8,vertical:7),
        child:Row(children:filters.map((value)=>Padding(
          padding:const EdgeInsets.only(right:6),
          child:ChoiceChip(label:Text(value),selected:filter==value,
            selectedColor:const Color(0xFFBDECE5),
            onSelected:(_)=>setState(()=>filter=value)),
        )).toList())),
      Expanded(child:RefreshIndicator(onRefresh:reload,
        child:ListView(children:[
          if(items.isEmpty)const Padding(padding:EdgeInsets.all(25),
            child:Text('No bookings in this section.',
              textAlign:TextAlign.center)),
          ...items.map(bookingCard),
        ]))),
    ]);
  }
  String blockedDate(DateTime d)=>d.year.toString()+'-'+
    d.month.toString().padLeft(2,'0')+'-'+d.day.toString().padLeft(2,'0');
  Future<void> availability(Map<String,dynamic> car)async{
    if(data?['is_live_writes_enabled']!=true){
      notice('Changes are locked until CWD activates vendor access.');
      return;
    }
    final today=DateTime.now();
    final day=await showDatePicker(context:context,
      firstDate:DateTime(today.year,today.month,today.day),
      lastDate:today.add(const Duration(days:365)),initialDate:today);
    if(day==null||!mounted)return;
    final date=blockedDate(day);
    final blocked=records('vehicle_blocks').any((v)=>
      v['vehicle_id']==car['id']&&v['blocked_date']==date);
    try{
      await _api.action(blocked?'unblock_vehicle':'block_vehicle',{
        'vehicle_id':car['id'],'blocked_date':date,
      });
      await reload(quiet:true);
      notice(blocked?'Date unblocked':'Date blocked');
    }catch(e){notice(e.toString());}
  }
  Widget cars(){
    final fleet=records('vehicles');
    return ListView(children:[
      const Padding(padding:EdgeInsets.all(16),
        child:Text('My Cars',
          style:TextStyle(fontWeight:FontWeight.w900,fontSize:22))),
      if(fleet.isEmpty)const Padding(padding:EdgeInsets.all(24),
        child:Text('Your approved cars will appear here.')),
      ...fleet.map((v)=>Card(color:Colors.white,
        margin:const EdgeInsets.symmetric(horizontal:14,vertical:7),
        child:Padding(padding:const EdgeInsets.all(16),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(v['make_model']?.toString()??'Car',
              style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),
            const SizedBox(height:5),
            Text(v['vehicle_number']?.toString()??'',
              style:const TextStyle(color:partnerMuted)),
            Text(v['is_active']==true?'Approved Vehicle':'Pending Approval',
              style:const TextStyle(color:partnerMuted,fontSize:12)),
            Align(alignment:Alignment.centerRight,
              child:OutlinedButton.icon(
                onPressed:()=>availability(v),
                icon:const Icon(Icons.calendar_month_outlined),
                label:const Text('Block / Unblock Date'))),
          ]),
        )),
      ),
    ]);
  }
  Widget profile(){
    final v=data?['vendor'] is Map
      ?Map<String,dynamic>.from(data!['vendor']):<String,dynamic>{};
    return ListView(padding:const EdgeInsets.all(16),children:[
      Card(color:Colors.white,child:Padding(
        padding:const EdgeInsets.all(20),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.account_circle,color:partnerTeal,size:47),
          const SizedBox(height:10),
          Text(v['name']?.toString()??'CWD Partner',
            style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
          const SizedBox(height:8),
          Text('Vendor Code: '+(v['vendor_code']?.toString()??'')),
        ]),
      )),
      const SizedBox(height:13),
      Card(color:Colors.white,
        child:ValueListenableBuilder<bool>(
          valueListenable:VendorFeedback.soundEnabled,
          builder:(context,enabled,child)=>SwitchListTile(
            title:const Text('On-screen Booking Sounds'),
            value:enabled,onChanged:VendorFeedback.setSoundEnabled,
            activeTrackColor:partnerTeal))),
      const SizedBox(height:13),
      Card(color:Colors.white,child:ListTile(
        leading:const Icon(Icons.logout,color:Colors.redAccent),
        title:const Text('Logout'),onTap:widget.onLogout)),
    ]);
  }
  void notice(String message){
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(message)));
  }

  @override
  Widget build(BuildContext context){
    const sections=['Home','Bookings','My Cars','Profile'];
    return Scaffold(
      backgroundColor:partnerSurface,
      appBar:AppBar(backgroundColor:partnerTeal,foregroundColor:Colors.white,
        title:Text('CWD Partner · '+sections[page]),
        actions:[IconButton(icon:const Icon(Icons.refresh),
          onPressed:reload)]),
      body:fetching&&data==null
        ?const Center(child:CircularProgressIndicator())
        :Column(children:[
          if(errorMessage!=null)MaterialBanner(content:Text(errorMessage!),
            actions:[TextButton(onPressed:reload,child:const Text('Retry'))]),
          if(data?['is_live_writes_enabled']!=true)
            const Padding(padding:EdgeInsets.all(8),
              child:Text('Booking changes require CWD activation',
                style:TextStyle(color:partnerMuted,fontSize:11))),
          Expanded(child:switch(page){
            0=>home(),1=>bookings(),2=>cars(),_=>profile(),
          }),
        ]),
      bottomNavigationBar:NavigationBar(selectedIndex:page,
        onDestinationSelected:(i)=>setState(()=>page=i),
        destinations:const [
          NavigationDestination(icon:Icon(Icons.home_outlined),label:'Home'),
          NavigationDestination(icon:Icon(Icons.receipt_long_outlined),
            label:'Bookings'),
          NavigationDestination(icon:Icon(Icons.directions_car_outlined),
            label:'My Cars'),
          NavigationDestination(icon:Icon(Icons.person_outline),
            label:'Profile'),
        ]),
    );
  }
}
