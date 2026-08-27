// Send-flow state, shared across the Send Bitcoin screens.
//
// The flow is deliberately modeled as an explicit state machine (Part of the
// send design: nothing ever *implies* progress — screens advance the status,
// and "sent" can only be entered from a successful backend broadcast):
//
//   idle -> destination_set -> amount_set -> fetching_fee -> ready_for_review
//        -> creating_transaction -> awaiting_signature -> submitting_signature
//        -> broadcast | failed
//
// The flow BINDS the merchant store at the moment it starts. If the user
// switches stores mid-flow, `storeMismatch` turns true and the wallet layout
// blocks every send screen — a send can never silently continue against a
// different store's wallet. The backend re-verifies ownership + wallet state on
// every call regardless; this guard is the UX half of that contract.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useActiveStore } from '@/contexts/active-store-context';
import type { SendDestination } from '@/lib/send/destination';
import type {
  BroadcastedSend,
  PreparedSend,
  SendFeeOption,
  SendSpeed,
} from '@/lib/btcpay/wallet-send';

export type SendFlowStatus =
  | 'idle'
  | 'destination_set'
  | 'amount_set'
  | 'fetching_fee'
  | 'ready_for_review'
  | 'creating_transaction'
  | 'awaiting_signature'
  | 'submitting_signature'
  | 'broadcast'
  | 'failed';

interface SendFlowState {
  status: SendFlowStatus;
  /** The store this flow is bound to (captured when the flow starts). */
  storeId: string | null;
  storeName: string | null;
  destination: SendDestination | null;
  /** Integer sats the user chose to send (pre-fee; for MAX, the full balance). */
  amountSats: number | null;
  /** True when the user tapped MAX (fee is deducted from the amount). */
  isMax: boolean;
  feeOptions: SendFeeOption[] | null;
  speed: SendSpeed;
  prepared: PreparedSend | null;
  broadcasted: BroadcastedSend | null;
}

interface SendFlowContextValue extends SendFlowState {
  /** True when the flow is bound to a store that is no longer active. */
  storeMismatch: boolean;
  beginFlow: () => void;
  setDestination: (destination: SendDestination) => void;
  setAmount: (amountSats: number, isMax: boolean) => void;
  setFeeOptions: (options: SendFeeOption[]) => void;
  setSpeed: (speed: SendSpeed) => void;
  setStatus: (status: SendFlowStatus) => void;
  setPrepared: (prepared: PreparedSend | null) => void;
  setBroadcasted: (broadcasted: BroadcastedSend) => void;
  reset: () => void;
}

const INITIAL_STATE: SendFlowState = {
  status: 'idle',
  storeId: null,
  storeName: null,
  destination: null,
  amountSats: null,
  isMax: false,
  feeOptions: null,
  speed: 'standard',
  prepared: null,
  broadcasted: null,
};

const SendFlowContext = createContext<SendFlowContextValue | null>(null);

export function SendFlowProvider({ children }: { children: ReactNode }) {
  const { activeStore, activeMerchantStoreId } = useActiveStore();
  const [state, setState] = useState<SendFlowState>(INITIAL_STATE);

  const beginFlow = useCallback(() => {
    setState({
      ...INITIAL_STATE,
      storeId: activeStore?.id ?? null,
      storeName: activeStore?.name ?? null,
    });
  }, [activeStore]);

  const setDestination = useCallback((destination: SendDestination) => {
    setState((prev) => ({
      ...prev,
      destination,
      status: 'destination_set',
      // A new destination invalidates everything downstream of it.
      amountSats: destination.amountSats ?? null,
      isMax: false,
      prepared: null,
      broadcasted: null,
    }));
  }, []);

  const setAmount = useCallback((amountSats: number, isMax: boolean) => {
    setState((prev) => ({
      ...prev,
      amountSats,
      isMax,
      status: 'amount_set',
      prepared: null,
    }));
  }, []);

  const setFeeOptions = useCallback((options: SendFeeOption[]) => {
    setState((prev) => ({ ...prev, feeOptions: options }));
  }, []);

  const setSpeed = useCallback((speed: SendSpeed) => {
    setState((prev) => ({ ...prev, speed, prepared: null }));
  }, []);

  const setStatus = useCallback((status: SendFlowStatus) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const setPrepared = useCallback((prepared: PreparedSend | null) => {
    setState((prev) => ({
      ...prev,
      prepared,
      status: prepared ? 'awaiting_signature' : prev.status,
    }));
  }, []);

  const setBroadcasted = useCallback((broadcasted: BroadcastedSend) => {
    setState((prev) => ({ ...prev, broadcasted, status: 'broadcast' }));
  }, []);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const storeMismatch =
    state.storeId !== null &&
    activeMerchantStoreId !== null &&
    state.storeId !== activeMerchantStoreId;

  const value = useMemo<SendFlowContextValue>(
    () => ({
      ...state,
      storeMismatch,
      beginFlow,
      setDestination,
      setAmount,
      setFeeOptions,
      setSpeed,
      setStatus,
      setPrepared,
      setBroadcasted,
      reset,
    }),
    [
      state,
      storeMismatch,
      beginFlow,
      setDestination,
      setAmount,
      setFeeOptions,
      setSpeed,
      setStatus,
      setPrepared,
      setBroadcasted,
      reset,
    ],
  );

  return <SendFlowContext.Provider value={value}>{children}</SendFlowContext.Provider>;
}

export function useSendFlow(): SendFlowContextValue {
  const ctx = useContext(SendFlowContext);
  if (!ctx) {
    throw new Error('useSendFlow must be used inside SendFlowProvider (app/wallet).');
  }
  return ctx;
}
