import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../widgets/modern_ui.dart';

class CustomerProfileScreen extends StatefulWidget {
  const CustomerProfileScreen({super.key, required this.onLogout});

  final VoidCallback onLogout;

  @override
  State<CustomerProfileScreen> createState() => _CustomerProfileScreenState();
}

class _CustomerProfileScreenState extends State<CustomerProfileScreen> {
  @override
  Widget build(BuildContext context) {
    final auth = AuthService.instance;
    final theme = Theme.of(context);
    final name = auth.displayName ?? auth.username ?? 'Customer';
    final phone = auth.phoneNumber;

    return PremiumBackground(
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Profile',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 20),
            ModernCard(
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: kBrandBlue.withOpacity(0.12),
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : 'C',
                      style: const TextStyle(
                        color: kBrandBlue,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (auth.email != null)
                          Text(
                            auth.email!,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _ProfileTile(
              icon: Icons.phone_android_outlined,
              title: phone == null || phone.isEmpty
                  ? 'Add phone number'
                  : 'Phone number',
              subtitle: phone == null || phone.isEmpty
                  ? 'Required so we can SMS you when your provider arrives'
                  : phone,
              destructive: phone == null || phone.isEmpty,
              onTap: () => _editPhone(context),
            ),
            _ProfileTile(
              icon: Icons.help_outline_rounded,
              title: 'How it works',
              subtitle: 'Request, match, pay, track',
              onTap: () => _showHowItWorks(context),
            ),
            _ProfileTile(
              icon: Icons.payments_outlined,
              title: 'M-Pesa payments',
              subtitle: 'KES 50 connection fee per job',
              onTap: () {},
            ),
            _ProfileTile(
              icon: Icons.logout_rounded,
              title: 'Sign out',
              subtitle: 'Log out of this device',
              onTap: widget.onLogout,
              destructive: true,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _editPhone(BuildContext context) async {
    final auth = AuthService.instance;
    final controller = TextEditingController(text: auth.phoneNumber ?? '');

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetCtx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            24,
            16,
            24,
            24 + MediaQuery.of(sheetCtx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Add your phone number',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                'We send you an SMS the moment your provider is within 500 m '
                'and use it for fallback options.',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9+\- ]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  prefixIcon: Icon(Icons.phone_android_outlined),
                  helperText: 'e.g. 0712345678',
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.pop(sheetCtx, false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () async {
                        final value = controller.text.trim();
                        final cleaned =
                            value.replaceAll(RegExp(r'[\s+\-]'), '');
                        if (cleaned.length < 10) {
                          ScaffoldMessenger.of(sheetCtx).showSnackBar(
                            const SnackBar(
                              content: Text('Enter a valid phone number'),
                            ),
                          );
                          return;
                        }
                        final ok = await auth.updatePhoneNumber(value);
                        if (!sheetCtx.mounted) return;
                        Navigator.pop(sheetCtx, ok);
                      },
                      child: const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );

    if (saved == true && mounted) {
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Phone number saved')),
      );
    }
  }

  void _showHowItWorks(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'How S-Link works',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 16),
              _Step(number: '1', text: 'Search for a service with voice or text'),
              _Step(number: '2', text: 'Pick a matched provider nearby'),
              _Step(number: '3', text: 'Provider accepts — pay KES 50 via M-Pesa'),
              _Step(number: '4', text: 'Track live location until the job is done'),
              _Step(number: '5', text: 'Rate your provider to help the community'),
            ],
          ),
        );
      },
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: ModernCard(
        onTap: onTap,
        child: Row(
          children: [
            Icon(icon, color: destructive ? Colors.red : kBrandBlue),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: destructive ? Colors.red : null,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Colors.grey),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.text});

  final String number;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: kBrandBlue,
            child: Text(
              number,
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
