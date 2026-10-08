import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_config.dart';
import 'vendor_dashboard_preview.dart';
import 'link_vault.dart';
import 'vendor_link.dart';

const navy = Color(0xFF122F50);
const green = Color(0xFF128467);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CwdVendorApp());
}

class CwdVendorApp extends StatelessWidget {
  const CwdVendorApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'CWD Vendor TEST',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: navy),
          scaffoldBackgroundColor: const Color(0xFFF4F7FB),
        ),
        home: AppConfig.ready ? const VendorHome() : const VendorDashboardPreview(),
      );
}

class VendorHome extends StatefulWidget {
  const VendorHome({super.key});
  @override
  State<VendorHome> createState() => _VendorHomeState();
}

class _VendorHomeState extends State<VendorHome> {
  final _vault = LinkVault();
  final _input = TextEditingController();
  List<SavedVendorLink> _saved = const [];
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final items = await _vault.load();
      if (mounted) {
        setState(() {
          _saved = items;
          _busy = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _busy = false);
      _notice('Secure storage unavailable.');
    }
  }

  void _notice(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  Future<void> _paste() async {
    final content = (await Clipboard.getData('text/plain'))?.text ?? '';
    if (!mounted) return;
    if (content.isEmpty) {
      _notice('Copy a CWD testing booking link first.');
    } else {
      setState(() => _input.text = content.trim());
    }
  }

  Future<void> _open([String? text]) async {
    if (!AppConfig.ready) {
      _notice('Testing backend is not isolated/configured.');
      return;
    }
    final link = VendorLink.parse(text ?? _input.text);
    if (link == null) {
      _notice('Invalid testing link. Production links are blocked.');
      return;
    }
    try {
      await _vault.save(link);
      await _refresh();
    } catch (_) {
      _notice('Could not store this link securely.');
      return;
    }
    if (!mounted) return;
    FocusScope.of(context).unfocus();
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => VendorWebPage(url: link.uri, title: link.title),
    ));
  }

  void _register() {
    final origin = AppConfig.origin;
    if (!AppConfig.ready || origin == null) {
      _notice('Staging backend isolation must be verified first.');
      return;
    }
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => VendorWebPage(
        url: origin.resolve('/vendor-register'),
        title: 'Vendor Registration',
      ),
    ));
  }

  Future<void> _remove(Uri uri) async {
    await _vault.remove(uri);
    await _refresh();
  }

  Future<void> _clear() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Clear saved links?'),
        content: const Text('Removes saved secure links from this device only.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await _vault.clear();
      await _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = AppConfig.ready;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        title: const Text('CWD Vendor'),
        actions: const [
          Center(child: Padding(
            padding: EdgeInsets.only(right: 16),
            child: Text('TESTING', style: TextStyle(
              color: Color(0xFF91E7CE), fontSize: 11,
              fontWeight: FontWeight.w800, letterSpacing: 1.2,
            )),
          )),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
          Card(
            color: navy,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.asset(
                      'assets/images/cwd-logo.png',
                      width: 65,
                      height: 65,
                      fit: BoxFit.cover,
                      errorBuilder: (_, error, stack) => const SizedBox(
                        width: 65, height: 65,
                        child: Icon(Icons.directions_car,
                          color: Colors.white, size: 38),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Vendor Operations', style: TextStyle(
                        color: Colors.white, fontSize: 19,
                        fontWeight: FontWeight.w800,
                      )),
                      SizedBox(height: 6),
                      Text('Offers • Allocations • Trips', style: TextStyle(
                        color: Color(0xFFD8E4F1), fontSize: 12,
                      )),
                    ],
                  )),
                ],
              ),
            ),
          ),
          if (!ready) const Card(
            color: Color(0xFFFFF2D8),
            child: Padding(
              padding: EdgeInsets.all(14),
              child: Row(children: [
                Icon(Icons.lock_outline, color: Color(0xFF956400)),
                SizedBox(width: 10),
                Expanded(child: Text(
                  'Safe mode: booking operations are locked until an isolated '
                  'testing backend is verified. Live bookings remain protected.',
                )),
              ]),
            ),
          ),
          const SizedBox(height: 22),
          const Text('Open secure booking link', style: TextStyle(
            fontSize: 17, fontWeight: FontWeight.w800, color: navy,
          )),
          const SizedBox(height: 7),
          const Text(
            'Paste the testing booking offer or allocation link sent by CWD.',
            style: TextStyle(fontSize: 13, color: Color(0xFF5B6880)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _input,
            minLines: 2, maxLines: 4,
            autocorrect: false, enableSuggestions: false,
            decoration: InputDecoration(
              filled: true, fillColor: Colors.white,
              hintText: 'Paste staging vendor booking link',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12)),
              suffixIcon: IconButton(
                icon: const Icon(Icons.content_paste),
                tooltip: 'Paste clipboard',
                onPressed: _paste,
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: ready ? () => _open() : null,
            icon: const Icon(Icons.open_in_new),
            label: const Text('Open booking'),
            style: FilledButton.styleFrom(
              backgroundColor: green, minimumSize: const Size.fromHeight(50)),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: ready ? _register : null,
            icon: const Icon(Icons.app_registration),
            label: const Text('Vendor / Vehicle Registration'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(50)),
          ),
          const SizedBox(height: 24),
          Row(children: [
            const Expanded(child: Text('Saved booking links',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
            if (_saved.isNotEmpty) TextButton(
              onPressed: _clear, child: const Text('Clear all')),
          ]),
          if (_busy)
            const Center(child: CircularProgressIndicator())
          else if (_saved.isEmpty)
            const Card(child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('No saved links yet. Open a test link to save it '
                'securely on this phone.'),
            ))
          else
            ..._saved.map((entry) => Card(child: ListTile(
              leading: Icon(
                entry.link.kind == VendorLinkKind.offer
                    ? Icons.local_offer_outlined
                    : Icons.route_outlined,
                color: green,
              ),
              title: Text(entry.link.title),
              subtitle: Text('Saved on device'),
              onTap: ready ? () => _open(entry.link.uri.toString()) : null,
              trailing: IconButton(
                tooltip: 'Remove link',
                icon: const Icon(Icons.close),
                onPressed: () => _remove(entry.link.uri),
              ),
            ))),
          const SizedBox(height: 22),
          const Center(child: Text(
            'CWD Vendor • Internal testing only',
            style: TextStyle(color: Color(0xFF68778A), fontSize: 11),
          )),
        ],
      ),
    );
  }
}

