import { Colors, Spacing } from '@/constants/theme';
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

export default function BarcodeScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestIdRef = useRef(0);
  const scannedCodeRef = useRef<string | null>(null);

  if (!permission) {
    return <View style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionMessage}>
          DonateSmart uses your camera to scan barcodes and identify items.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Enable Camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const tryUpcItemDb = async (upc: string): Promise<ProductInfo | null> => {
  const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
  const data = await response.json();

  if (!response.ok) {
    console.warn('upcitemdb', response.status, data);
    throw new Error(`upcitemdb ${response.status}`);
  }

  if (!data.items || data.items.length === 0) {
    return null;
  }

  const item = data.items[0];
  return { name: item.title, brand: item.brand, category: item.category };
  };

  const lookupProduct = async (upc: string) => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setNotFound(false);

    for (const lookup of [tryUpcItemDb]) {
      try {
        const result = await lookup(upc);
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        if (result) {
          setNotFound(false);
          setProduct(result);
          setLoading(false);
          return;
        }
      } catch {
        if (currentRequestId !== requestIdRef.current) {
          return;
        }
        continue;
      }
    }

    if (currentRequestId !== requestIdRef.current) {
      return;
    }
    setNotFound(true);
    setLoading(false);
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
    setNotFound(false);
    setLoading(false);
  };

  const getCategoryParts = (category?: string) => {
    const cleaned = category?.trim() ?? '';

    if (!cleaned) {
      return { fullPath: '', topLevel: '', deepestBranch: '' };
    }

    const parts = cleaned.split('>').map((part) => part.trim()).filter(Boolean);
    return {
      fullPath: parts.join(' > '),
      topLevel: parts[0] ?? '',
      deepestBranch: parts[parts.length - 1] ?? cleaned,
    };
  };

  const continueToManualEntry = (prefill?: string) => {
    router.push({
      pathname: '/manual-entry',
      params: { prefill: prefill ?? '' },
    });
  };

  const confirmDetectedCategory = () => {
    if (!product) {
      return;
    }

    const { fullPath, topLevel, deepestBranch } = getCategoryParts(product.category || product.name);
    const categoryValue = fullPath || deepestBranch || product.name || '';
    const topLevelValue = topLevel || categoryValue;

    router.dismissAll();
    router.navigate({
      pathname: '/(tabs)/centers',
      params: {
        category: categoryValue,
        topLevel: topLevelValue,
        name: deepestBranch || product.name || 'Category',
      },
    });
  };

  return (
    <View style={styles.blackContainer}>
      {!scannedCode ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={handleBarcodeScanned}
        />
      ) : (
        <SafeAreaView style={styles.resultWrap}>
          <View style={styles.resultContent}>
            <View style={styles.card}>
              <Text style={styles.codeText}>{scannedCode}</Text>

              {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
              ) : null}

              {!loading && product ? (
                <>
                  <Text style={styles.productName}>{product.name}</Text>
                  {product.brand ? <Text style={styles.detail}>Brand: {product.brand}</Text> : null}
                  {product.category ? (
                    <Text style={styles.detail}>
                      Detected category: {getCategoryParts(product.category).deepestBranch}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {!loading && !product && notFound ? (
                <Text style={styles.detail}>No product found. You can still pick a category manually.</Text>
              ) : null}
            </View>

            {!loading ? (
              <>
                {product ? (
                  <>
                    <Pressable style={styles.primaryButton} onPress={confirmDetectedCategory}>
                      <Text style={styles.primaryButtonText}>Confirm Category</Text>
                    </Pressable>
                    <Pressable
                      style={styles.dangerButton}
                      onPress={() => continueToManualEntry(getCategoryParts(product.category || product.name).deepestBranch)}
                    >
                      <Text style={styles.dangerButtonText}>Edit Category</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable style={styles.primaryButton} onPress={() => continueToManualEntry()}>
                    <Text style={styles.primaryButtonText}>Choose Category Manually</Text>
                  </Pressable>
                )}

                <Pressable style={styles.secondaryButton} onPress={reset}>
                  <Text style={styles.secondaryButtonText}>Scan Again</Text>
                </Pressable>
              </>
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
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: Colors.text,
  },
  permissionMessage: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: '#d64545',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  dangerButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  resultWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
  },
  resultContent: {
    marginHorizontal: Spacing.screen,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    color: Colors.text,
  },
  detail: {
    fontSize: 15,
    color: Colors.textMuted,
    marginBottom: 4,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 24,
  },
  secondaryButton: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
});
