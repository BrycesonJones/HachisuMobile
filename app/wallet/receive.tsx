import { PaymentPlaceholderScreen } from '@/components/payments/payment-placeholder-screen';

/** Placeholder until the Receive flow is built (Send shipped first). */
export default function ReceiveScreen() {
  return (
    <PaymentPlaceholderScreen
      icon="arrow-downward"
      title="Receive"
      description="Receiving bitcoin straight from the dashboard is on its way. Until then, share an invoice or payment request to get paid."
    />
  );
}
