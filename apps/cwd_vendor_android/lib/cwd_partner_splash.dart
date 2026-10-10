import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Final CWD Partner startup: first frame is native teal, followed by a short
/// illustrated Mumbai/coastal road reveal and a moving car. No network calls.
/// The login screen is presented automatically when the animation finishes.
class CwdPartnerSplash extends StatefulWidget {
  const CwdPartnerSplash({
    super.key,
    required this.child,
    this.duration = const Duration(seconds: 3),
  });

  final Widget child;
  final Duration duration;

  @override
  State<CwdPartnerSplash> createState() => _CwdPartnerSplashState();
}

class _CwdPartnerSplashState extends State<CwdPartnerSplash>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: widget.duration,
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed && mounted) {
          setState(() => _completed = true);
        }
      });
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        child: _completed
            ? KeyedSubtree(
                key: const ValueKey('cwd-partner-login'),
                child: widget.child,
              )
            : AnnotatedRegion<SystemUiOverlayStyle>(
                key: const ValueKey('cwd-partner-splash'),
                value: SystemUiOverlayStyle.light,
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (context, _) {
                    final progress = _controller.value;
                    final entry = Curves.easeOutCubic.transform(
                      math.min(1.0, math.max(0.0, progress * 3.1)),
                    );
                    final titleReveal = Curves.easeOut.transform(
                      math.min(1.0, math.max(0.0, (progress - .20) * 3.4)),
                    );
                    return Scaffold(
                      key: const Key('cwd-partner-splash-screen'),
                      backgroundColor: const Color(0xFF062D34),
                      body: SizedBox.expand(
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Positioned.fill(
                              child: CustomPaint(
                                painter: CitySkyDrivePainter(progress),
                              ),
                            ),
                            Align(
                              alignment: const Alignment(0, -0.53),
                              child: Transform.scale(
                                scale: .81 + entry * .19,
                                child: Opacity(
                                  opacity: entry,
                                  child: Container(
                                    key: const Key('cwd-circular-logo'),
                                    height: 120,
                                    width: 120,
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF075058),
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: const Color(0xFF67E8D3),
                                        width: 2,
                                      ),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF35DBC8)
                                              .withValues(alpha: .15 + .16 * entry),
                                          blurRadius: 28,
                                          spreadRadius: 5,
                                        ),
                                      ],
                                    ),
                                    child: ClipOval(
                                      child: Image.asset(
                                        'assets/images/cwd-logo.png',
                                        key: const Key('cwd-splash-logo-image'),
                                        fit: BoxFit.contain,
                                        errorBuilder: (_, error, stack) =>
                                            const Icon(
                                          Icons.directions_car_rounded,
                                          size: 57,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            Align(
                              alignment: const Alignment(0, -0.08),
                              child: Opacity(
                                opacity: titleReveal,
                                child: Transform.translate(
                                  offset: Offset(0, 12 * (1 - titleReveal)),
                                  child: const Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        'CWD Partner',
                                        key: Key('cwd-partner-brand-title'),
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 30,
                                          letterSpacing: -.8,
                                          shadows: [
                                            Shadow(
                                              color: Color(0x6600212B),
                                              blurRadius: 14,
                                            ),
                                          ],
                                        ),
                                      ),
                                      SizedBox(height: 8),
                                      Text(
                                        'Trusted Trips. Growing Together.',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          color: Color(0xFFD3FFF4),
                                          fontSize: 13,
                                          letterSpacing: .35,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 54,
                              right: 54,
                              bottom: 48,
                              child: Column(
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(5),
                                    child: LinearProgressIndicator(
                                      value: progress,
                                      minHeight: 3,
                                      backgroundColor:
                                          const Color(0x605C9A9A),
                                      valueColor:
                                          const AlwaysStoppedAnimation<Color>(
                                        Color(0xFF70F8DF),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 13),
                                  const Text(
                                    'MORE TRIPS. MORE GROWTH.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Color(0xFFB0DDD6),
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 2.1,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
      );
}

/// Compact stylized skyline + coastal highway. Drawn locally, so it remains
/// crisp on every phone without a remote image or expensive media dependency.
class CitySkyDrivePainter extends CustomPainter {
  const CitySkyDrivePainter(this.progress);

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final screen = Rect.fromLTWH(0, 0, w, h);
    canvas.drawRect(
      screen,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF041E2B),
            Color(0xFF05646A),
            Color(0xFF082C39),
            Color(0xFF041722),
          ],
          stops: [0, .39, .68, 1],
        ).createShader(screen),
    );

    final haze = Paint()
      ..shader = ui.Gradient.radial(
        Offset(w * .69, h * .66),
        w * .78,
        [
          const Color(0x8868C9BB),
          const Color(0x2354A7A0),
          Colors.transparent,
        ],
        [0.0, .52, 1.0],
      );
    canvas.drawRect(screen, haze);

    // A quiet coastal city skyline, seen through dusk haze.
    final skyline = Paint()..color = const Color(0xFF113746);
    for (var i = 0; i < 34; i++) {
      final x = w * (i / 34);
      final bw = w * (.027 + (i % 3) * .007);
      final bh = h * (.052 + ((i * 13) % 19) / 220);
      final top = h * .674 - bh;
      skyline.color = i % 4 == 0
          ? const Color(0xFF184955)
          : const Color(0xFF0B3644);
      canvas.drawRect(Rect.fromLTWH(x, top, bw, bh), skyline);
      if (i % 8 == 0) {
        canvas.drawLine(
          Offset(x + bw * .5, top - h * .022),
          Offset(x + bw * .5, top),
          Paint()
            ..strokeWidth = 1.4
            ..color = const Color(0xFF266775),
        );
      }
      // Small building windows glow as the road reveal finishes.
      final windowColor = Paint()
        ..color = const Color(0xFFFDCE88)
            .withValues(alpha: .20 + .48 * progress);
      for (var j = 0; j < 4; j++) {
        final wy = top + 8 + j * 8;
        if (wy > h * .673 - 5) break;
        if ((i + j) % 3 == 0) {
          canvas.drawRect(
            Rect.fromLTWH(x + bw * .28, wy, 1.5, 2.4),
            windowColor,
          );
        }
      }
    }

    // Water and far shore on the left.
    final water = Path()
      ..moveTo(0, h * .677)
      ..quadraticBezierTo(w * .37, h * .694, w * .82, h * .702)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(
      water,
      Paint()..color = const Color(0xFF062834).withValues(alpha: .92),
    );

    final seaLine = Paint()
      ..color = const Color(0x8060AFB0)
      ..strokeWidth = 1;
    for (var j = 0; j < 6; j++) {
      final yy = h * (.73 + j * .036);
      canvas.drawLine(
        Offset(0, yy),
        Offset(w * (.37 - j * .024), yy + h * .012),
        seaLine,
      );
    }

    // A sweeping coastal highway widening toward the bottom of the phone.
    final road = Path()
      ..moveTo(w * .806, h * .682)
      ..cubicTo(
        w * .77, h * .76,
        w * .43, h * .91,
        w * .14, h * 1.03,
      )
      ..lineTo(w * 1.18, h * 1.03)
      ..cubicTo(
        w * .98, h * .86,
        w * .88, h * .74,
        w * .839, h * .682,
      )
      ..close();
    canvas.drawPath(road, Paint()..color = const Color(0xFF112633));

    final roadShade = Path()
      ..moveTo(w * .815, h * .697)
      ..cubicTo(
        w * .75, h * .79,
        w * .55, h * .90,
        w * .30, h * 1.02,
      )
      ..lineTo(w * .87, h * 1.02)
      ..cubicTo(
        w * .88, h * .82,
        w * .835, h * .73,
        w * .815, h * .697,
      )
      ..close();
    canvas.drawPath(
      roadShade,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(w * .4, h * .7),
          Offset(w, h),
          [
            const Color(0xFF203A48),
            const Color(0xFF0E1D2B),
          ],
        ),
    );

    final roadEdge = Paint()
      ..color = const Color(0xFFC9A878)
          .withValues(alpha: .53 + .33 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawPath(
      Path()
        ..moveTo(w * .812, h * .694)
        ..cubicTo(w * .77, h * .77, w * .46, h * .91, w * .13, h),
      roadEdge,
    );

    // Subtle traffic trail: movement as the car travels toward the city.
    final dashPaint = Paint()
      ..color = const Color(0xFFB4CCCE)
          .withValues(alpha: .38 + .28 * progress)
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < 8; i++) {
      final t = (i + .3 + progress * .55) / 9;
      final yy = h * (.71 + t * t * .32);
      final xx = w * (.828 - t * .24);
      final len = w * (.008 + t * .07);
      canvas.drawLine(
        Offset(xx, yy),
        Offset(xx - len, yy + len * 1.3),
        dashPaint,
      );
    }

    final lamps = Paint()
      ..color = const Color(0xFFF6BA76)
          .withValues(alpha: .35 + .60 * progress);
    for (var i = 0; i < 14; i++) {
      final t = (i + 1) / 15;
      final yy = h * (.68 + t * t * .31);
      final xx = w * (.828 - t * .70);
      canvas.drawCircle(
        Offset(xx, yy),
        1.2 + t * 2.2,
        lamps,
      );
    }

    final movement = Curves.easeInOutCubic.transform(
      math.min(1.0, math.max(0.0, (progress - .33) / .60)),
    );
    // The moving car is drawn separately from the scene: true motion,
    // not just an animated progress bar over a still background.
    _paintMovingCar(
      canvas,
      Offset(
        w * (.52 + .275 * movement),
        h * (.89 - .148 * movement),
      ),
      (w / 390) * (1.0 - .56 * movement),
      .20 + .80 * math.min(1.0, progress * 2.4),
    );
  }

  void _paintMovingCar(Canvas canvas, Offset location,
      double scale, double opacity) {
    canvas.save();
    canvas.translate(location.dx, location.dy);
    canvas.scale(scale);
    canvas.rotate(-.17);

    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: .48 * opacity);
    canvas.drawOval(
      const Rect.fromLTWH(-51, 14, 105, 19),
      shadow,
    );

    final bodyPaint = Paint()
      ..shader = ui.Gradient.linear(
        const Offset(-40, -29),
        const Offset(43, 20),
        [
          const Color(0xFF385665).withValues(alpha: opacity),
          const Color(0xFF071623).withValues(alpha: opacity),
        ],
      );
    final silhouette = Path()
      ..moveTo(-43, 4)
      ..lineTo(-35, -22)
      ..quadraticBezierTo(-28, -33, -16, -34)
      ..lineTo(22, -34)
      ..quadraticBezierTo(36, -30, 40, -20)
      ..lineTo(49, 7)
      ..lineTo(45, 22)
      ..quadraticBezierTo(0, 27, -45, 22)
      ..close();
    canvas.drawPath(silhouette, bodyPaint);

    canvas.drawPath(
      Path()
        ..moveTo(-27, -23)
        ..quadraticBezierTo(-22, -30, -11, -30)
        ..lineTo(19, -30)
        ..quadraticBezierTo(30, -27, 34, -21)
        ..lineTo(37, -8)
        ..lineTo(-33, -8)
        ..close(),
      Paint()
        ..color = const Color(0xFF77B5C1)
            .withValues(alpha: .45 * opacity),
    );

    final lines = Paint()
      ..color = const Color(0xFF8ABBC0)
          .withValues(alpha: .55 * opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    canvas.drawLine(const Offset(-41, 9), const Offset(46, 9), lines);

    final lightPaint = Paint()
      ..color = const Color(0xFFF24342)
          .withValues(alpha: opacity);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(-40, 6, 15, 6),
        const Radius.circular(2)),
      lightPaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(29, 6, 15, 6),
        const Radius.circular(2)),
      lightPaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(-10, 14, 21, 6),
        const Radius.circular(2)),
      Paint()
        ..color = const Color(0xFFB3D0CE)
            .withValues(alpha: .88 * opacity),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CitySkyDrivePainter oldDelegate) =>
      oldDelegate.progress != progress;
}
