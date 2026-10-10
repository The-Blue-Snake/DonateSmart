import { useAppTabNavigation } from '@/components/app-tab-navigation';
import { Colors, Spacing } from '@/constants/theme';
import type { TaxonomyCategory } from '@/constants/types';
import { classifyImageAt } from '@/lib/vision/itemClassifier';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PhotoScan() {
  const { navigateToTab } = useAppTabNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [detectedCategory, setDetectedCategory] =
    useState<TaxonomyCategory | null>(null);
  const [needsReview, setNeedsReview] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const classificationAbortController = useRef<AbortController | null>(null);
  const detectedCategoryName = detectedCategory?.name ?? '';

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (classificationAbortController.current) {
          console.log(
            'Photo scan closed; cancelling image classification and Gemini requests.',
          );
        }
        classificationAbortController.current?.abort();
        classificationAbortController.current = null;
      };
    }, []),
  );

  const clearClassificationResult = () => {
    setDetectedCategory(null);
    setNeedsReview(false);
  };

  const resetScanFlow = () => {
    setCapturedUri(null);
    clearClassificationResult();
  };

  if (!permission) {
    return <View style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Text style={styles.permissionIconText}>⌾</Text>
          </View>

          <View style={styles.permissionContent}>
            <Text style={styles.permissionTitle}>
              Camera access needed
            </Text>

            <Text style={styles.permissionMessage}>
              DonateSmart uses your camera to help identify items without
              barcodes.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={requestPermission}
          >
            <Text style={styles.primaryButtonText}>
              Enable Camera
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || isAnalyzing) {
      return;
    }

    const abortController = new AbortController();
    classificationAbortController.current = abortController;

    try {
      setIsCapturing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (abortController.signal.aborted) {
        return;
      }

      if (!photo?.uri) {
        throw new Error('The camera did not return a photo.');
      }

      setCapturedUri(photo.uri);
      setIsAnalyzing(true);

      const result = await classifyImageAt(
        photo.uri,
        abortController.signal,
      );

      if (abortController.signal.aborted) {
        return;
      }

      if (result) {
        setDetectedCategory(result.category);
        setNeedsReview(result.needsReview);
      } else {
        clearClassificationResult();
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        console.error('Image recognition failed:', error);
        clearClassificationResult();
      }
    } finally {
      if (classificationAbortController.current === abortController) {
        classificationAbortController.current = null;
        setIsCapturing(false);
        setIsAnalyzing(false);
      }
    }
  };

  const confirmDetectedCategory = () => {
    if (!detectedCategory) {
      return;
    }

    router.dismiss();
    navigateToTab('centers', {
      category: detectedCategory.fullPath,
      topLevel: detectedCategory.topLevel,
      name: detectedCategory.name,
    });
  };

  const editCategory = () => {
    router.replace({
      pathname: '/manual-entry',
      params: {
        prefill: detectedCategoryName,
      },
    });
  };

  const retakePicture = () => {
    resetScanFlow();
  };

  const hasDetectedCategory = Boolean(detectedCategory);
  const showCamera = !capturedUri;
  const showResult = capturedUri && !isAnalyzing;

  const getPrimaryButtonStyle = (pressed: boolean) => [
    styles.primaryButton,
    pressed && styles.primaryButtonPressed,
  ];

  const getSecondaryButtonStyle = (pressed: boolean) => [
    styles.secondaryActionButton,
    pressed && styles.secondaryActionButtonPressed,
  ];

  const getCaptureButtonStyle = (pressed: boolean) => [
    styles.captureButton,
    pressed && styles.captureButtonPressed,
  ];

  return (
    <View style={styles.blackContainer}>
      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
        />
      ) : null}

      {capturedUri ? (
        <Image
          source={{ uri: capturedUri }}
          style={styles.capturedImage}
          resizeMode="cover"
        />
      ) : null}

      {isAnalyzing ? (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator
            size="large"
            color={Colors.white}
          />

          <Text style={styles.analyzingText}>Identifying item…</Text>
        </View>
      ) : null}

      {showResult ? (
        <SafeAreaView style={styles.resultWrap}>
          <View style={styles.resultContent}>
            <View style={styles.card}>
              <Text style={styles.resultLabel}>CONFIRM CATEGORY</Text>

              <View style={styles.cardDivider} />

              {hasDetectedCategory ? (
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>
                    {detectedCategory?.name}
                  </Text>

                  <Text style={styles.categoryPath}>
                    {detectedCategory?.fullPath}
                  </Text>

                  {needsReview ? (
                    <View style={styles.reviewBadge}>
                      <Text style={styles.reviewBadgeText}>
                        Best guess — please double check
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.notFoundState}>
                  <Text style={styles.notFoundTitle}>Category not found</Text>

                  <Text style={styles.notFoundText}>
                    You can choose a category manually.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.actions}>
              {hasDetectedCategory ? (
                <>
                  <Pressable
                    style={({ pressed }) => getPrimaryButtonStyle(pressed)}
                    onPress={confirmDetectedCategory}
                  >
                    <Text style={styles.primaryButtonText}>Confirm Category</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => getSecondaryButtonStyle(pressed)}
                    onPress={editCategory}
                  >
                    <Text style={styles.secondaryActionText}>Edit Category</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => getPrimaryButtonStyle(pressed)}
                  onPress={editCategory}
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
                onPress={retakePicture}
              >
                <Text style={styles.scanAgainText}>Retake Picture</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      ) : null}

      {!capturedUri && !isCapturing && !isAnalyzing ? (
        <View style={styles.captureBar}>
          <Pressable
            style={({ pressed }) => getCaptureButtonStyle(pressed)}
            onPress={handleCapture}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
        </View>
      ) : null}
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

  capturedImage: {
    ...StyleSheet.absoluteFill,
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
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 22,
  },

  permissionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
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
    borderBottomWidth: 1,
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
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
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

  captureBar: {
    position: 'absolute',
    bottom: 38,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },

  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },

  captureButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },

  analyzingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },

  analyzingText: {
    color: Colors.white,
    fontSize: 16,
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
    borderWidth: 1,
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

  reviewBadge: {
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },

  reviewBadgeText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
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
    borderWidth: 1,
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