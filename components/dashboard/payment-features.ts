import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

/**
 * Metadata for the dashboard PAYMENTS grid. Kept as a small, declarative list so
 * the 2x2 grid can grow or reorder without touching layout code. Each entry maps
 * to a placeholder screen under app/payments/*; real payment functionality is
 * added later behind these same routes.
 */
export interface PaymentFeature {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  /** Expo Router path. Cast at the call site until typed routes regenerate. */
  route: string;
  accessibilityHint: string;
}

export const PAYMENT_FEATURES: readonly PaymentFeature[] = [
  {
    id: 'pos',
    title: 'Point of Sale',
    subtitle: 'Charge now',
    icon: 'shopping-cart',
    route: '/payments/pos',
    accessibilityHint: 'Opens Point of Sale',
  },
  {
    id: 'invoices',
    title: 'Invoices',
    subtitle: 'One-time bill',
    icon: 'receipt-long',
    route: '/payments/invoices',
    accessibilityHint: 'Opens Invoices',
  },
  {
    id: 'requests',
    title: 'Requests',
    subtitle: 'Share a payment link',
    icon: 'ios-share',
    route: '/payments/requests',
    accessibilityHint: 'Opens Payment Requests',
  },
  {
    id: 'pay-button',
    title: 'Pay Button',
    subtitle: 'Embed or share',
    icon: 'link',
    route: '/payments/pay-button',
    accessibilityHint: 'Opens Pay Button',
  },
] as const;
