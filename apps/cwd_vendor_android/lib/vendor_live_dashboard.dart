import 'dart:async';
import 'package:flutter/material.dart';
import 'vendor_auth_service.dart';
import 'vendor_feedback.dart';
import 'vendor_live_api.dart';
import 'vendor_live_booking.dart';
import 'vendor_availability_calendar.dart';

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
  Set<String>? knownAllocationIds;
  int unreadAllocations=0;
  String? errorMessage;
  int page=0;
  String filter='All';
  bool fetching=true;
  bool _foreground=true;

  List<Map<String,dynamic>> records(String key)=>
    ((data?[key] as List?)??[]).whereType<Map>()
      .map((m)=>Map<String,dynamic>.from(m)).toList();

  @override
  void initState(){
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    reload();
    _refreshTimer=Timer.periodic(const Duration(seconds:60),
      (_){if(mounted&&_foreground)reload(quiet:true);});
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){
    _foreground=state==AppLifecycleState.resumed;
    if(_foreground)reload(quiet:true);
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
      final allocated=((body['allocations'] as List?)??[])
        .whereType<Map>().where((a)=>a['status']=='allocated')
        .map((a)=>a['id'].toString()).toSet();
      final fresh=knownAllocationIds==null?allocated.length:
        allocated.difference(knownAllocationIds!).length;
      knownAllocationIds=allocated;
      if(fresh>0){
        VendorFeedback.newBooking();
        WidgetsBinding.instance.addPostFrameCallback((_){
          if(mounted)notice('CWD assigned a booking. Open Bookings → Allocated.');
        });
      }
      setState((){
        if(fresh>0&&page!=1)unreadAllocations+=fresh;
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
  List<Map<String,dynamic>> get approvedEarnings=>
    records('allocations').where((b){
      final earning=b['final_earning'];
      return earning is Map && earning['vendor_final_payout']!=null;
    }).toList();
  num earningAmount(Map<String,dynamic> b){
    final earning=b['final_earning'];
    if(earning is! Map)return 0;
    return num.tryParse(earning['vendor_final_payout']?.toString()??'')??0;
  }
  bool matches(Map<String,dynamic> b,String value){
    final status=b['status']?.toString()??'';
    if(value=='All')return true;
    if(value=='New')return status=='offered';
    if(value=='Accepted')return status=='accepted';
    if(value=='Allocated')return status=='allocated';
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
    Navigator.of(context).push(MaterialPageRoute<Object?>(
      builder:(_)=>VendorLiveBooking(api:_api,booking:booking,
        isAllocation:booking['_allocated']==true,
        allowChanges:data?['is_live_writes_enabled']==true,
        onChanged:reload),
    )).then((result)async{
      await reload(quiet:true);
      if(!mounted)return;
      if(result=='accepted'){
        setState((){page=1;filter='Accepted';unreadAllocations=0;});
        final next=allBookings.where((b)=>
          b['booking_id']==booking['booking_id']&&b['status']=='accepted');
        if(next.isNotEmpty)openBooking(next.first);
      }
    });
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
    final earning=item['final_earning'] is Map
      ?Map<String,dynamic>.from(item['final_earning']):<String,dynamic>{};
    final approved=earning['vendor_final_payout']!=null;
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
              Text(approved?'Approved Earning':'Estimated Earning',
                style:const TextStyle(color:partnerMuted,fontSize:12)),
              Text(money(approved?earning['vendor_final_payout']:item['estimated_payout']),
                style:const TextStyle(color:partnerTeal,
                  fontSize:19,fontWeight:FontWeight.w900)),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget home(){
    const filters=['New','Accepted',"Today's Pickups",'Ongoing','Completed','Cancelled'];
    return RefreshIndicator(onRefresh:reload,child:ListView(children:[
      GridView.count(crossAxisCount:2,childAspectRatio:1.65,
        physics:const NeverScrollableScrollPhysics(),shrinkWrap:true,
        padding:const EdgeInsets.fromLTRB(12,18,12,12),
        crossAxisSpacing:9,mainAxisSpacing:9,
        children:filters.map((name)=>Card(color:Colors.white,
          child:InkWell(onTap:()=>setState((){
            page=1;filter=name;unreadAllocations=0;
          }),child:Padding(padding:const EdgeInsets.all(10),
            child:Column(mainAxisAlignment:MainAxisAlignment.center,
              crossAxisAlignment:CrossAxisAlignment.center,children:[
              Text(allBookings.where((b)=>matches(b,name)).length.toString(),
                textAlign:TextAlign.center,style:const TextStyle(
                  fontSize:28,fontWeight:FontWeight.w900,color:partnerTeal)),
              const SizedBox(height:5),
              Text(name,textAlign:TextAlign.center,style:const TextStyle(
                fontSize:12,fontWeight:FontWeight.w800,color:partnerInk)),
            ]),
          )),
        )).toList(),
      ),
    ]));
  }
  Widget bookings(){
    const filters=['All','New','Accepted','Allocated',"Today's Pickups",
      'Ongoing','Completed','Cancelled'];
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
      notice('Ask CWD to activate car availability changes.');return;
    }
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder:(_)=>VendorAvailabilityCalendar(car:car,
        blocks:records('vehicle_blocks'),bookings:allBookings,
        onSave:(start,end,isBlock)async{
          await _api.action(isBlock?'block_vehicle_range':'unblock_vehicle_range',{
            'vehicle_id':car['id'],'start_date':blockedDate(start),
            'end_date':blockedDate(end),
          });
          await reload(quiet:true);
        }),
    ));
    if(mounted)await reload(quiet:true);
  }
  Widget cars(){
    final fleet=records('vehicles');
    return ListView(padding:const EdgeInsets.all(14),children:[
      if(fleet.isEmpty)const Padding(padding:EdgeInsets.all(24),
        child:Text('No approved cars yet.',textAlign:TextAlign.center)),
      ...fleet.map((v){
        final count=records('vehicle_blocks')
          .where((b)=>b['vehicle_id']==v['id']).length;
        return Card(color:Colors.white,child:Padding(
          padding:const EdgeInsets.all(14),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(v['make_model']?.toString()??'Car',style:const TextStyle(
              fontWeight:FontWeight.w800,fontSize:18)),
            const SizedBox(height:4),
            Text(v['vehicle_number']?.toString()??'',style:const TextStyle(color:partnerMuted)),
            const SizedBox(height:7),
            Text(count.toString()+' dates blocked',style:const TextStyle(fontWeight:FontWeight.w700)),
            const SizedBox(height:9),
            SizedBox(width:double.infinity,child:FilledButton.icon(
              onPressed:v['is_active']==true?()=>availability(v):null,
              icon:const Icon(Icons.calendar_month_outlined),label:const Text('Open Calendar'))),
          ])));
      }),
    ]);
  }
  Widget earnings(){
    final approved=approvedEarnings;
    final allocations=records('allocations');
    final underReview=allocations.where((a)=>
      a['status']=='completed' && a['final_earning']==null).length;
    final total=approved.fold<num>(0,(sum,b)=>sum+earningAmount(b));
    final paid=approved.where((b)=>
      (b['final_earning'] as Map)['payout_status']=='paid')
      .fold<num>(0,(sum,b)=>sum+earningAmount(b));
    final pending=total-paid;
    return RefreshIndicator(onRefresh:reload,
      child:ListView(padding:const EdgeInsets.all(14),children:[
        const Text('My Earnings',style:TextStyle(
          fontSize:23,fontWeight:FontWeight.w900,color:partnerInk)),
        const SizedBox(height:5),
        const Text('Only CWD admin-approved settlements appear here.',
          style:TextStyle(color:partnerMuted,fontSize:12)),
        const SizedBox(height:15),
        Row(children:[
          Expanded(child:_earningSummary('Approved',money(total))),
          Expanded(child:_earningSummary('Paid',money(paid))),
          Expanded(child:_earningSummary('Pending',money(pending))),
        ]),
        if(underReview>0)Padding(
          padding:const EdgeInsets.symmetric(vertical:12),
          child:Text(underReview.toString()+
            ' completed trip(s) are waiting for CWD admin review.',
            style:const TextStyle(color:partnerMuted)),
        ),
        const SizedBox(height:10),
        if(approved.isEmpty)const Padding(
          padding:EdgeInsets.all(24),
          child:Text('No approved earnings yet. Completed trips will appear after CWD approval.',
            textAlign:TextAlign.center)),
        ...approved.map((b){
          final e=Map<String,dynamic>.from(b['final_earning'] as Map);
          final isPaid=e['payout_status']=='paid';
          final when=isPaid?e['paid_at']:e['payout_due_at'];
          return Card(color:Colors.white,
            child:ListTile(
              onTap:()=>openBooking({...b,'_allocated':true}),
              title:Text(b['booking_id']?.toString()??'Booking',
                style:const TextStyle(fontWeight:FontWeight.w800)),
              subtitle:Text(isPaid
                ?'Paid · '+dateLabel(when)
                :'Pending · Due '+dateLabel(when)),
              trailing:Column(mainAxisSize:MainAxisSize.min,
                crossAxisAlignment:CrossAxisAlignment.end,children:[
                Text(money(e['vendor_final_payout']),
                  style:const TextStyle(color:partnerTeal,
                    fontSize:17,fontWeight:FontWeight.w900)),
                Text(isPaid?'Paid':'Pending',
                  style:TextStyle(fontSize:11,
                    color:isPaid?partnerTeal:partnerMuted)),
              ]),
            ));
        }),
      ]));
  }
  Widget _earningSummary(String title,String amount)=>
    Card(color:Colors.white,child:Padding(
      padding:const EdgeInsets.symmetric(vertical:15,horizontal:5),
      child:Column(children:[
        Text(amount,style:const TextStyle(color:partnerTeal,
          fontWeight:FontWeight.w900,fontSize:15)),
        const SizedBox(height:5),
        Text(title,style:const TextStyle(color:partnerMuted,
          fontSize:11,fontWeight:FontWeight.w700)),
      ])));
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
    const sections=['Home','Bookings','My Cars','Earnings','Profile'];
    return PopScope(
      canPop:page==0,
      onPopInvokedWithResult:(didPop,result){
        if(!didPop&&page!=0)setState(()=>page=0);
      },
      child:Scaffold(
        backgroundColor:partnerSurface,
        appBar:page==0?null:AppBar(
          backgroundColor:partnerTeal,foregroundColor:Colors.white,
          title:Text(sections[page]),
          actions:[IconButton(icon:const Icon(Icons.refresh),onPressed:reload)]),
        body:fetching&&data==null
          ?const Center(child:CircularProgressIndicator())
          :Column(children:[
            if(errorMessage!=null)MaterialBanner(content:Text(errorMessage!),
              actions:[TextButton(onPressed:reload,child:const Text('Retry'))]),
            if(data?['is_live_writes_enabled']!=true)
              const Padding(padding:EdgeInsets.all(8),
                child:Text('Booking actions not active yet',
                  style:TextStyle(color:partnerMuted,fontSize:11))),
            Expanded(child:switch(page){
              0=>home(),1=>bookings(),2=>cars(),3=>earnings(),_=>profile(),
            }),
          ]),
        bottomNavigationBar:NavigationBar(selectedIndex:page,
          onDestinationSelected:(i)=>setState((){
            page=i;
            if(i==1)unreadAllocations=0;
          }),
          destinations:[
            const NavigationDestination(icon:Icon(Icons.home_outlined),label:'Home'),
            NavigationDestination(icon:Badge(isLabelVisible:unreadAllocations>0,
              child:const Icon(Icons.receipt_long_outlined)),label:'Bookings'),
            const NavigationDestination(icon:Icon(Icons.directions_car_outlined),label:'My Cars'),
            const NavigationDestination(icon:Icon(Icons.payments_outlined),label:'Earnings'),
            const NavigationDestination(icon:Icon(Icons.person_outline),label:'Profile'),
          ]),
      ),
    );
  }
}
