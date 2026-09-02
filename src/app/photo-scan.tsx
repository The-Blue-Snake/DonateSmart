import { Colors, Spacing } from '@/constants/theme';
import { classifyImageAt } from '@/lib/ml/itemClassifier';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
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
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

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
    if (!cameraRef.current || isAnalyzing) {
      return;
    }

    try {
      setIsAnalyzing(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (!photo?.uri) {
        throw new Error('The camera did not return a photo.');
      }

      // Freeze the camera on the exact photo that was captured.
      setCapturedUri(photo.uri);

      const predictions = await classifyImageAt(photo.uri);

      console.log(
        'Mistral predictions:',
        predictions.map((prediction) => prediction.label),
      );

      const primaryPrediction = predictions[0];

      router.replace({
        pathname: '/manual-entry',
        params: {
          prefill: primaryPrediction?.label ?? '',
          suggestions: JSON.stringify(
            predictions.slice(1).map((prediction) => prediction.label),
          ),
        },
      });
    } catch (error) {
      console.error('Image recognition failed:', error);

      router.replace({
        pathname: '/manual-entry',
        params: {
          prefill: '',
          suggestions: '[]',
        },
      });
    }
  };

  return (
    <View style={styles.blackContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
      />

      {capturedUri && (
        <Image
          source={{ uri: capturedUri }}
          style={styles.capturedImage}
          resizeMode="cover"
        />
      )}

      {isAnalyzing ? (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator
            size="large"
            color={Colors.white}
          />

          <Text style={styles.analyzingText}>
            Identifying item…
          </Text>
        </View>
      ) : (
        <View style={styles.captureBar}>
          <Pressable
            style={({ pressed }) => [
              styles.captureButton,
              pressed && styles.captureButtonPressed,
            ]}
            onPress={handleCapture}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
        </View>
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

  capturedImage: {
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
});