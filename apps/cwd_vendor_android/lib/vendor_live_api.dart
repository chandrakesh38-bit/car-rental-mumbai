import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'app_config.dart';
import 'vendor_auth_service.dart';

class VendorLiveApi {
  VendorLiveApi({http.Client? client}): _client=client??http.Client();
  final http.Client _client;
  static const storage=FlutterSecureStorage();

  Uri get endpoint {
    if(!AppConfig.ready||AppConfig.origin==null) {
      throw const VendorAuthException('CWD Partner backend is not ready.');
    }
    return AppConfig.origin!.resolve('/api/vendor-app-ops');
  }

  Future<Map<String,String>> headers({bool jsonBody=false}) async {
    final token=await storage.read(key:'cwd_vendor_login_session_v1');
    if(token==null||!RegExp(r'^[0-9a-f]{64}$').hasMatch(token)) {
      throw const VendorAuthException('Please log in again.',statusCode:401);
    }
    return {
      'Authorization':'Bearer $token',
      'Accept':'application/json',
      if(jsonBody)'Content-Type':'application/json',
    };
  }

  Map<String,dynamic> parse(http.Response res) {
    try {
      final obj=jsonDecode(res.body);
      if(obj is! Map)throw const FormatException('Not a JSON object');
      final result=Map<String,dynamic>.from(obj);
      if(res.statusCode>=400||result['success']!=true) {
        throw VendorAuthException(
          (result['message']??'Operation failed.').toString(),
          statusCode:res.statusCode);
      }
      return result;
    }on VendorAuthException{rethrow;}
    catch(_){throw const VendorAuthException('Invalid server response.');}
  }

  Future<Map<String,dynamic>> dashboard() async {
    final result=await _client.get(endpoint,headers:await headers())
      .timeout(const Duration(seconds:30));
    return parse(result);
  }

  Future<Map<String,dynamic>> action(String action,Map<String,dynamic> data) async {
    final result=await _client.post(endpoint,
      headers:await headers(jsonBody:true),
      body:jsonEncode({'action':action,...data}))
      .timeout(const Duration(seconds:30));
    return parse(result);
  }

  Future<Map<String,dynamic>> submitTrip({
    required String action,required String allocationId,
    required String odometer,required Uint8List photo,
    required String filename,required String mediaType,
    bool pickedUp=false,Map<String,String> charges=const {},
  }) async {
    if(photo.isEmpty||photo.length>5*1024*1024) {
      throw const VendorAuthException('Photo must be under 5 MB.');
    }
    final request=http.MultipartRequest('POST',endpoint);
    request.headers.addAll(await headers());
    request.fields.addAll({'action':action,
      'allocation_id':allocationId,'odometer':odometer,
      'customer_picked_up':pickedUp?'yes':'no',...charges});
    request.files.add(http.MultipartFile.fromBytes(
      'photo',photo,filename:filename,
      contentType:MediaType.parse(mediaType)));
    final response=await _client.send(request).timeout(
      const Duration(seconds:45));
    return parse(await http.Response.fromStream(response));
  }

  void dispose()=>_client.close();
}
