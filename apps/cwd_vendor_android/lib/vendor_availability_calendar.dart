import 'package:flutter/material.dart';

/// India-date fleet availability, with visible booked/blocked/available days.
class VendorAvailabilityCalendar extends StatefulWidget {
  const VendorAvailabilityCalendar({super.key, required this.car,
    required this.blocks,required this.bookings,required this.onSave});
  final Map<String,dynamic> car;
  final List<Map<String,dynamic>> blocks,bookings;
  final Future<void> Function(DateTime,DateTime,bool) onSave;
  @override
  State<VendorAvailabilityCalendar> createState()=>_CalendarState();
}
class _CalendarState extends State<VendorAvailabilityCalendar> {
  static const teal=Color(0xFF00897B),ink=Color(0xFF172C39);
  late DateTime month;
  late final Set<String> blocked,booked;
  DateTime? start,end;
  bool busy=false;
  String? error;
  DateTime dateOnly(DateTime d)=>DateTime.utc(d.year,d.month,d.day);
  DateTime today() {
    final ist=DateTime.now().toUtc().add(const Duration(hours:5,minutes:30));
    return dateOnly(ist);
  }
  String key(DateTime d)=>d.year.toString().padLeft(4,'0')+'-'+
    d.month.toString().padLeft(2,'0')+'-'+d.day.toString().padLeft(2,'0');
  DateTime? fromIso(dynamic v){
    final utc=DateTime.tryParse(v?.toString()??'')?.toUtc();
    if(utc==null)return null;
    return dateOnly(utc.add(const Duration(hours:5,minutes:30)));
  }
  @override
  void initState(){
    super.initState();
    final now=today();
    month=DateTime.utc(now.year,now.month);
    blocked=widget.blocks.where((r)=>r['vehicle_id']==widget.car['id'])
      .map((r)=>r['blocked_date']?.toString()??'').toSet();
    booked=<String>{};
    for(final b in widget.bookings){
      if(!['accepted','allocated','ongoing'].contains(b['status']))continue;
      if(b['selected_vehicle_id']!=widget.car['id'])continue;
      final first=fromIso(b['pickup_at']??b['start_at']);
      final last=fromIso(b['final_drop_at'])??first;
      if(first==null||last==null)continue;
      for(var d=first;!d.isAfter(last);d=d.add(const Duration(days:1))){
        booked.add(key(d));
        if(booked.length>365)break;
      }
    }
  }
  void select(DateTime d) {
    if(d.isBefore(today()))return;
    setState((){
      if(start==null||end!=null||d.isBefore(start!)){start=d;end=null;}
      else{end=d;}
      error=null;
    });
  }
  bool picked(DateTime d){
    if(start==null)return false;
    return !d.isBefore(start!)&&!d.isAfter(end??start!);
  }
  Future<void> save(bool isBlock)async{
    if(start==null||busy)return;
    final last=end??start!;
    final count=last.difference(start!).inDays+1;
    if(count>90){setState(()=>error='Please choose 90 days or less.');return;}
    if(isBlock){
      for(var d=start!;!d.isAfter(last);d=d.add(const Duration(days:1))){
        if(booked.contains(key(d))){
          setState(()=>error='This range includes a booked date: '+key(d));
          return;
        }
      }
    }
    setState((){busy=true;error=null;});
    try{
      await widget.onSave(start!,last,isBlock);
      for(var d=start!;!d.isAfter(last);d=d.add(const Duration(days:1))){
        if(isBlock){blocked.add(key(d));}else{blocked.remove(key(d));}
      }
      if(!mounted)return;
      setState((){start=null;end=null;busy=false;});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(isBlock?'Dates blocked':'Dates available again')));
    }catch(e){
      if(mounted)setState((){busy=false;error=e.toString();});
    }
  }
  Widget tag(String name,Color color)=>Row(mainAxisSize:MainAxisSize.min,children:[
    Container(width:12,height:12,color:color),const SizedBox(width:4),
    Text(name,style:const TextStyle(fontSize:11)),
  ]);
  @override
  Widget build(BuildContext context){
    final firstWeekday=DateTime.utc(month.year,month.month,1).weekday%7;
    final length=DateTime.utc(month.year,month.month+1,0).day;
    final minMonth=DateTime.utc(today().year,today().month);
    final maxMonth=DateTime.utc(today().year,today().month+12);
    final range=start==null?'Tap start date, then end date':
      end==null?key(start!):key(start!)+' to '+key(end!);
    return Scaffold(
      appBar:AppBar(title:Text(widget.car['make_model']?.toString()??'Calendar'),
        backgroundColor:teal,foregroundColor:Colors.white),
      body:SafeArea(child:Column(children:[
        Padding(padding:const EdgeInsets.all(10),
          child:Text(widget.car['vehicle_number']?.toString()??'',
            style:const TextStyle(fontWeight:FontWeight.bold,fontSize:18))),
        Wrap(alignment:WrapAlignment.center,spacing:12,runSpacing:6,children:[
          tag('Available',const Color(0xFFE0F6ED)),
          tag('Blocked',const Color(0xFFFFDDE0)),
          tag('Booked',const Color(0xFFFFEDC0)),
          tag('Selected',const Color(0xFFB1E9DF)),
        ]),
        Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
          IconButton(icon:const Icon(Icons.chevron_left),
            onPressed:month.isAfter(minMonth)?()=>setState(()=>
              month=DateTime.utc(month.year,month.month-1)):null),
          Text(_months[month.month-1]+' '+month.year.toString(),
            style:const TextStyle(fontWeight:FontWeight.bold,fontSize:19)),
          IconButton(icon:const Icon(Icons.chevron_right),
            onPressed:month.isBefore(maxMonth)?()=>setState(()=>
              month=DateTime.utc(month.year,month.month+1)):null),
        ]),
        const Row(children:[
          for(final label in ['S','M','T','W','T','F','S'])
            Expanded(child:Center(child:Text(label))),
        ]),
        Expanded(child:GridView.builder(
          padding:const EdgeInsets.all(8),
          gridDelegate:const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount:7,mainAxisSpacing:5,crossAxisSpacing:5),
          itemCount:firstWeekday+length,
          itemBuilder:(context,index){
            final day=index-firstWeekday+1;
            if(day<1)return const SizedBox.shrink();
            final d=DateTime.utc(month.year,month.month,day);
            final old=d.isBefore(today());
            final isBooked=booked.contains(key(d));
            final isBlocked=blocked.contains(key(d));
            final color=picked(d)?const Color(0xFFB1E9DF):
              isBooked?const Color(0xFFFFEDC0):
              isBlocked?const Color(0xFFFFDDE0):
              old?const Color(0xFFEAEBEC):const Color(0xFFE0F6ED);
            return Material(color:color,borderRadius:BorderRadius.circular(8),
              child:InkWell(onTap:old?null:()=>select(d),
                child:Column(mainAxisAlignment:MainAxisAlignment.center,children:[
                  Text(day.toString(),style:const TextStyle(
                    fontWeight:FontWeight.bold,color:ink)),
                  if(isBooked||isBlocked)Icon(isBooked?Icons.directions_car:Icons.block,
                    color:isBooked?Colors.orange:Colors.red,size:12),
                ])));
          },
        )),
        Padding(padding:const EdgeInsets.all(8),
          child:Text(range,style:const TextStyle(fontWeight:FontWeight.bold))),
        if(error!=null)Text(error!,textAlign:TextAlign.center,
          style:const TextStyle(color:Colors.redAccent,fontSize:12)),
        Padding(padding:const EdgeInsets.fromLTRB(12,4,12,14),child:Row(children:[
          Expanded(child:FilledButton.icon(
            onPressed:start==null||busy?null:()=>save(true),
            icon:const Icon(Icons.event_busy),label:const Text('Block Dates'))),
          const SizedBox(width:8),
          Expanded(child:OutlinedButton.icon(
            onPressed:start==null||busy?null:()=>save(false),
            icon:const Icon(Icons.event_available),label:const Text('Unblock'))),
        ])),
        if(busy)const LinearProgressIndicator(),
      ])),
    );
  }
  static const _months=['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
}
