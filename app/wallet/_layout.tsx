import { Stack } from 'expo-router';

import { SendFlowProvider } from '@/components/wallet/send-flow-context';

/**
 * Wallet actions stack (Send / Receive). The SendFlowProvider scopes the send
 * flow's state machine to this stack, so leaving the stack unmounts and
 * discards any half-finished send.
 */
export default function WalletLayout() {
  return (
    <SendFlowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SendFlowProvider>
  );
}
