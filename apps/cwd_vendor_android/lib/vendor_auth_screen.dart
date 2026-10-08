import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import 'app_config.dart';
import 'vendor_auth_service.dart';
import 'vendor_dashboard_preview.dart';
import 'vendor_feedback.dart';

const loginTeal=Color(0xFF00897B);
const loginInk=Color(0xFF1E293B);
const loginMuted=Color(0xFF64748B);

enum VendorAuthStep { phone, otp, status }

class VendorAuthGate extends StatefulWidget {
  const VendorAuthGate({super.key});
  @override
  State<VendorAuthGate> createState()=>_VendorAuthGateState();
}

class _VendorAuthGateState extends State<VendorAuthGate> {
  final _auth=VendorAuthService();
  final _mobile=TextEditingController();
  final _mobileFocus=FocusNode();
  final _digits=List.generate(4,(_)=>TextEditingController());
  final _digitFocus=List.generate(4,(_)=>FocusNode());
  VendorLoginChallenge? _challenge;
  VendorLoginResult? _result;
  VendorAuthStep _step=VendorAuthStep.phone;
  bool _loading=true;
  bool _busy=false;
  bool _otpPreview=false;
  String? _error;
  int _resendSeconds=0;
  Timer? _resendTimer;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    VendorLoginResult? previous;
    try { previous=await _auth.restore(); } catch (_) {}
    if(!mounted)return;
    setState(() { _result=previous;_loading=false; });
  }

  @override
  void dispose(){
    _resendTimer?.cancel();
    _auth.dispose();
    _mobile.dispose();
    _mobileFocus.dispose();
    for(final value in _digits){value.dispose();}
    for(final focus in _digitFocus){focus.dispose();}
    super.dispose();
  }

  void _notify(String message){
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(message),behavior:SnackBarBehavior.floating));
  }

  void _timer(){
    _resendTimer?.cancel();
    _resendSeconds=30;
    _resendTimer=Timer.periodic(const Duration(seconds:1),(timer){
      if(!mounted){timer.cancel();return;}
      if(_resendSeconds<=1){
        timer.cancel();
        setState(()=>_resendSeconds=0);
      }else{
        setState(()=>_resendSeconds--);
      }
    });
  }

  void _clearCode(){for(final c in _digits){c.clear();}}

  void _back(){
    VendorFeedback.click();
    _resendTimer?.cancel();
    FocusManager.instance.primaryFocus?.unfocus();
    setState((){
      _step=VendorAuthStep.phone;
      _challenge=null;_error=null;_otpPreview=false;
      _resendSeconds=0;
    });
  }

  Future<void> _sendOtp() async {
    VendorFeedback.click();
    final number=_mobile.text.trim();
    if(!RegExp(r'^[6-9][0-9]{9}$').hasMatch(number)){
      setState(()=>_error='Enter a valid registered 10-digit mobile number.');
      _mobileFocus.requestFocus();
      return;
    }
    if(!AppConfig.ready){
      setState(()=>_error='Login requires an isolated testing backend. '
        'No OTP has been sent.');
      return;
    }
    if(_busy)return;
    setState((){_busy=true;_error=null;});
    try {
      final challenge=await _auth.sendOtp(number);
      if(!mounted)return;
      _clearCode();
      setState((){
        _challenge=challenge;
        _otpPreview=false;
        _step=VendorAuthStep.otp;
      });
      _timer();
      WidgetsBinding.instance.addPostFrameCallback((_){
        if(mounted)_digitFocus.first.requestFocus();
      });
    } on VendorAuthException catch(e){
      if(mounted)setState(()=>_error=e.message);
    } finally{
      if(mounted)setState(()=>_busy=false);
    }
  }

  void _previewNumericOtp(){
    VendorFeedback.click();
    _clearCode();
    setState((){
      _step=VendorAuthStep.otp;
      _otpPreview=true;
      _challenge=null;
      _error=null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_){
      if(mounted)_digitFocus.first.requestFocus();
    });
  }

  void _changed(int index,String value){
    if(value.length>1){
      for(var x=0;x<value.length&&index+x<4;x++){
        _digits[index+x].text=value[x];
      }
      if(index+value.length>=4){
        _digitFocus.last.unfocus();
      }else{
        _digitFocus[index+value.length].requestFocus();
      }
    }else if(value.isNotEmpty){
      if(index<3)_digitFocus[index+1].requestFocus();
      else _digitFocus.last.unfocus();
    }else if(index>0){
      _digitFocus[index-1].requestFocus();
    }
    if(mounted)setState(()=>_error=null);
  }

  Future<void> _verify() async {
    VendorFeedback.click();
    if(_otpPreview||_challenge==null){
      _notify('Numeric keypad preview only. No real OTP was sent.');
      return;
    }
    final otp=_digits.map((d)=>d.text).join();
    if(!RegExp(r'^\d{4}$').hasMatch(otp)){
      setState(()=>_error='Please enter all four OTP digits.');
      return;
    }
    if(_busy)return;
    setState((){_busy=true;_error=null;});
    try{
      final response=await _auth.verifyOtp(_challenge!,otp);
      if(!mounted)return;
      if(response.approved){
        VendorFeedback.accepted();
        setState(()=>_result=response);
      }else{
        setState((){_result=response;_step=VendorAuthStep.status;});
      }
    } on VendorAuthException catch(e){
      if(mounted)setState(()=>_error=e.message);
    }finally{
      if(mounted)setState(()=>_busy=false);
    }
  }

  Future<void> _logout() async {
    VendorFeedback.click();
    await _auth.logout();
    if(!mounted)return;
    _mobile.clear();
    _clearCode();
    setState((){
      _result=null;_challenge=null;_step=VendorAuthStep.phone;_error=null;
    });
  }

  Future<void> _launch(Uri uri) async{
    VendorFeedback.click();
    try{
      if(!await launchUrl(uri,mode:LaunchMode.externalApplication)){
        _notify('Unable to open this service.');
      }
    }catch(_){_notify('Unable to open this service.');}
  }

  void _register(){
    VendorFeedback.click();
    Navigator.push(context,MaterialPageRoute<void>(
      builder:(_)=>const VendorRegisterEntry()));
  }

  @override
  Widget build(BuildContext context){
    if(_loading)return const Scaffold(body:Center(
      child:CircularProgressIndicator(color:loginTeal)));
    if(_result?.approved==true){
      return VendorDashboardPreview(
        onLogout:_logout,approvedVendorName:_result?.name);
    }
    return Scaffold(
      backgroundColor:const Color(0xFFF1F5F9),
      body:SafeArea(child:Center(
        child:ConstrainedBox(
          constraints:const BoxConstraints(maxWidth:480),
          child:SingleChildScrollView(
            keyboardDismissBehavior:ScrollViewKeyboardDismissBehavior.onDrag,
            child:Column(children:[
              _hero(),
              Transform.translate(
                offset:const Offset(0,-18),
                child:Padding(
                  padding:const EdgeInsets.symmetric(horizontal:16),
                  child:_contentCard(),
                ),
              ),
              _support(),
            ]),
          ),
        ),
      )),
    );
  }

  Widget _hero()=>Container(
    width:double.infinity,
    padding:const EdgeInsets.fromLTRB(22,24,22,50),
    decoration:const BoxDecoration(gradient:LinearGradient(
      begin:Alignment.topLeft,end:Alignment.bottomRight,
      colors:[Color(0xFF064E45),Color(0xFF0F766E),Color(0xFF0F172A)])),
    child:Column(children:[
      Row(children:[
        Container(
          padding:const EdgeInsets.all(6),
          decoration:BoxDecoration(
            borderRadius:BorderRadius.circular(14),
            border:Border.all(color:Colors.white24),
            color:Colors.white12),
          child:ClipRRect(
            borderRadius:BorderRadius.circular(9),
            child:Image.asset('assets/images/cwd-logo.png',
              height:48,width:48,fit:BoxFit.cover,
              errorBuilder:(_,error,stack)=>const Icon(
                Icons.directions_car,color:Colors.white,size:42)),
          ),
        ),
        const SizedBox(width:12),
        const Expanded(child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,
          children:[
            Text('CWD Vendor App',style:TextStyle(color:Colors.white,
              fontWeight:FontWeight.w800,fontSize:20)),
            Text('Trusted Trips. Growing Together.',
              style:TextStyle(color:Color(0xFF99F6E4),fontSize:11)),
          ],
        )),
      ]),
      const SizedBox(height:22),
      const Divider(color:Colors.white24,height:1),
      const SizedBox(height:17),
      const Row(children:[
        Expanded(child:_TrustBadge(Icons.verified_user_outlined,
          'Verified\nBookings')),
        SizedBox(width:7),
        Expanded(child:_TrustBadge(Icons.currency_rupee,
          'Fair\nPayouts')),
        SizedBox(width:7),
        Expanded(child:_TrustBadge(Icons.support_agent,
          'Support\nAlways')),
      ]),
    ]),
  );

  Widget _contentCard()=>Container(
    width:double.infinity,
    padding:const EdgeInsets.fromLTRB(21,22,21,22),
    decoration:BoxDecoration(
      color:Colors.white,
      borderRadius:BorderRadius.circular(23),
      boxShadow:const [BoxShadow(
        color:Color(0x230F172A),blurRadius:20,offset:Offset(0,8))]),
    child:AnimatedSwitcher(
      duration:const Duration(milliseconds:260),
      child:switch(_step){
        VendorAuthStep.phone=>_phoneCard(),
        VendorAuthStep.otp=>_otpCard(),
        VendorAuthStep.status=>_statusCard(),
      },
    ),
  );

  Widget _phoneCard()=>Column(
    key:const ValueKey('vendor-phone'),
    crossAxisAlignment:CrossAxisAlignment.stretch,
    children:[
      const Text('Login to Your Account',textAlign:TextAlign.center,
        style:TextStyle(fontSize:21,fontWeight:FontWeight.w800,color:loginInk)),
      const SizedBox(height:5),
      const Text('Enter your registered mobile number to continue',
        textAlign:TextAlign.center,
        style:TextStyle(fontSize:12,color:loginMuted)),
      const SizedBox(height:28),
      const Text('MOBILE NUMBER',style:TextStyle(
        fontSize:11,fontWeight:FontWeight.w800,color:loginMuted)),
      const SizedBox(height:8),
      TextField(
        key:const Key('vendor-mobile-input'),
        controller:_mobile,focusNode:_mobileFocus,
        keyboardType:TextInputType.number,
        textInputAction:TextInputAction.done,
        inputFormatters:[FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(10)],
        style:const TextStyle(fontSize:17,fontWeight:FontWeight.w700),
        decoration:InputDecoration(
          prefixIcon:const Icon(Icons.phone_outlined,color:loginMuted),
          prefix:const Text('+91  | ',style:TextStyle(
            fontWeight:FontWeight.w700,color:loginInk)),
          hintText:'9876543210',filled:true,
          fillColor:const Color(0xFFF8FAFC),
          border:OutlineInputBorder(
            borderRadius:BorderRadius.circular(14)),
          focusedBorder:OutlineInputBorder(
            borderRadius:BorderRadius.circular(14),
            borderSide:const BorderSide(color:loginTeal,width:2))),
        onChanged:(_)=>setState(()=>_error=null),
        onSubmitted:(_)=>_sendOtp(),
      ),
      if(_error!=null)_errorCard(),
      const SizedBox(height:16),
      _primaryButton('Send OTP',Icons.arrow_forward,_sendOtp,
        enabled:!_busy),
      const SizedBox(height:22),
      const Row(children:[
        Expanded(child:Divider()),
        Padding(padding:EdgeInsets.symmetric(horizontal:15),
          child:Text('OR',style:TextStyle(
            color:loginMuted,fontWeight:FontWeight.w800,fontSize:11))),
        Expanded(child:Divider()),
      ]),
      const SizedBox(height:19),
      OutlinedButton.icon(
        key:const Key('vendor-register-now'),
        onPressed:_register,
        icon:const Icon(Icons.person_add_alt_1_outlined),
        label:const Text('New Vendor? Register Now'),
        style:OutlinedButton.styleFrom(
          minimumSize:const Size.fromHeight(50),
          foregroundColor:loginTeal,
          side:const BorderSide(color:loginTeal,width:1.5),
          shape:RoundedRectangleBorder(
            borderRadius:BorderRadius.circular(14))),
      ),
      const SizedBox(height:17),
      const Text('Join CWD vendor network and start receiving bookings',
        textAlign:TextAlign.center,
        style:TextStyle(color:loginMuted,fontSize:11)),
      if(!AppConfig.ready)...[
        const SizedBox(height:15),
        Container(
          padding:const EdgeInsets.all(11),
          decoration:BoxDecoration(
            color:const Color(0xFFFFF5DF),
            borderRadius:BorderRadius.circular(10)),
          child:const Text('Safe-mode UI preview: isolated staging is '
            'not connected. Real OTP and dashboard access are locked.',
            textAlign:TextAlign.center,style:TextStyle(
              color:Color(0xFF956415),fontSize:11))),
        TextButton.icon(
          onPressed:_previewNumericOtp,
          icon:const Icon(Icons.keyboard_alt_outlined),
          label:const Text('Preview numeric OTP keypad')),
      ],
    ],
  );

  Widget _otpCard()=>Column(
    key:const ValueKey('vendor-otp'),
    crossAxisAlignment:CrossAxisAlignment.stretch,
    children:[
      Align(alignment:Alignment.centerLeft,
        child:TextButton.icon(onPressed:_back,
          icon:const Icon(Icons.arrow_back),
          label:const Text('Back to login'))),
      const SizedBox(height:7),
      const CircleAvatar(radius:30,backgroundColor:Color(0xFFCCFBF1),
        child:Icon(Icons.shield_outlined,color:loginTeal,size:29)),
      const SizedBox(height:13),
      const Text('Verify OTP',textAlign:TextAlign.center,
        style:TextStyle(fontSize:21,fontWeight:FontWeight.w800,color:loginInk)),
      const SizedBox(height:5),
      Text(_otpPreview?'Numeric keyboard preview only':
        'Code sent to +91 '+_mobile.text,
        textAlign:TextAlign.center,
        style:const TextStyle(fontSize:12,color:loginMuted)),
      const SizedBox(height:26),
      Row(children:List.generate(4,(index)=>Expanded(
        child:Padding(
          padding:const EdgeInsets.symmetric(horizontal:4),
          child:TextField(
            key:Key('vendor-otp-digit-'+index.toString()),
            controller:_digits[index],
            focusNode:_digitFocus[index],
            keyboardType:TextInputType.number,
            textInputAction:index==3?TextInputAction.done:TextInputAction.next,
            autofillHints:index==0?const [AutofillHints.oneTimeCode]:null,
            inputFormatters:[FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4)],
            textAlign:TextAlign.center,
            style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800),
            decoration:InputDecoration(
              counterText:'',
              filled:true,fillColor:const Color(0xFFF8FAFC),
              contentPadding:const EdgeInsets.symmetric(vertical:17),
              enabledBorder:OutlineInputBorder(
                borderRadius:BorderRadius.circular(14),
                borderSide:const BorderSide(color:Color(0xFFCBD5E1))),
              focusedBorder:OutlineInputBorder(
                borderRadius:BorderRadius.circular(14),
                borderSide:const BorderSide(color:loginTeal,width:2))),
            onChanged:(value)=>_changed(index,value),
            onSubmitted:(_){if(index==3)_verify();},
          ),
        ),
      ))),
      const SizedBox(height:18),
      Row(mainAxisAlignment:MainAxisAlignment.center,children:[
        const Text('Did not receive the code?',
          style:TextStyle(color:loginMuted,fontSize:12)),
        TextButton(
          onPressed:_busy||_resendSeconds>0||_otpPreview?null:_sendOtp,
          child:Text(_resendSeconds>0
            ?'Resend in '+_resendSeconds.toString()+'s':'Resend OTP')),
      ]),
      if(_error!=null)_errorCard(),
      const SizedBox(height:13),
      _primaryButton('Verify & Proceed',Icons.verified_outlined,
        _verify,enabled:!_busy&&!_otpPreview),
      if(_otpPreview)...[
        const SizedBox(height:16),
        const Text('No OTP was sent. This preview only checks the '
          'numeric keypad and the four input boxes.',
          textAlign:TextAlign.center,
          style:TextStyle(color:loginMuted,fontSize:12)),
      ],
    ],
  );

  Widget _statusCard(){
    final result=_result;
    final pending=result?.status=='pending';
    return Column(
      key:const ValueKey('vendor-approval-status'),
      children:[
        CircleAvatar(radius:36,
          backgroundColor:pending?const Color(0xFFFFF3DD):
            const Color(0xFFFEE2E2),
          child:Icon(pending?Icons.hourglass_top_outlined:Icons.info_outline,
            size:37,color:pending?const Color(0xFFB7791C):
              const Color(0xFFB45353))),
        const SizedBox(height:19),
        Text(pending?'Your Approval Is Pending':
          result?.status=='correction'?'Correction Required':
          result?.status=='rejected'?'Registration Not Approved':
          result?.status=='suspended'?'Account Suspended':
          'Contact CWD Team',
          textAlign:TextAlign.center,
          style:const TextStyle(fontSize:21,fontWeight:FontWeight.w800)),
        const SizedBox(height:11),
        Text(result?.message??'Please contact CWD team.',
          textAlign:TextAlign.center,
          style:const TextStyle(fontSize:13,color:loginMuted,height:1.5)),
        const SizedBox(height:22),
        _primaryButton('Contact CWD Team',Icons.support_agent,
          ()=>_launch(Uri.parse('https://wa.me/919702988465'))),
        const SizedBox(height:12),
        TextButton(onPressed:_back,child:const Text('Back to Login')),
      ],
    );
  }

  Widget _errorCard()=>Padding(
    padding:const EdgeInsets.only(top:9),
    child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Icon(Icons.error_outline,color:Color(0xFFE11D48),size:18),
      const SizedBox(width:6),
      Expanded(child:Text(_error??'',style:const TextStyle(
        color:Color(0xFFBE123C),fontSize:12))),
    ]),
  );

  Widget _primaryButton(String text,IconData icon,VoidCallback action,
      {bool enabled=true})=>FilledButton.icon(
    onPressed:enabled?action:null,
    icon:_busy?const SizedBox(width:17,height:17,
      child:CircularProgressIndicator(color:Colors.white,strokeWidth:2))
      :Icon(icon,size:19),
    label:Text(_busy?'Please wait...':text,
      style:const TextStyle(fontWeight:FontWeight.w800)),
    style:FilledButton.styleFrom(
      foregroundColor:Colors.white,backgroundColor:loginTeal,
      minimumSize:const Size.fromHeight(52),
      shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(15))),
  );

  Future<void> _launch(Uri uri) async{
    VendorFeedback.click();
    try{await launchUrl(uri,mode:LaunchMode.externalApplication);}
    catch(_){_notify('Unable to open support.');}
  }

  Widget _support()=>Padding(
    padding:const EdgeInsets.fromLTRB(16,0,16,22),
    child:Column(children:[
      Row(mainAxisAlignment:MainAxisAlignment.spaceEvenly,children:[
        _supportLink(Icons.phone_outlined,'Need Help?',
          Uri(scheme:'tel',path:'9702988465')),
        _supportLink(Icons.mail_outline,'Email Us',
          Uri(scheme:'mailto',
            path:'carwithdriver.vikhroli@gmail.com')),
        _supportLink(Icons.chat_bubble_outline,'WhatsApp',
          Uri.parse('https://wa.me/919702988465')),
      ]),
      const SizedBox(height:15),
      const Text('Your information is safe with CWD',
        style:TextStyle(color:loginMuted,fontSize:11)),
    ]),
  );

  Widget _supportLink(IconData icon,String label,Uri uri)=>InkWell(
    onTap:()=>_launch(uri),
    borderRadius:BorderRadius.circular(12),
    child:Padding(padding:const EdgeInsets.all(8),
      child:Column(children:[
        CircleAvatar(radius:19,backgroundColor:const Color(0xFFCCFBF1),
          child:Icon(icon,color:loginTeal,size:18)),
        const SizedBox(height:6),
        Text(label,style:const TextStyle(fontSize:11,
          fontWeight:FontWeight.w700,color:loginInk)),
      ]),
    ),
  );
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge(this.icon,this.label);
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.symmetric(vertical:11,horizontal:3),
    decoration:BoxDecoration(
      color:Colors.white10,
      border:Border.all(color:Colors.white24),
      borderRadius:BorderRadius.circular(12)),
    child:Column(children:[
      Icon(icon,color:const Color(0xFF5EEAD4),size:18),
      const SizedBox(height:5),
      Text(label,textAlign:TextAlign.center,
        style:const TextStyle(color:Colors.white,
          fontWeight:FontWeight.w600,fontSize:10)),
    ]),
  );
}

