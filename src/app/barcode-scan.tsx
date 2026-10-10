import { useAppTabNavigation } from '@/components/app-tab-navigation';
import { Border, Colors, Spacing } from '@/constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ProductInfo = {
  name: string;
  brand?: string;
  category?: string;
};

type BarcodeLookupResponse = {
  products?: {
    title?: string;
    brand?: string;
    category?: string;
  }[];
  message?: string;
  error?: string;
};

export default function BarcodeScan() {
  const { navigateToTab } = useAppTabNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const scannedCodeRef = useRef<string | null>(null);

  if (!permission) {
    return <View style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Text style={styles.permissionIconText}>⌁</Text>
          </View>

          <View style={styles.permissionContent}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>

            <Text style={styles.permissionMessage}>
              DonateSmart uses your camera to scan barcodes and identify items.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={requestPermission}
          >
            <Text style={styles.primaryButtonText}>Enable Camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const lookupProduct = async (upc: string) => {
    const currentRequestId = ++requestIdRef.current;
    const apiKey = process.env.EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY;

    setLoading(true);
    setLookupError(null);

    try {
      if (!apiKey) {
        throw new Error(
          'Barcode Lookup API key is missing. Add EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY to your environment.',
        );
      }

      const response = await fetch(
        `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(upc)}&formatted=y&key=${encodeURIComponent(apiKey)}`,
      );
      const data: BarcodeLookupResponse = await response.json();

      if (!response.ok) {
        console.warn('Barcode Lookup', response.status, data);
        throw new Error(
          data.message || data.error || `Barcode Lookup returned ${response.status}.`,
        );
      }

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const item = data.products?.[0];
      setProduct(
        item
          ? {
              name: item.title?.trim() || upc,
              brand: item.brand?.trim() || undefined,
              category: item.category?.trim() || undefined,
            }
          : null,
      );
    } catch (error) {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      console.error('Barcode Lookup request failed', error);
      setProduct(null);
      setLookupError(
        error instanceof Error ? error.message : 'Barcode Lookup request failed.',
      );
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (loading || scannedCodeRef.current === data) {
      return;
    }

    scannedCodeRef.current = data;
    setScannedCode(data);
    lookupProduct(data);
  };

  const reset = () => {
    requestIdRef.current += 1;
    scannedCodeRef.current = null;
    setScannedCode(null);
    setProduct(null);
    setLookupError(null);
    setLoading(false);
  };

  const getCategoryParts = (category?: string) => {
    const cleaned = category?.trim() ?? '';

    if (!cleaned) {
      return {
        fullPath: '',
        topLevel: '',
        deepestBranch: '',
      };
    }

    const parts = cleaned
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      fullPath: parts.join(' > '),
      topLevel: parts[0] ?? '',
      deepestBranch: parts[parts.length - 1] ?? cleaned,
    };
  };

  const continueToManualEntry = (prefill?: string) => {
    router.push({
      pathname: '/manual-entry',
      params: {
        prefill: prefill ?? '',
      },
    });
  };

  const confirmDetectedCategory = () => {
    if (!product || !categoryParts.fullPath) {
      return;
    }

    navigateToTab('centers', {
      category: categoryParts.fullPath,
      topLevel: categoryParts.topLevel,
      name: categoryParts.deepestBranch,
    }, { animated: false });
    router.dismiss();
  };

  const categoryParts = getCategoryParts(product?.category);

  return (
    <View style={styles.blackContainer}>
      {!scannedCode ? (
        <>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr',
                'ean13',
                'ean8',
                'upc_a',
                'upc_e',
              ],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />

          <View style={styles.scanOverlay} pointerEvents="none">
            <View style={styles.scanFrame} />
          </View>
        </>
      ) : (
        <SafeAreaView style={styles.resultWrap}>
          <View style={styles.resultContent}>
            <View style={styles.card}>
              <Text style={styles.resultLabel}>CONFIRM CATEGORY</Text>

              <View style={styles.cardDivider} />

              {loading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator
                    size="large"
                    color={Colors.primary}
                  />

                  <Text style={styles.loadingText}>
                    Identifying item…
                  </Text>
                </View>
              ) : null}

              {!loading && categoryParts.fullPath ? (
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>
                    {categoryParts.deepestBranch}
                  </Text>

                  <Text style={styles.categoryPath}>
                    {categoryParts.fullPath}
                  </Text>
                </View>
              ) : null}

              {!loading && lookupError ? (
                <View style={styles.notFoundState}>
                  <Text style={styles.notFoundTitle}>Lookup failed</Text>

                  <Text style={styles.notFoundText}>{lookupError}</Text>
                </View>
              ) : null}

              {!loading && !lookupError && !categoryParts.fullPath ? (
                <View style={styles.notFoundState}>
                  <Text style={styles.notFoundTitle}>
                    Category not found
                  </Text>

                  <Text style={styles.notFoundText}>
                    You can choose a category manually.
                  </Text>
                </View>
              ) : null}
            </View>

            {!loading ? (
              <View style={styles.actions}>
                {categoryParts.fullPath ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.primaryButtonPressed,
                      ]}
                      onPress={confirmDetectedCategory}
                    >
                      <Text style={styles.primaryButtonText}>
                        Confirm Category
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.secondaryActionButton,
                        pressed &&
                          styles.secondaryActionButtonPressed,
                      ]}
                      onPress={() =>
                        continueToManualEntry(categoryParts.deepestBranch)
                      }
                    >
                      <Text style={styles.secondaryActionText}>
                        Edit Category
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                    onPress={() => continueToManualEntry()}
                  >
                    <Text style={styles.primaryButtonText}>
                      Choose Category Manually
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.scanAgainButton,
                    pressed && styles.scanAgainButtonPressed,
                  ]}
                  onPress={reset}
                >
                  <Text style={styles.scanAgainText}>
                    Scan Again
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blackContainer: {
    flex: 1,
    backgroundColor: '#000',
  },

  camera: {
    flex: 1,
  },

  scanOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },

  scanFrame: {
    width: 245,
    height: 155,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
  },

  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: Spacing.screen,
  },

  permissionCard: {
    width: '100%',
    backgroundColor: Colors.card,
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 22,
  },

  permissionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: Border.width,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  permissionIconText: {
    color: Colors.primary,
    fontSize: 27,
    lineHeight: 30,
    fontWeight: '400',
  },

  permissionContent: {
    paddingBottom: 22,
    borderBottomWidth: Border.width,
    borderBottomColor: Colors.border,
  },

  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Colors.text,
    marginBottom: 7,
  },

  permissionMessage: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },

  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  primaryButtonPressed: {
    backgroundColor: Colors.card,
    transform: [{ scale: 0.985 }],
  },

  primaryButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  resultWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },

  resultContent: {
    marginHorizontal: Spacing.screen,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 22,
    borderWidth: Border.width,
    borderColor: Colors.border,
    marginBottom: 12,
  },

  resultLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },

  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 18,
  },

  loadingState: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },

  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },

  categoryInfo: {
    alignItems: 'center',
  },

  categoryName: {
    color: Colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: 10,
  },

  categoryPath: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  notFoundState: {
    alignItems: 'center',
    paddingVertical: 4,
  },

  notFoundTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 5,
  },

  notFoundText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },

  actions: {
    gap: 9,
  },

  secondaryActionButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryActionButtonPressed: {
    backgroundColor: Colors.background,
  },

  secondaryActionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  scanAgainButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanAgainButtonPressed: {
    opacity: 0.55,
  },

  scanAgainText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