class VendorWebPage extends StatefulWidget {
  const VendorWebPage({super.key, required this.url, required this.title});
  final Uri url;
  final String title;

  @override
  State<VendorWebPage> createState() => _VendorWebPageState();
}

class _VendorWebPageState extends State<VendorWebPage> {
  InAppWebViewController? _web;
  bool _loading = true;
  String? _error;

  bool _trusted(Uri uri) {
    final origin = AppConfig.origin;
    return origin != null && uri.scheme == 'https' &&
        uri.host == origin.host && !uri.hasPort &&
        uri.userInfo.isEmpty;
  }

  bool _externalAllowed(Uri uri) {
    if (['tel', 'sms', 'mailto'].contains(uri.scheme)) return true;
    if (uri.scheme != 'https') return false;
    return const <String>{
      'www.google.com', 'google.com', 'maps.google.com',
      'maps.app.goo.gl', 'wa.me', 'api.whatsapp.com',
    }.contains(uri.host.toLowerCase());
  }

  Future<NavigationActionPolicy> _navigate(Uri uri) async {
    if (_trusted(uri)) return NavigationActionPolicy.ALLOW;
    if (_externalAllowed(uri)) {
      final opened = await launchUrl(
        uri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) _notice('Unable to open the external app.');
    } else if (mounted) {
      _notice('External navigation blocked for testing safety.');
    }
    return NavigationActionPolicy.CANCEL;
  }

  void _notice(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    }
  }

  Future<void> _back() async {
    if (await _web?.canGoBack() ?? false) {
      await _web?.goBack();
    } else if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) _back();
    },
    child: Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: navy, foregroundColor: Colors.white,
        leading: IconButton(
          onPressed: _back, icon: const Icon(Icons.arrow_back)),
        actions: [
          IconButton(
            tooltip: 'Reload', icon: const Icon(Icons.refresh),
            onPressed: () => _web?.reload()),
        ],
      ),
      body: !AppConfig.ready
          ? const Center(child: Text('Safe mode: staging not verified.'))
          : Stack(children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(widget.url.toString())),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  useShouldOverrideUrlLoading: true,
                  useHybridComposition: true,
                  supportZoom: false,
                  isInspectable: false,
                ),
                onWebViewCreated: (controller) => _web = controller,
                onLoadStart: (controller, url) {
                  if (mounted) {
                    setState(() {
                      _loading = true;
                      _error = null;
                    });
                  }
                },
                onLoadStop: (controller, url) {
                  if (mounted) {
                    setState(() => _loading = false);
                  }
                },
                onReceivedError: (controller, request, error) {
                  if (request.isForMainFrame == true && mounted) {
                    setState(() {
                      _loading = false;
                      _error = 'Vendor page could not load. '
                          'Check internet and protected staging access.';
                    });
                  }
                },
                shouldOverrideUrlLoading: (controller, navigation) async {
                  final uri = navigation.request.url;
                  if (uri == null) return NavigationActionPolicy.CANCEL;
                  return _navigate(Uri.parse(uri.toString()));
                },
                onCreateWindow: (controller, action) async {
                  final uri = action.request.url;
                  if (uri != null) await _navigate(Uri.parse(uri.toString()));
                  return false;
                },
                onPermissionRequest: (controller, request) async {
                  final site = Uri.tryParse(request.origin.toString());
                  final cameraOnly = request.resources.isNotEmpty &&
                      request.resources.every((item) =>
                        RegExp('camera|video', caseSensitive: false)
                            .hasMatch(item.toString()));
                  if (site == null || !_trusted(site) || !cameraOnly) {
                    return PermissionResponse(
                      resources: request.resources,
                      action: PermissionResponseAction.DENY);
                  }
                  final granted = await Permission.camera.request();
                  return PermissionResponse(
                    resources: request.resources,
                    action: granted.isGranted
                        ? PermissionResponseAction.GRANT
                        : PermissionResponseAction.DENY);
                },
              ),
              if (_loading) const LinearProgressIndicator(minHeight: 3),
              if (_error != null) Center(child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.wifi_off, size: 44),
                  const SizedBox(height: 12),
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => _web?.reload(),
                    child: const Text('Try again')),
                ]),
              )),
            ]),
    ),
  );
}