/// Uses the existing vendor registration form, never a second signup system.
class VendorRegisterEntry extends StatelessWidget {
  const VendorRegisterEntry({super.key});
  @override
  Widget build(BuildContext context){
    final origin=AppConfig.origin;
    final ready=AppConfig.ready&&origin!=null;
    final url=ready?origin.resolve('/vendor-register'):null;
    return Scaffold(
      appBar:AppBar(title:const Text('Vendor Registration'),
        backgroundColor:const Color(0xFF064E45),
        foregroundColor:Colors.white),
      body:ready&&url!=null
        ?InAppWebView(
          initialUrlRequest:URLRequest(url:WebUri(url.toString())),
          initialSettings:InAppWebViewSettings(
            javaScriptEnabled:true,domStorageEnabled:true,
            useShouldOverrideUrlLoading:true,isInspectable:false),
          shouldOverrideUrlLoading:(controller,action) async {
            final candidate=action.request.url;
            if(candidate==null)return NavigationActionPolicy.CANCEL;
            final link=Uri.tryParse(candidate.toString());
            return link!=null&&link.scheme=='https'&&link.host==origin.host
              ?NavigationActionPolicy.ALLOW
              :NavigationActionPolicy.CANCEL;
          },
        )
        :Center(child:Padding(
          padding:const EdgeInsets.all(25),
          child:Column(mainAxisSize:MainAxisSize.min,children:[
            const Icon(Icons.how_to_reg_outlined,color:loginTeal,size:52),
            const SizedBox(height:14),
            const Text('Existing CWD Vendor Registration',
              textAlign:TextAlign.center,
              style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
            const SizedBox(height:12),
            const Text('The existing Business → Payout → Vehicle → Consent '
              'form will appear here when isolated staging is ready. '
              'Existing vendors do not need to register again.',
              textAlign:TextAlign.center,
              style:TextStyle(color:loginMuted,height:1.5)),
            const SizedBox(height:21),
            OutlinedButton(
              onPressed:()=>Navigator.pop(context),
              child:const Text('Back to Login')),
          ]),
        )),
    );
  }
}
