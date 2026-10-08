import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'vendor_live_api.dart';

class VendorLiveTrip {
  const VendorLiveTrip._();
  static Future<void> driverDialog(BuildContext context,VendorLiveApi api,
    Map<String,dynamic> booking,Future<void> Function() onChanged)async{
    final plate=TextEditingController(text:booking['vehicle_number']?.toString()??'');
    final name=TextEditingController(text:booking['driver_name']?.toString()??'');
    final phone=TextEditingController(text:booking['driver_mobile']?.toString()??'');
    final ok=await showDialog<bool>(context:context,builder:(ctx)=>
      AlertDialog(title:const Text('Driver & Vehicle Details'),
        content:SingleChildScrollView(child:Column(
          mainAxisSize:MainAxisSize.min,children:[
            TextField(controller:plate,textCapitalization:TextCapitalization.characters,
              decoration:const InputDecoration(labelText:'Registered Car Plate')),
            TextField(controller:name,
              decoration:const InputDecoration(labelText:'Driver Name')),
            TextField(controller:phone,maxLength:10,
              keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'Driver Mobile')),
          ])),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),
            child:const Text('Back')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),
            child:const Text('Save')),
        ]));
    final values={'allocation_id':booking['id'],
      'vehicle_number':plate.text,'driver_name':name.text,
      'driver_mobile':phone.text};
    plate.dispose();name.dispose();phone.dispose();
    if(ok!=true)return;
    try{
      await api.action('save_driver',values);
      await onChanged();
      if(context.mounted)Navigator.pop(context,true);
    }catch(e){
      if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(e.toString())));
    }
  }

  static Future<void> tripDialog(BuildContext context,VendorLiveApi api,
    Map<String,dynamic> booking,Future<void> Function() onChanged,
    {required bool start})async{
    final odometer=TextEditingController();
    final toll=TextEditingController(text:'0');
    final parking=TextEditingController(text:'0');
    final tax=TextEditingController(text:'0');
    final other=TextEditingController(text:'0');
    final otherReason=TextEditingController();
    bool pickedUp=false;
    bool night=false;
    Uint8List? image;
    String photoName='odometer.jpg';
    final chosen=await showDialog<bool>(
      context:context,barrierDismissible:false,
      builder:(ctx)=>StatefulBuilder(builder:(ctx,setInner)=>
        AlertDialog(title:Text(start?'Start Trip':'End Trip'),
          content:SingleChildScrollView(child:Column(
            mainAxisSize:MainAxisSize.min,children:[
              const Text('Odometer photo is mandatory. '
                'Trip details lock after submission.',
                style:TextStyle(fontSize:12)),
              TextField(controller:odometer,
                keyboardType:const TextInputType.numberWithOptions(decimal:true),
                decoration:InputDecoration(labelText:
                  start?'Starting Odometer KM':'Closing Odometer KM')),
              const SizedBox(height:12),
              OutlinedButton.icon(
                onPressed:() async {
                  try {
                    final photo=await ImagePicker().pickImage(
                      source:ImageSource.camera,
                      maxWidth:1700,imageQuality:75);
                    if(photo!=null&&ctx.mounted){
                      final data=await photo.readAsBytes();
                      if(ctx.mounted)setInner((){
                        image=data;photoName=photo.name;
                      });
                    }
                  }catch(_){
                    if(ctx.mounted)ScaffoldMessenger.of(ctx).showSnackBar(
                      const SnackBar(content:Text(
                        'Camera not available. Check camera permission.')));
                  }
                },
                icon:const Icon(Icons.camera_alt_outlined),
                label:Text(image==null?'Take odometer photo':'Photo captured'),
              ),
              if(start)CheckboxListTile(
                contentPadding:EdgeInsets.zero,
                title:const Text('I confirm the customer has been '
                  'picked up and trip has started.',
                  style:TextStyle(fontSize:12)),
                value:pickedUp,
                onChanged:(v)=>setInner(()=>pickedUp=v??false)),
              if(!start)...[
                TextField(controller:toll,keyboardType:TextInputType.number,
                  decoration:const InputDecoration(labelText:'Toll ₹')),
                TextField(controller:parking,keyboardType:TextInputType.number,
                  decoration:const InputDecoration(labelText:'Parking ₹')),
                TextField(controller:tax,keyboardType:TextInputType.number,
                  decoration:const InputDecoration(labelText:'State Tax ₹')),
                TextField(controller:other,keyboardType:TextInputType.number,
                  decoration:const InputDecoration(labelText:'Other Charges ₹')),
                TextField(controller:otherReason,
                  decoration:const InputDecoration(labelText:'Other Reason')),
                CheckboxListTile(
                  title:const Text('Night Charge'),
                  value:night,
                  onChanged:(v)=>setInner(()=>night=v??false)),
              ],
            ],
          )),
          actions:[
            TextButton(onPressed:()=>Navigator.pop(ctx,false),
              child:const Text('Cancel')),
            FilledButton(
              onPressed:()=>Navigator.pop(ctx,true),
              child:Text(start?'START TRIP':'END TRIP')),
          ],
        )),
    );
    final km=odometer.text.trim();
    final photo=image;
    final filename=photoName;
    final charges={
      'toll':toll.text.trim(),'parking':parking.text.trim(),
      'state_tax':tax.text.trim(),'other_amount':other.text.trim(),
      'other_reason':otherReason.text.trim(),
      'night_charge':night?'yes':'no',
    };
    odometer.dispose();toll.dispose();parking.dispose();tax.dispose();
    other.dispose();otherReason.dispose();
    if(chosen!=true)return;
    if(km.isEmpty||photo==null||(start&&!pickedUp)){
      if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('KM, photo and pickup confirmation required.')));
      return;
    }
    if(!start&&((num.tryParse(charges['other_amount']??'0')??0)>0)&&
      charges['other_reason']!.isEmpty){
      if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Other charge requires a reason.')));
      return;
    }
    final media=filename.toLowerCase().endsWith('.png')?'image/png':
      filename.toLowerCase().endsWith('.webp')?'image/webp':'image/jpeg';
    try{
      await api.submitTrip(
        action:start?'start_trip':'end_trip',
        allocationId:booking['id']?.toString()??'',
        odometer:km,photo:photo,filename:filename,
        mediaType:media,pickedUp:pickedUp,charges:charges);
      await onChanged();
      if(context.mounted)Navigator.pop(context,true);
    }catch(e){
      if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(e.toString())));
    }
  }
}
