import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'app_config.dart';

class VendorAuthException implements Exception {
  const VendorAuthException(this.message,{this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class VendorLoginChallenge {
  const VendorLoginChallenge({
    required this.token,required this.otpLength,required this.expiresIn,
  });
  final String token;
  final int otpLength;
  final int expiresIn;
}

class VendorLoginResult {
  const VendorLoginResult({
    required this.status,required this.message,
    this.name,this.code,
  });
  final String status;
  final String message;
  final String? name;
  final String? code;
  bool get approved => status=='approved';
}

class VendorAuthService {
  VendorAuthService({http.Client? client}) :
    _http=client??http.Client(),_ownClient=client==null;

  final http.Client _http;
  final bool _ownClient;
  static const _storage=FlutterSecureStorage();
  static const _sessionKey='cwd_vendor_login_session_v1';

  Uri get _url {
    final origin=AppConfig.origin;
    if (!AppConfig.ready||origin==null) {
      throw const VendorAuthException(
        'Isolated testing backend is not ready. OTP login is locked.');
    }
    return origin.resolve('/api/vendor-app-auth');
  }

  Future<Map<String,dynamic>> _request(String method,{
    Map<String,dynamic>? data,String? token,
  }) async {
    try {
      final response=method=='GET'
        ?await _http.get(_url,headers:{
          if(token!=null)'Authorization':'Bearer $token',
          'Accept':'application/json',
        }).timeout(const Duration(seconds:20))
        :await _http.post(_url,headers:{
          'Content-Type':'application/json',
          'Accept':'application/json',
          if(token!=null)'Authorization':'Bearer $token',
        },body:jsonEncode(data??{})).timeout(const Duration(seconds:20));
      final decoded=jsonDecode(response.body);
      if(decoded is! Map)throw const VendorAuthException(
        'Unexpected response from vendor server.');
      final body=Map<String,dynamic>.from(decoded);
      if(response.statusCode>=400||body['success']!=true){
        throw VendorAuthException(
          (body['message']??'Unable to complete the request.').toString(),
          statusCode:response.statusCode);
      }
      return body;
    } on VendorAuthException {
      rethrow;
    } catch (_){
      throw const VendorAuthException(
        'Unable to connect. Check your internet or staging access.');
    }
  }

  Future<VendorLoginChallenge> sendOtp(String mobile) async {
    final result=await _request('POST',data:{
      'action':'send_otp','mobile':mobile,
    });
    final token=(result['challenge']??'').toString();
    if(!RegExp(r'^[a-f0-9]{64}$').hasMatch(token)){
      throw const VendorAuthException('Invalid OTP challenge returned.');
    }
    final length=(result['otp_length'] as num?)?.toInt()??4;
    if(length<4||length>6)throw const VendorAuthException(
      'Unsupported OTP format.');
    return VendorLoginChallenge(token:token,otpLength:length,
      expiresIn:(result['expires_in'] as num?)?.toInt()??300);
  }

  Future<VendorLoginResult> verifyOtp(
      VendorLoginChallenge challenge,String code) async {
    final result=await _request('POST',data:{
      'action':'verify_otp','challenge':challenge.token,'otp':code,
    });
    final status=(result['status']??'').toString();
    final token=(result['session_token']??'').toString();
    if(status=='approved'){
      if(!RegExp(r'^[a-f0-9]{64}$').hasMatch(token)){
        throw const VendorAuthException('Invalid vendor session.');
      }
      await _storage.write(key:_sessionKey,value:token);
    } else {
      await _storage.delete(key:_sessionKey);
    }
    return VendorLoginResult(status:status,
      message:(result['message']??'').toString(),
      name:result['vendor_name']?.toString(),
      code:result['vendor_code']?.toString());
  }

  Future<VendorLoginResult?> restore() async {
    if(!AppConfig.ready)return null;
    final token=await _storage.read(key:_sessionKey);
    if(token==null||token.isEmpty)return null;
    try{
      final info=await _request('GET',token:token);
      return VendorLoginResult(status:'approved',message:'Welcome back',
        name:info['vendor_name']?.toString(),
        code:info['vendor_code']?.toString());
    } on VendorAuthException catch (e){
      if(e.statusCode==401||e.statusCode==403){
        await _storage.delete(key:_sessionKey);
      }
      return null;
    }
  }

  Future<void> logout() async {
    final token=await _storage.read(key:_sessionKey);
    try{
      if(token!=null&&AppConfig.ready){
        await _request('POST',token:token,data:{'action':'logout'});
      }
    } catch(_){
      // Clear the local credential even when network logout fails.
      // Its remote lifetime is short and sessions are revocable by CWD.
    } finally {
      await _storage.delete(key:_sessionKey);
    }
  }

  void dispose() {
    if(_ownClient)_http.close();
  }
}
