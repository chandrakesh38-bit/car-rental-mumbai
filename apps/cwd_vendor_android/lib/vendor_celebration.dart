import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'vendor_feedback.dart';

class VendorCelebration extends StatefulWidget {
  const VendorCelebration({super.key});
  @override
  State<VendorCelebration> createState() => _VendorCelebrationState();
}

class _VendorCelebrationState extends State<VendorCelebration>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1350),
  )..forward();

  @override
  void dispose() {
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: SizedBox(
        height: 305,
        child: Stack(children: [
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _animation,
                builder: (context, child) => CustomPaint(
                  painter: _Sparkles(_animation.value),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0.6, end: 1),
                  duration: const Duration(milliseconds: 650),
                  curve: Curves.elasticOut,
                  builder: (context, scale, child) => Transform.scale(
                    scale: scale,
                    child: child,
                  ),
                  child: const Icon(Icons.check_circle_rounded,
                    color: Color(0xFF17A797), size: 72),
                ),
                const SizedBox(height: 15),
                const Text('Congratulations!',
                  style: TextStyle(fontSize: 24,
                    fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                const Text('Booking offer accepted',
                  style: TextStyle(fontSize: 16,
                    fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                const Text('Waiting for CWD admin allotment.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF697586))),
                const SizedBox(height: 17),
                FilledButton(
                  onPressed: () {
                    VendorFeedback.click();
                    Navigator.pop(context);
                  },
                  child: const Text('Continue'),
                ),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _Sparkles extends CustomPainter {
  _Sparkles(this.progress);
  final double progress;
  static const colors = [
    Color(0xFF1AA6A0), Color(0xFFFFBD46),
    Color(0xFF8762D8), Color(0xFFEB627D),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.33);
    final move = Curves.easeOutCubic.transform(progress);
    for (var i = 0; i < 32; i++) {
      final angle = i * math.pi * 2 / 32;
      final radius = 24 + (65 + (i % 4) * 12) * move;
      final opacity = progress > 0.73 ? (1 - progress) / 0.27 : 1.0;
      final paint = Paint()
        ..color = colors[i % colors.length].withValues(
          alpha: opacity.clamp(0.0, 1.0));
      final centerPoint = Offset(
        center.dx + math.cos(angle) * radius,
        center.dy + math.sin(angle) * radius,
      );
      canvas.drawCircle(centerPoint, i % 3 == 0 ? 4 : 2.4, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _Sparkles oldDelegate) =>
      progress != oldDelegate.progress;
}
