import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSendFlow } from '@/components/wallet/send-flow-context';
import { SendScreenScaffold } from '@/components/wallet/send-screen-scaffold';
import { COLORS } from '@/constants/colors';
import {
  parseSendDestination,
  type ParseDestinationResult,
} from '@/lib/send/destination';

/** How long a rejected code's error stays up before scanning resumes. */
const RESCAN_DELAY_MS = 1600;

/**
 * Full-screen Bitcoin QR scanner — the entry point of the send flow. Accepts
 * raw addresses and BIP21 URIs from the camera or (on explicit tap only) the
 * clipboard. Every payload goes through parseSendDestination; nothing
 * unvalidated ever leaves this screen.
 */
export default function SendScanScreen() {
  const router = useRouter();
  const flow = useSendFlow();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Bind the flow to the active store the moment it starts.
  const begunRef = useRef(false);
  useEffect(() => {
    if (!begunRef.current) {
      begunRef.current = true;
      flow.beginFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ask for camera permission on first mount if it's still undetermined.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Blocks a burst of onBarcodeScanned callbacks for the same code, and any
  // scan while an error message is showing.
  const scanLockedRef = useRef(false);
  const rescanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
    },
    [],
  );

  const handlePayload = useCallback(
    (payload: string, source: 'scan' | 'paste') => {
      let result: ParseDestinationResult;
      try {
        result = parseSendDestination(payload);
      } catch {
        // parseSendDestination never throws by contract, but a QR can contain
        // anything — a crash here must be impossible.
        result = {
          ok: false,
          code: 'UNRECOGNIZED',
          message: 'That doesn’t look like a Bitcoin address or payment link.',
        };
      }

      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setScanError(null);
        flow.setDestination(result.destination);
        router.push('/wallet/send/amount' as never);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setScanError(
        source === 'paste' && result.code === 'EMPTY'
          ? 'The clipboard is empty.'
          : result.message,
      );
      if (source === 'scan') {
        rescanTimerRef.current = setTimeout(() => {
          setScanError(null);
          scanLockedRef.current = false;
        }, RESCAN_DELAY_MS);
      }
    },
    [flow, router],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanLockedRef.current) return;
      scanLockedRef.current = true;
      handlePayload(data ?? '', 'scan');
    },
    [handlePayload],
  );

  // Clipboard is read ONLY here, on an explicit tap.
  const onPaste = useCallback(async () => {
    let text = '';
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      setScanError('Could not read the clipboard.');
      return;
    }
    handlePayload(text, 'paste');
  }, [handlePayload]);

  const cameraReady = permission?.granted && !cameraError;

  return (
    <SendScreenScaffold title="Send bitcoin" leadingAction="close">
      <View style={styles.body}>
        <View style={styles.cameraArea}>
          {cameraReady ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcodeScanned}
              onMountError={() => setCameraError(true)}
            />
          ) : (
            <CameraFallback
              permissionDenied={permission != null && !permission.granted}
              canAskAgain={permission?.canAskAgain ?? false}
              cameraError={cameraError}
              onRequestPermission={requestPermission}
            />
          )}

          {/* Scanning frame overlay */}
          {cameraReady ? (
            <View pointerEvents="none" style={styles.frameOverlay}>
              <View style={styles.frame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          ) : null}
        </View>

        {scanError ? (
          <View style={styles.errorCard}>
            <MaterialIcons name="error-outline" size={18} color={ERROR_COLOR} />
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : (
          <Text style={styles.instruction}>Scan a Bitcoin QR code to send bitcoin.</Text>
        )}

        <Pressable
          onPress={onPaste}
          style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Paste"
          accessibilityHint="Reads a Bitcoin address or payment link from the clipboard">
          <MaterialIcons name="content-paste" size={18} color={COLORS.primaryText} />
          <Text style={styles.pasteLabel}>Paste</Text>
        </Pressable>
      </View>
    </SendScreenScaffold>
  );
}

interface CameraFallbackProps {
  permissionDenied: boolean;
  canAskAgain: boolean;
  cameraError: boolean;
  onRequestPermission: () => void;
}

/** Shown instead of the camera: permission pending/denied or hardware failure. */
function CameraFallback({
  permissionDenied,
  canAskAgain,
  cameraError,
  onRequestPermission,
}: CameraFallbackProps) {
  let title = 'Camera starting…';
  let detail: string | null = null;
  let action: { label: string; onPress: () => void } | null = null;

  if (cameraError) {
    title = 'Camera unavailable';
    detail = 'The camera could not be started on this device. You can still paste an address below.';
  } else if (permissionDenied && !canAskAgain) {
    title = 'Camera access is off';
    detail = 'Allow camera access in Settings to scan QR codes, or paste an address below.';
    action = { label: 'Open Settings', onPress: () => Linking.openSettings() };
  } else if (permissionDenied) {
    title = 'Camera access needed';
    detail = 'Hachisu uses the camera only to scan Bitcoin QR codes.';
    action = { label: 'Allow camera', onPress: onRequestPermission };
  }

  return (
    <View style={styles.fallback}>
      <MaterialIcons name="qr-code-scanner" size={40} color={COLORS.secondaryText} />
      <Text style={styles.fallbackTitle}>{title}</Text>
      {detail ? <Text style={styles.fallbackDetail}>{detail}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [styles.fallbackAction, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={action.label}>
          <Text style={styles.fallbackActionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const ERROR_COLOR = '#F87171';
const FRAME_SIZE = 220;
const CORNER = 34;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 20,
  },
  cameraArea: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: COLORS.cardAlt,
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: COLORS.cream,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  instruction: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: ERROR_COLOR,
    textAlign: 'center',
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 16,
    backgroundColor: COLORS.card,
  },
  pressed: {
    opacity: 0.7,
  },
  pasteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  fallbackTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
    textAlign: 'center',
  },
  fallbackDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.secondaryText,
    textAlign: 'center',
  },
  fallbackAction: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  fallbackActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
});
